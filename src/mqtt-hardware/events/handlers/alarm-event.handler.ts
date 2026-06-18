import { Injectable, Logger } from '@nestjs/common';
import {
  origemalarme,
  origemlogoperacional,
  Prisma,
  resultadooperacao,
  severidadealarme,
  statusalarme,
  tipoalarme,
  tipologoperacional,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { MqttSocketGateway } from '@/mqtt-hardware/socket/mqtt-socket.gateway';
import type {
  AlarmClassificationResult,
  AlarmRequiredClassificationResult,
} from '../interfaces';
import { Decimal } from '@prisma/client/runtime/client';

export interface AlarmEventHandlerResult {
  alarmCreated: boolean;
  id_alarme?: number;
  socketEmitted: boolean;
  operationalLogCreated: boolean;
  message: string;
}

type CreatedAlarmData = {
  id_alarme: number;
  titulo: string;
  descricao: string;
  tipo_alarme: tipoalarme;
  severidade: severidadealarme;
  status_alarme: statusalarme;
  origem_alarme: origemalarme;
  valor_detectado: Decimal | null;
  unidade: string | null;
  ocorrido_em: Date;
  id_processo: number | null;
  id_processo_tanque: number | null;
  id_processo_tanque_sensor: number | null;
  id_mqtt_mensagem: number | null;
};

@Injectable()
export class AlarmEventHandler {
  private readonly logger = new Logger(AlarmEventHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttSocketGateway: MqttSocketGateway,
  ) {}

  async handleClassification(
    classification: AlarmClassificationResult,
  ): Promise<AlarmEventHandlerResult> {
    if (!classification.shouldCreateAlarm) {
      return {
        alarmCreated: false,
        socketEmitted: false,
        operationalLogCreated: false,
        message: classification.reason,
      };
    }

    if (!this.canPersistAlarm(classification)) {
      this.logger.warn(
        `Alarme não persistido por falta de referência operacional ou MQTT. Título: ${classification.titulo}`,
      );

      return {
        alarmCreated: false,
        socketEmitted: false,
        operationalLogCreated: false,
        message:
          'Alarme classificado, mas não persistido por falta de referência operacional ou MQTT.',
      };
    }

    const alarm = await this.createAlarm(classification);
    const socketEmitted = this.emitAlarm(alarm, classification);
    const operationalLogCreated = await this.createOperationalLog({
      alarm,
      classification,
    });

    return {
      alarmCreated: true,
      id_alarme: alarm.id_alarme,
      socketEmitted,
      operationalLogCreated,
      message: `Alarme ${alarm.id_alarme} criado com sucesso.`,
    };
  }

  private async createAlarm(
    classification: AlarmRequiredClassificationResult,
  ): Promise<CreatedAlarmData> {
    return await this.prisma.alarmes.create({
      data: {
        id_mqtt_mensagem: classification.id_mqtt_mensagem ?? null,
        id_usuario_responsavel: classification.id_usuario_responsavel ?? null,
        titulo: classification.titulo,
        descricao: classification.descricao,
        tipo_alarme: classification.tipo_alarme,
        severidade: classification.severidade,
        status_alarme: statusalarme.ATIVO,
        origem_alarme: classification.origem_alarme,
        valor_detectado: classification.valor_detectado ?? null,
        unidade: classification.unidade ?? null,
        ocorrido_em: new Date(),
        id_processo: classification.id_processo ?? null,
        id_processo_tanque: classification.id_processo_tanque ?? null,
        id_processo_tanque_sensor:
          classification.id_processo_tanque_sensor ?? null,
      },
      select: {
        id_alarme: true,
        titulo: true,
        descricao: true,
        tipo_alarme: true,
        severidade: true,
        status_alarme: true,
        origem_alarme: true,
        valor_detectado: true,
        unidade: true,
        ocorrido_em: true,
        id_processo: true,
        id_processo_tanque: true,
        id_processo_tanque_sensor: true,
        id_mqtt_mensagem: true,
      },
    });
  }

  private emitAlarm(
    alarm: CreatedAlarmData,
    classification: AlarmRequiredClassificationResult,
  ): boolean {
    try {
      this.mqttSocketGateway.emitAlarm({
        id_alarme: alarm.id_alarme,
        titulo: alarm.titulo,
        descricao: alarm.descricao,
        tipo_alarme: alarm.tipo_alarme,
        severidade: alarm.severidade,
        status_alarme: alarm.status_alarme,
        origem_alarme: alarm.origem_alarme,
        id_processo: alarm.id_processo,
        id_processo_tanque: alarm.id_processo_tanque,
        id_processo_tanque_sensor: alarm.id_processo_tanque_sensor,
        id_mqtt_mensagem: alarm.id_mqtt_mensagem,
        valor_detectado: this.decimalToNumber(alarm.valor_detectado),
        unidade: alarm.unidade,
        ocorrido_em: alarm.ocorrido_em,
        shouldTriggerEmergencyStop: classification.shouldTriggerEmergencyStop,
        enviado_em: new Date(),
        resolvido_em: null,
        topic: null,
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao emitir alarme via socket.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private async createOperationalLog(params: {
    alarm: CreatedAlarmData;
    classification: AlarmRequiredClassificationResult;
  }): Promise<boolean> {
    const { alarm, classification } = params;

    try {
      await this.prisma.logsoperacionais.create({
        data: {
          id_usuario: classification.id_usuario_responsavel ?? null,
          id_processo: classification.id_processo ?? null,

          tipo_log: tipologoperacional.ALARME,
          acao: 'ALARME_CRIADO_AUTOMATICAMENTE',
          descricao:
            `Alarme criado automaticamente. ` +
            `ID: ${alarm.id_alarme}. ` +
            `Título: ${classification.titulo}. ` +
            `Tipo: ${classification.tipo_alarme}. ` +
            `Severidade: ${classification.severidade}.`,

          origem: origemlogoperacional.SISTEMA,
          resultado: resultadooperacao.SUCESSO,
        },
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao registrar log operacional.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private canPersistAlarm(
    classification: AlarmRequiredClassificationResult,
  ): boolean {
    return (
      this.hasValue(classification.id_mqtt_mensagem) ||
      this.hasValue(classification.id_processo) ||
      this.hasValue(classification.id_processo_tanque) ||
      this.hasValue(classification.id_processo_tanque_sensor)
    );
  }

  private hasValue(value: number | null | undefined): boolean {
    return value !== null && value !== undefined;
  }

  private decimalToNumber(value: Prisma.Decimal | null): number | null {
    if (value === null) {
      return null;
    }

    return value.toNumber();
  }
}
