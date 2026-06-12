import { Injectable, Logger } from '@nestjs/common';
import {
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
} from '@prisma/client';
import type { alarmes } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';
import { MqttMessageHandler } from './interfaces/mqtt-message-handler.interface';
import { MqttAlarmHandlerResult } from './interfaces/mqtt-handler-results.interfaces';

type AlarmPayload = ReturnType<typeof MqttPayloadValidator.validateAlarm>;
type AlarmOriginReference = {
  id_processo?: number | null;
  id_processo_tanque?: number | null;
  id_processo_tanque_sensor?: number | null;
};

@Injectable()
export class AlarmsHandler implements MqttMessageHandler<MqttAlarmHandlerResult | null> {
  private readonly logger = new Logger(AlarmsHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(message: MqttMessage): Promise<MqttAlarmHandlerResult | null> {
    const dto = MqttPayloadValidator.validateAlarm(message.payload);

    if (!this.hasOriginReference(dto)) {
      this.logger.warn(
        `Alarme MQTT ignorado: nenhuma referência de origem informada.` +
          `Tópico: ${message.topic}. Título: ${dto.titulo}.`,
      );

      return null;
    }

    const referencesAreValid = await this.validateOriginReferences(dto);

    if (!referencesAreValid) {
      return null;
    }

    const alarm = await this.createdAlarm(message, dto);
    this.logAlarmCreated(alarm, message.topic);
    return this.buildAlarmHandlerResult(alarm, message.topic);
  }

  private buildAlarmHandlerResult(
    alarm: alarmes,
    topic: string,
  ): MqttAlarmHandlerResult {
    return {
      id_alarme: alarm.id_alarme,
      titulo: alarm.titulo,
      descricao: alarm.descricao,
      tipo_alarme: alarm.tipo_alarme,
      severidade: alarm.severidade,
      status_alarme: alarm.status_alarme,
      origem_alarme: alarm.origem_alarme,
      valor_detectado: alarm.valor_detectado?.toString() ?? null,
      unidade: alarm.unidade,
      ocorrido_em: alarm.ocorrido_em,
      resolvido_em: alarm.resolvido_em,
      id_processo: alarm.id_processo,
      id_processo_tanque: alarm.id_processo_tanque,
      id_processo_tanque_sensor: alarm.id_processo_tanque_sensor,
      topic,
    };
  }

  private async createdAlarm(
    message: MqttMessage,
    dto: AlarmPayload,
  ): Promise<alarmes> {
    const ocorridoEm = dto.ocorrido_em ?? message.receivedAt;

    return await this.prisma.alarmes.create({
      data: {
        id_mqtt_mensagem: null,
        id_usuario_responsavel: null,
        titulo: dto.titulo,
        descricao: dto.descricao,
        tipo_alarme: dto.tipo_alarme ?? tipoalarme.ESP32,
        origem_alarme: dto.origem_alarme ?? origemalarme.ESP32,
        severidade: dto.severidade ?? severidadealarme.MEDIO,
        status_alarme: statusalarme.ATIVO,
        valor_detectado: dto.valor_detectado ?? null,
        unidade: dto.unidade ?? null,
        ocorrido_em: ocorridoEm,
        resolvido_em: null,
        excluido_em: null,
        id_processo: dto.id_processo ?? null,
        id_processo_tanque: dto.id_processo_tanque ?? null,
        id_processo_tanque_sensor: dto.id_processo_tanque_sensor ?? null,
      },
    });
  }

  private hasOriginReference(reference: AlarmOriginReference): boolean {
    return Boolean(
      reference.id_processo ||
      reference.id_processo_tanque ||
      reference.id_processo_tanque_sensor,
    );
  }

  private async validateOriginReferences(
    reference: AlarmOriginReference & { titulo: string },
  ): Promise<boolean> {
    if (reference.id_processo) {
      const exist = await this.prisma.processos.count({
        where: {
          id_processo: reference.id_processo,
        },
      });

      if (exist === 0) {
        this.logger.warn(
          `Alarme MQTT ignorado: processo ${reference.id_processo} não esperado.` +
            `Título: ${reference.titulo}`,
        );

        return false;
      }
    }

    if (reference.id_processo_tanque) {
      const exist = await this.prisma.processostanques.count({
        where: {
          id_processo_tanque: reference.id_processo_tanque,
        },
      });

      if (exist === 0) {
        this.logger.warn(
          `Alarme MQTT ignorado: processo/tanque ${reference.id_processo_tanque} não esperado.` +
            `Título: ${reference.titulo}`,
        );

        return false;
      }
    }

    if (reference.id_processo_tanque_sensor) {
      const exist = await this.prisma.processostanquessensores.count({
        where: {
          id_processo_tanque_sensor: reference.id_processo_tanque_sensor,
        },
      });

      if (exist === 0) {
        this.logger.warn(
          `Alarme MQTT ignorado: processo/tanque/sensor ${reference.id_processo_tanque_sensor} não esperado.` +
            `Título: ${reference.titulo}`,
        );

        return false;
      }
    }

    return true;
  }

  private logAlarmCreated(alarm: alarmes, topic: string): void {
    const message =
      `Alarme criado via MQTT. ID ${alarm.id_alarme}.` +
      `Tópico: ${topic}. Tipo: ${alarm.tipo_alarme}.` +
      `Severidade: ${alarm.severidade}. Origem: ${alarm.origem_alarme}.` +
      `Título: ${alarm.titulo}`;

    if (alarm.severidade === severidadealarme.CRITICO) {
      this.logger.error(message);
      return;
    }

    if (alarm.severidade === severidadealarme.MEDIO) {
      this.logger.warn(message);
      return;
    }

    this.logger.log(message);
  }
}
