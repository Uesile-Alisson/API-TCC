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

type AlarmPayload = ReturnType<typeof MqttPayloadValidator.validateAlarm>;
type AlarmOriginReference = {
  id_processo?: number | null;
  id_processo_tanque?: number | null;
  id_processo_tanque_sensor?: number | null;
};

@Injectable()
export class AlarmsHandler implements MqttMessageHandler {
  private readonly logger = new Logger(AlarmsHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(message: MqttMessage): Promise<void> {
    const dto = MqttPayloadValidator.validateAlarm(message.payload);

    if (!this.hasOriginReference(dto)) {
      this.logger.warn(
        `Alarme MQTT ignorado: nenhuma referência de origem informada.` +
          `Tópico: ${message.topic}. Título: ${dto.titulo}.`,
      );

      return;
    }

    const referencesAreValid = await this.validateOriginReferences(dto);

    if (!referencesAreValid) {
      return;
    }

    const alarm = await this.createdAlarm(message, dto);
    this.logAlarmCreated(alarm, message.topic);
    await this.handleAlarmBySeverity(alarm);
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

  private async handleAlarmBySeverity(alarm: alarmes): Promise<void> {
    if (alarm.severidade === severidadealarme.INFO) {
      this.handleInfoAlarm(alarm);
      return;
    }

    if (alarm.severidade === severidadealarme.MEDIO) {
      this.handleMediumAlarm(alarm);
      return;
    }

    if (alarm.severidade === severidadealarme.CRITICO) {
      this.handleCriticalAlarm(alarm);
      return;
    }

    this.logger.warn(
      `Alarme com severidade não tratada. ID ${alarm.id_alarme}.` +
        `Severidade: ${alarm.severidade}.`,
    );
  }

  private async handleInfoAlarm(alarm: alarmes): Promise<void> {
    this.logger.error(
      `Alarme informativo registrado. ID ${alarm.id_alarme}.` +
        `Tipo: ${alarm.tipo_alarme}. Título: ${alarm.titulo}`,
    );

    /*
      INFO:
      - baixa criticidade;
      - apenas registra;
      - não altera processo;
      - não aciona parada de emergência;
      - depois o socket enviará esse alarme para o front como evento oficial.
    */
  }

  private async handleMediumAlarm(alarm: alarmes): Promise<void> {
    this.logger.warn(
      `Alarme médio registrado. ID ${alarm.id_alarme}.` +
        `Tipo: ${alarm.tipo_alarme}. Título: ${alarm.titulo}`,
    );

    /*
      MEDIO:
      - anomalia ou atenção operacional;
      - registra e alerta operador;
      - não aciona parada automática;
      - pode futuramente gerar acompanhamento ou escalonamento.
    */
  }

  private async handleCriticalAlarm(alarm: alarmes): Promise<void> {
    this.logger.error(
      `Alarme crítico registrado. ID ${alarm.id_alarme}.` +
        `Tipo: ${alarm.tipo_alarme}. Título: ${alarm.titulo}`,
    );

    /*
      CRITICO:
      - alta criticidade;
      - se houver processo em execução relacionado, deve acionar parada de emergência;
      - futuramente vai:
        1. criar evento operacional;
        2. atualizar processo/tanque como INTERROMPIDO ou FALHA;
        3. chamar MqttCommandService.paradaEmergencia();
        4. emitir evento oficial para o dashboard via socket refatorado.

      Por enquanto, esse handler apenas cria o alarme e registra a criticidade.
    */
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
