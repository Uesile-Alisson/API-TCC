import { Injectable, Logger } from '@nestjs/common';
import {
  origemevento,
  severidadealarme,
  severidadeevento,
  StatusAcoplamentoMangueira,
  tipoeventoprocesso,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AcoplamentoContextCacheService } from '../cache';
import { AcoplamentoAlarmClassifier } from '../classifiers/acoplamento-alarm.classifier';
import { EventProcessingStatus } from '../enums';
import { CommandService } from '@/mqtt-hardware/commands/command.service';
import { MqttSocketGateway } from '@/mqtt-hardware/socket/mqtt-socket.gateway';
import { AlarmEventHandler } from './alarm-event.handler';
import type {
  AcoplamentoEventInput,
  AcoplamentoOperationalContext,
  AlarmClassificationResult,
  EventResult,
  ProcessEventRecord,
} from '../interfaces';

@Injectable()
export class AcoplamentoEventHandler {
  private readonly logger = new Logger(AcoplamentoEventHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acoplamentoContextCache: AcoplamentoContextCacheService,
    private readonly acoplamentoAlarmClassifier: AcoplamentoAlarmClassifier,
    private readonly commandService: CommandService,
    private readonly alarmEventHandler: AlarmEventHandler,
    private readonly mqttSocketGateway: MqttSocketGateway,
  ) {}

  async handle(input: AcoplamentoEventInput): Promise<EventResult> {
    try {
      const context = await this.acoplamentoContextCache.getContext({
        id_sensor: input.id_sensor,
        id_tanque: input.id_tanque,
      });

      const classification = this.acoplamentoAlarmClassifier.classify({
        input,
        context,
      });

      const idEventoProcesso = await this.creatProcessEventIfNeeded({
        input,
        context,
        classification,
      });

      const socketEmitted = this.emitSensorAcoplamentoUpdated({
        input,
        context,
      });

      const alarmResult =
        await this.alarmEventHandler.handleClassification(classification);

      const idAlarme = alarmResult.id_alarme ?? null;

      const emergencyStopSent = await this.requestEmergencyStopIfNeeded({
        context,
        classification,
      });

      if (!idEventoProcesso && !idAlarme && !emergencyStopSent) {
        return {
          status: EventProcessingStatus.IGNORED,
          message:
            classification.shouldCreateAlarm === false
              ? classification.reason
              : 'Evento de acoplamento processado sem consequência operacional persistente.',
          id_evento_processo: idEventoProcesso,
          id_alarme: undefined,
          emergencyStopSent: false,
          socketEmitted: false,
          operationalLogCreated: false,
        };
      }

      return {
        status: EventProcessingStatus.PROCESSED,
        message: this.buildSuccessMessage({
          input,
          context,
          classification,
          idAlarme,
          idProcessoEvento: idEventoProcesso,
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
          : 'Erro desconhecido ao processar evento de acoplamento.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        status: EventProcessingStatus.FAILED,
        message: 'Falha ao processar evento de acoplamento.',
        emergencyStopSent: false,
        socketEmitted: false,
        operationalLogCreated: false,
        error: message,
      };
    }
  }

  private emitSensorAcoplamentoUpdated(params: {
    input: AcoplamentoEventInput;
    context: AcoplamentoOperationalContext;
  }): boolean {
    const { input, context } = params;

    try {
      this.mqttSocketGateway.emitSensorAcoplamento({
        id_sensor: input.id_sensor,
        id_tanque: input.id_tanque,
        id_processo: context.processo_em_execucao ? context.id_processo : null,
        id_processo_tanque: context.processo_em_execucao
          ? context.id_processo_tanque
          : null,
        id_processo_tanque_sensor: context.processo_em_execucao
          ? context.id_processo_tanque_sensor
          : null,
        status_acoplamento: input.status_acoplamento,
        status_anterior: input.status_anterior ?? null,
        sinal_detectado: input.sinal_detectado,
        status_mudou: input.status_mudou,
        processo_em_execucao: context.processo_em_execucao,
        ultima_verificacao: input.ultima_verificacao,
        enviado_em: new Date(),
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error desconhecido ao emitir status de acoplamento via socket.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private async creatProcessEventIfNeeded(params: {
    input: AcoplamentoEventInput;
    context: AcoplamentoOperationalContext;
    classification: AlarmClassificationResult;
  }): Promise<number | null> {
    const { input, context, classification } = params;

    if (!context.processo_em_execucao) {
      return null;
    }

    if (!input.status_mudou && classification.shouldCreateAlarm === false) {
      return null;
    }

    const eventRecord = this.buildProcessEventRecord({
      input,
      context,
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

  private buildProcessEventRecord(params: {
    input: AcoplamentoEventInput;
    context: AcoplamentoOperationalContext;
    classification: AlarmClassificationResult;
  }): ProcessEventRecord {
    const { input, context, classification } = params;

    if (!context.processo_em_execucao) {
      throw new Error(
        'Não é possível criar evento de processo sem processo em execução.',
      );
    }

    return {
      id_processo: context.id_processo,
      id_processo_tanque_sensor: context.id_processo_tanque_sensor,
      tipo_evento: this.resolveTipoEventoProcesso(input),
      origem_evento: origemevento.SISTEMA,
      severidade_evento: this.resolveSeveridadeEvento(classification),
      ocorrido_em: input.ultima_verificacao,
    };
  }

  private resolveTipoEventoProcesso(
    input: AcoplamentoEventInput,
  ): tipoeventoprocesso {
    if (input.status_acoplamento === StatusAcoplamentoMangueira.ACOPLADA) {
      return tipoeventoprocesso.SENSOR_ATIVO;
    }

    if (
      input.status_acoplamento === StatusAcoplamentoMangueira.DESACOPLADA ||
      input.status_acoplamento === StatusAcoplamentoMangueira.FALHA
    ) {
      return tipoeventoprocesso.SENSOR_DESCONECTADO;
    }

    return tipoeventoprocesso.SENSOR_OSCILANDO;
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
    context: AcoplamentoOperationalContext;
    classification: AlarmClassificationResult;
  }): Promise<boolean> {
    const { context, classification } = params;

    if (!classification.shouldCreateAlarm) {
      return false;
    }

    if (!classification.shouldTriggerEmergencyStop) {
      return false;
    }

    if (!context.processo_em_execucao) {
      return false;
    }

    await this.commandService.paradaEmergencia({
      motivo:
        'Parada de emergência acionada automaticament.' +
        `Motivo: ${classification.titulo}.` +
        `Processo: ${context.id_processo}.` +
        `Processo tanque: ${context.id_processo_tanque}.` +
        `Processo tanque sensor: ${context.id_processo_tanque_sensor}.`,
    });

    this.logger.error(
      'Parada de emergência enviado por acoplamento crítico.' +
        `Processo: ${context.id_processo}.` +
        `PTS: ${context.id_processo_tanque_sensor}.`,
    );

    return true;
  }

  private buildSuccessMessage(params: {
    input: AcoplamentoEventInput;
    context: AcoplamentoOperationalContext;
    classification: AlarmClassificationResult;
    idAlarme: number | null;
    idProcessoEvento: number | null;
    emergencyStopSent: boolean;
  }): string {
    const { input, context, classification, idAlarme, idProcessoEvento } =
      params;

    const contexto = context.processo_em_execucao
      ? `processo ${context.id_processo}.`
      : `sensor ${input.id_sensor} / tanque ${input.id_tanque}.`;

    if (!classification.shouldCreateAlarm) {
      return `Evento de acopplamento processado para ${contexto}: ${classification.reason}.`;
    }

    return [
      `Evento de acoplamento processado para ${contexto}.` +
        `Status: ${input.status_acoplamento}.` +
        `Alarme: ${idAlarme ?? 'não persistido'}.` +
        `Evento de processo: ${idProcessoEvento ?? 'não criado'}.` +
        `Parada de emergência requerida: ${classification.shouldTriggerEmergencyStop ? 'sim' : 'não'}.`,
    ].join(' ');
  }
}
