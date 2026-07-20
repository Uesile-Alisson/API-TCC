import { Injectable, Logger } from '@nestjs/common';
import {
  origemevento,
  severidadealarme,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MqttSocketGateway } from '@/mqtt-hardware/socket/mqtt-socket.gateway';
import { ProcessoGeneralClosureService } from '@/processos/lifecycle';
import { ReadingAlarmClassifier } from '../classifiers/reading-alarm.classifier';
import { EventProcessingStatus } from '../enums';
import { AlarmEventHandler } from './alarm-event.handler';
import type {
  AlarmClassificationResult,
  AlarmRequiredClassificationResult,
  EventResult,
  ProcessEventRecord,
  SensorReadingEventInput,
} from '../interfaces';

@Injectable()
export class ReadingEventHandler {
  private readonly logger = new Logger(ReadingEventHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readingAlaarmClassifier: ReadingAlarmClassifier,
    private readonly alarmEventHandler: AlarmEventHandler,
    private readonly processoGeneralClosureService: ProcessoGeneralClosureService,
    private readonly mqttSocketGateway: MqttSocketGateway,
  ) {}

  async handle(input: SensorReadingEventInput): Promise<EventResult> {
    try {
      const socketEmitted = this.emitSensorReading(input);
      const classification = await this.readingAlaarmClassifier.classify(input);
      const emergencyStopSent = await this.requestEmergencyStopIfNeeded({
        input,
        classification,
      });
      const idEventoProcesso =
        await this.createProcessEventIfNeeded(classification);
      const alarmResult =
        await this.alarmEventHandler.handleClassification(classification);
      const idAlarme = alarmResult.id_alarme ?? null;

      if (!idEventoProcesso && !idAlarme && !emergencyStopSent) {
        return {
          status: EventProcessingStatus.IGNORED,
          message:
            classification.shouldCreateAlarm === false
              ? classification.reason
              : 'Leitura de sensor processada sem consequência operacional persistida.',
          id_evento_processo: undefined,
          id_alarme: undefined,
          emergencyStopSent: false,
          socketEmitted: socketEmitted || alarmResult.socketEmitted,
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
          : 'Erro desconhecido ao processar leitura de sensor.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        status: EventProcessingStatus.FAILED,
        message: 'Falha ao processar leitura de sensor.',
        emergencyStopSent: false,
        socketEmitted: false,
        operationalLogCreated: false,
        error: message,
      };
    }
  }

  private emitSensorReading(input: SensorReadingEventInput): boolean {
    try {
      this.mqttSocketGateway.emitSensorReading({
        id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
        id_leitura_sensor: input.id_leitura_sensor,
        id_processo_tanque_sensor: input.id_processo_tanque_sensor,
        valor_vacuo: input.valor_vacuo.toNumber(),
        leitura_em: input.leitura_em,
        recebido_em: input.recebido_em,
        enviado_em: new Date(),
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao emitir leitura de sensor via socket.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private async createProcessEventIfNeeded(
    classification: AlarmClassificationResult,
  ): Promise<number | null> {
    if (!classification.shouldCreateAlarm) {
      return null;
    }

    if (!classification.id_processo) {
      return null;
    }

    const eventRecord = this.buildProcessEventRecord(classification);

    const created = await this.prisma.eventos.create({
      data: eventRecord,
      select: {
        id_evento_processo: true,
      },
    });

    return created.id_evento_processo;
  }

  private buildProcessEventRecord(
    classification: AlarmRequiredClassificationResult,
  ): ProcessEventRecord {
    if (!classification.id_processo) {
      throw new Error(
        'Não é possível criar evento de leitura sem id_processo.',
      );
    }

    return {
      id_processo: classification.id_processo,
      id_processo_tanque_sensor:
        classification.id_processo_tanque_sensor ?? null,
      tipo_evento: this.resolveTipoEventoProcesso(classification),
      origem_evento: origemevento.SENSOR,
      severidade_evento: this.resolveSeveridadeEvento(classification),
      ocorrido_em: new Date(),
    };
  }

  private resolveTipoEventoProcesso(
    classification: AlarmRequiredClassificationResult,
  ): tipoeventoprocesso {
    if (classification.shouldTriggerEmergencyStop) {
      return tipoeventoprocesso.PARADA_EMERGENCIA;
    }

    return tipoeventoprocesso.VACUO_FORA_LIMITE;
  }

  private resolveSeveridadeEvento(
    classification: AlarmRequiredClassificationResult,
  ): severidadeevento {
    if (classification.severidade === severidadealarme.CRITICO) {
      return severidadeevento.CRITICO;
    }

    if (classification.severidade === severidadealarme.MEDIO) {
      return severidadeevento.AVISO;
    }

    return severidadeevento.INFO;
  }

  private async requestEmergencyStopIfNeeded(params: {
    input: SensorReadingEventInput;
    classification: AlarmClassificationResult;
  }): Promise<boolean> {
    const { input, classification } = params;

    if (!classification.shouldCreateAlarm) {
      return false;
    }

    if (!classification.shouldTriggerEmergencyStop) {
      return false;
    }

    await this.processoGeneralClosureService.requestEmergencyStopForCurrent({
      ...(classification.id_processo
        ? { id_processo: classification.id_processo }
        : {}),
      id_usuario: null,
      motivo:
        `Parada de emergência acionada automaticamente por leitura crítica de vácuo. ` +
        `Motivo: ${classification.titulo}. ` +
        `Processo: ${classification.id_processo ?? 'não informado'}. ` +
        `Processo tanque: ${
          classification.id_processo_tanque ?? 'não informado'
        }. ` +
        `Processo tanque sensor: ${input.id_processo_tanque_sensor}. ` +
        `Valor detectado: ${input.valor_vacuo.toNumber()}.`,
    });

    this.logger.error(
      `Parada de emergência enviada por leitura crítica de vácuo. ` +
        `PTS: ${input.id_processo_tanque_sensor}. ` +
        `Valor: ${input.valor_vacuo.toNumber()}.`,
    );

    return true;
  }

  private buildSuccessMessage(params: {
    input: SensorReadingEventInput;
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
    } = params;

    if (!classification.shouldCreateAlarm) {
      return (
        `Leitura de sensor processada. ` +
        `Leitura: ${input.id_leitura_sensor}. ` +
        `Valor: ${input.valor_vacuo.toNumber()}. ` +
        `Resultado: ${classification.reason}.`
      );
    }

    return (
      `Leitura de sensor processada com alarme. ` +
      `Leitura: ${input.id_leitura_sensor}. ` +
      `Valor: ${input.valor_vacuo.toNumber()}. ` +
      `Alarme: ${idAlarme ?? 'não persistido'}. ` +
      `Evento de processo: ${idEventoProcesso ?? 'não criado'}. ` +
      `Parada de emergência enviada: ${emergencyStopSent ? 'sim' : 'não'}.`
    );
  }
}
