import { Injectable, Logger } from '@nestjs/common';
import {
  origemevento,
  severidadealarme,
  severidadeevento,
  statusgeralsistema,
  tipoeventoprocesso,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MqttSocketGateway } from '@/mqtt-hardware/socket/mqtt-socket.gateway';
import { ProcessoGeneralClosureService } from '@/processos/lifecycle';
import { HardwareStatusAlarmClassifier } from '../classifiers/hardware-status-alarm.classifier';
import { EventProcessingStatus } from '../enums';
import { AlarmEventHandler } from './alarm-event.handler';
import type {
  AlarmClassificationResult,
  EventResult,
  HardwareStatusEventInput,
  ProcessEventRecord,
} from '../interfaces';

@Injectable()
export class HardwareStatusEventHandler {
  private readonly logger = new Logger(HardwareStatusEventHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hardwareStatusAlarmClassifier: HardwareStatusAlarmClassifier,
    private readonly alarmEventHandler: AlarmEventHandler,
    private readonly processoGeneralClosureService: ProcessoGeneralClosureService,
    private readonly mqttSocketGateway: MqttSocketGateway,
  ) {}

  async handle(input: HardwareStatusEventInput): Promise<EventResult> {
    try {
      const socketEmitted = this.emitHardwareStatus(input);
      const classification = this.hardwareStatusAlarmClassifier.classify(input);
      const emergencyStopSent = await this.requestEmergencyStopIfNeeded({
        input,
        classification,
      });
      const idEventoProcesso = await this.createProcessEventIfNeeded({
        input,
        classification,
      });

      const alarmResult =
        await this.alarmEventHandler.handleClassification(classification);

      const idAlarme = alarmResult.id_alarme ?? null;
      if (
        !socketEmitted &&
        !idEventoProcesso &&
        !idAlarme &&
        !emergencyStopSent
      ) {
        return {
          status: EventProcessingStatus.IGNORED,
          message:
            classification.shouldCreateAlarm === false
              ? classification.reason
              : 'Status de hardware processado sem consequência operacional.',
          id_evento_processo: undefined,
          id_alarme: undefined,
          emergencyStopSent: false,
          socketEmitted: false,
          operationalLogCreated: alarmResult.operationalLogCreated,
        };
      }

      return {
        status: EventProcessingStatus.PROCESSED,
        message: this.buildSuccessMessage({
          input,
          classification,
          idAlarme,
          idEventoProcesso,
          emergencyStopSent,
        }),
        id_evento_processo: idEventoProcesso ?? undefined,
        id_alarme: idAlarme ?? undefined,
        emergencyStopSent,
        socketEmitted: socketEmitted || alarmResult.socketEmitted,
        operationalLogCreated: alarmResult.operationalLogCreated,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao processar status do hardware.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        status: EventProcessingStatus.FAILED,
        message: 'Falha ao processar status do hardware.',
        emergencyStopSent: false,
        socketEmitted: false,
        operationalLogCreated: false,
        error: message,
      };
    }
  }

  private emitHardwareStatus(input: HardwareStatusEventInput): boolean {
    try {
      this.mqttSocketGateway.emitHardwareStatus({
        id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
        status_geral_sistema: input.status_geral_sistema,
        esp32_online: input.esp32_online,
        status_bomba_principal: input.status_bomba_principal ?? null,
        status_bomba_auxiliar: input.status_bomba_auxiliar ?? null,
        status_bombas: input.status_bombas ?? [],
        status_valvulas: input.status_valvulas ?? [],
        processo_em_execucao: input.processo_em_execucao ?? false,
        id_processo: input.id_processo ?? null,
        id_processo_tanque: input.id_processo_tanque ?? null,
        id_processo_tanque_sensor: input.id_processo_tanque_sensor ?? null,
        mensagem: input.mensagem ?? null,
        erro: input.erro ?? null,
        recebido_em: input.recebido_em,
        enviado_em: new Date(),
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao emitir status de hardware via socket.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private async createProcessEventIfNeeded(params: {
    input: HardwareStatusEventInput;
    classification: AlarmClassificationResult;
  }): Promise<number | null> {
    const { input, classification } = params;

    if (input.processo_em_execucao !== true) {
      return null;
    }

    if (!input.id_processo) {
      return null;
    }

    if (!this.shouldCreateProcessEvent(input, classification)) {
      return null;
    }

    const eventRecord = this.buildProcessEventRecord({
      input,
      classification,
    });

    const created = await this.prisma.eventos.create({
      data: eventRecord,
      select: {
        id_evento_processo: true,
      },
    });

    return created.id_evento_processo;
  }

  private shouldCreateProcessEvent(
    input: HardwareStatusEventInput,
    classification: AlarmClassificationResult,
  ): boolean {
    if (classification.shouldCreateAlarm) {
      return true;
    }

    return (
      input.status_geral_sistema === statusgeralsistema.FALHA ||
      input.status_geral_sistema === statusgeralsistema.BLOQUEADO ||
      input.status_geral_sistema === statusgeralsistema.ALERTA ||
      !input.esp32_online
    );
  }

  private buildProcessEventRecord(params: {
    input: HardwareStatusEventInput;
    classification: AlarmClassificationResult;
  }): ProcessEventRecord {
    const { input, classification } = params;

    if (!input.id_processo) {
      throw new Error(
        'Não é possível criar evento de harwdare sem id_processo.',
      );
    }

    return {
      id_processo: input.id_processo,
      id_processo_tanque_sensor: input.id_processo_tanque_sensor ?? null,
      tipo_evento: this.resolveTipoEventoProcesso(input, classification),
      origem_evento: origemevento.ESP32,
      severidade_evento: this.resolveSeveridadeEvento(classification),
      ocorrido_em: input.recebido_em,
    };
  }

  private resolveTipoEventoProcesso(
    input: HardwareStatusEventInput,
    classification: AlarmClassificationResult,
  ): tipoeventoprocesso {
    if (
      classification.shouldCreateAlarm &&
      classification.shouldTriggerEmergencyStop
    ) {
      return tipoeventoprocesso.PARADA_EMERGENCIA;
    }

    if (!input.esp32_online) {
      return tipoeventoprocesso.ESP32_DESCONECTADO;
    }

    if (
      input.status_geral_sistema === statusgeralsistema.BLOQUEADO ||
      input.status_geral_sistema === statusgeralsistema.FALHA
    ) {
      return tipoeventoprocesso.PROCESSO_FALHA;
    }

    if (input.status_geral_sistema === statusgeralsistema.ALERTA) {
      return tipoeventoprocesso.VACUO_FORA_LIMITE;
    }

    return tipoeventoprocesso.ESP32_SINCRONIZADO;
  }

  private resolveSeveridadeEvento(
    classification: AlarmClassificationResult,
  ): severidadeevento {
    if (!classification.shouldCreateAlarm) {
      return severidadeevento.INFO;
    }

    if (classification.severidade === severidadealarme.CRITICO) {
      return severidadeevento.CRITICO;
    }

    if (classification.severidade === severidadealarme.MEDIO) {
      return severidadeevento.AVISO;
    }

    return severidadeevento.INFO;
  }

  private async requestEmergencyStopIfNeeded(params: {
    input: HardwareStatusEventInput;
    classification: AlarmClassificationResult;
  }): Promise<boolean> {
    const { input, classification } = params;

    if (!classification.shouldCreateAlarm) {
      return false;
    }

    if (!classification.shouldTriggerEmergencyStop) {
      return false;
    }

    if (input.processo_em_execucao !== true) {
      return false;
    }

    await this.processoGeneralClosureService.requestEmergencyStopForCurrent({
      ...(input.id_processo ? { id_processo: input.id_processo } : {}),
      id_usuario: null,
      motivo:
        `Parada de emergência acionada automaticamente por status de hardware. ` +
        `Motivo: ${classification.titulo}. ` +
        `Processo: ${input.id_processo ?? 'não informado'}. ` +
        `Processo tanque: ${input.id_processo_tanque ?? 'não informado'}. ` +
        `Processo tanque sensor: ${
          input.id_processo_tanque_sensor ?? 'não informado'
        }.`,
    });

    this.logger.error(
      'Parada de emergência enviada por status crítico do hardware.' +
        `Processo: ${input.id_processo ?? 'não informado'}.`,
    );

    return true;
  }

  private buildSuccessMessage(parmas: {
    input: HardwareStatusEventInput;
    classification: AlarmClassificationResult;
    idAlarme: number | null;
    idEventoProcesso: number | null;
    emergencyStopSent: boolean;
  }): string {
    const {
      input,
      classification,
      idAlarme,
      idEventoProcesso,
      emergencyStopSent,
    } = parmas;

    if (!classification.shouldCreateAlarm) {
      return (
        'Status de hardware processando.' +
        `Status geral: ${input.status_geral_sistema}.` +
        `ESP32 online: ${String(input.esp32_online)}.` +
        `Resultado: ${classification.reason}.`
      );
    }

    return (
      'Status de hardware processando.' +
      `Status geral: ${input.status_geral_sistema}.` +
      `Alarme: ${idAlarme ?? 'não persistido'}.` +
      `Evento de processo: ${idEventoProcesso ?? 'não criado'}.` +
      `Parada de emergência enviada: ${emergencyStopSent ? 'sim' : 'não'}`
    );
  }
}
