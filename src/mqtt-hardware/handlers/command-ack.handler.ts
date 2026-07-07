import { Injectable, Logger } from '@nestjs/common';
import {
  Esp32CommandAckDTO,
  Esp32CommandAckStatus,
} from '../dto/esp32-command-ack.dto';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';

export interface CommandAckRecord {
  correlation_id: string;
  comando: string;
  status: Esp32CommandAckStatus;
  codigo_hardware: string | null;
  id_processo: number | null;
  mensagem: string | null;
  erro: string | null;
  recebido_em: Date;
  topic: string;
}

@Injectable()
export class CommandAckHandler {
  private readonly logger = new Logger(CommandAckHandler.name);
  private readonly latestAcks = new Map<string, CommandAckRecord>();

  handle(message: MqttMessage): CommandAckRecord {
    const dto = MqttPayloadValidator.validateCommandAck(message.payload);
    const record = this.toRecord(dto, message.topic);

    this.latestAcks.set(record.correlation_id, record);
    this.logAck(record);

    return record;
  }

  getLatestAck(correlationId: string): CommandAckRecord | null {
    return this.latestAcks.get(correlationId) ?? null;
  }

  private toRecord(dto: Esp32CommandAckDTO, topic: string): CommandAckRecord {
    return {
      correlation_id: dto.correlation_id,
      comando: dto.comando,
      status: dto.status,
      codigo_hardware: dto.codigo_hardware ?? null,
      id_processo: dto.id_processo ?? null,
      mensagem: dto.mensagem ?? null,
      erro: dto.erro ?? null,
      recebido_em: new Date(dto.recebido_em),
      topic,
    };
  }

  private logAck(record: CommandAckRecord): void {
    const message =
      `ACK MQTT recebido. Comando: ${record.comando}. ` +
      `Status: ${record.status}. ` +
      `Correlation ID: ${record.correlation_id}. ` +
      `Hardware: ${record.codigo_hardware ?? 'nao informado'}.`;

    if (record.status === Esp32CommandAckStatus.ERRO) {
      this.logger.error(`${message} Erro: ${record.erro ?? 'nao informado'}.`);
      return;
    }

    if (record.status === Esp32CommandAckStatus.RECUSADO) {
      this.logger.warn(
        `${message} Motivo: ${record.mensagem ?? 'nao informado'}.`,
      );
      return;
    }

    this.logger.log(message);
  }
}
