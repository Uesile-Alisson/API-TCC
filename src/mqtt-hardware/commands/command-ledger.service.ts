import {
  BadGatewayException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, statuscomandomqtt } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CommandAckRecord } from '../handlers/command-ack.handler';
import { Esp32CommandAckStatus } from '../dto/esp32-command-ack.dto';
import { CommandName } from './interfaces/command-name.interface';
import { CommandQos } from './interfaces/command-options.interface';

export interface PreparePersistedCommandInput {
  correlationId: string;
  comando: CommandName;
  topic: string;
  payload: object;
  qos: CommandQos;
  retain: boolean;
  timeoutMs: number;
}

export interface PreparedPersistedCommand {
  shouldPublish: boolean;
  restoredAck: CommandAckRecord | null;
}

@Injectable()
export class CommandLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async prepare(
    input: PreparePersistedCommandInput,
  ): Promise<PreparedPersistedCommand> {
    const existing = await this.prisma.comandosmqtt.findUnique({
      where: { correlation_id: input.correlationId },
    });

    if (!existing) {
      try {
        await this.prisma.comandosmqtt.create({
          data: {
            correlation_id: input.correlationId,
            comando: input.comando,
            status: statuscomandomqtt.PENDENTE,
            id_processo: this.readInteger(input.payload, 'id_processo'),
            id_processo_tanque: this.readNestedInteger(
              input.payload,
              'parametros',
              'id_processo_tanque',
            ),
            id_usuario: this.readInteger(input.payload, 'solicitado_por'),
            topico_publicacao: input.topic,
            payload: this.toJson(input.payload),
            qos: input.qos,
            retain: input.retain,
            tentativas: 1,
          },
        });
        return { shouldPublish: true, restoredAck: null };
      } catch (error) {
        if (!this.isUniqueConflict(error)) {
          throw error;
        }

        return this.prepare(input);
      }
    }

    this.assertSameCommand(existing.comando, input);
    const restoredAck = this.toAckRecord(existing);
    if (restoredAck && restoredAck.status !== Esp32CommandAckStatus.RECEBIDO) {
      return { shouldPublish: false, restoredAck };
    }

    const active = new Set<statuscomandomqtt>([
      statuscomandomqtt.PENDENTE,
      statuscomandomqtt.PUBLICADO,
      statuscomandomqtt.RECEBIDO,
    ]);
    const stillWithinAttempt =
      active.has(existing.status) &&
      Date.now() - existing.atualizado_em.getTime() < input.timeoutMs;

    if (stillWithinAttempt) {
      return { shouldPublish: false, restoredAck };
    }

    const claimed = await this.prisma.comandosmqtt.updateMany({
      where: {
        id_comando_mqtt: existing.id_comando_mqtt,
        status: existing.status,
        atualizado_em: existing.atualizado_em,
      },
      data: {
        status: statuscomandomqtt.PENDENTE,
        payload: this.toJson(input.payload),
        topico_publicacao: input.topic,
        qos: input.qos,
        retain: input.retain,
        tentativas: { increment: 1 },
        publicado_em: null,
        ack_recebido_em: null,
        finalizado_em: null,
        payload_ack: Prisma.DbNull,
        topico_ack: null,
        mensagem_ack: null,
        erro: null,
        atualizado_em: new Date(),
      },
    });

    return {
      shouldPublish: claimed.count === 1,
      restoredAck: claimed.count === 1 ? null : restoredAck,
    };
  }

  async markPublished(correlationId: string, publishedAt: Date): Promise<void> {
    await this.prisma.comandosmqtt.updateMany({
      where: {
        correlation_id: correlationId,
        status: statuscomandomqtt.PENDENTE,
      },
      data: {
        status: statuscomandomqtt.PUBLICADO,
        publicado_em: publishedAt,
        atualizado_em: new Date(),
      },
    });
  }

  async recordAck(record: CommandAckRecord): Promise<void> {
    const status = this.toPersistedStatus(record.status);
    const final = status !== statuscomandomqtt.RECEBIDO;
    const updated = await this.prisma.comandosmqtt.updateMany({
      where: {
        correlation_id: record.correlation_id,
        comando: record.comando,
      },
      data: {
        status,
        topico_ack: record.topic,
        payload_ack: this.toJson({
          correlation_id: record.correlation_id,
          comando: record.comando,
          status: record.status,
          codigo_hardware: record.codigo_hardware,
          id_processo: record.id_processo,
          mensagem: record.mensagem,
          erro: record.erro,
          recebido_em: record.recebido_em.toISOString(),
        }),
        ack_recebido_em: record.recebido_em,
        finalizado_em: final ? record.recebido_em : null,
        mensagem_ack: record.mensagem,
        erro: record.erro,
        atualizado_em: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new BadGatewayException(
        `ACK ${record.correlation_id} nao corresponde a comando persistido.`,
      );
    }
  }

  async markFailure(
    correlationId: string,
    status: statuscomandomqtt,
    error: unknown,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.comandosmqtt.updateMany({
      where: {
        correlation_id: correlationId,
        status: {
          in: [
            statuscomandomqtt.PENDENTE,
            statuscomandomqtt.PUBLICADO,
            statuscomandomqtt.RECEBIDO,
          ],
        },
      },
      data: {
        status,
        erro: this.errorMessage(error),
        finalizado_em: now,
        atualizado_em: now,
      },
    });
  }

  private assertSameCommand(
    persistedCommand: string,
    input: PreparePersistedCommandInput,
  ): void {
    if (persistedCommand === input.comando) {
      return;
    }

    throw new ConflictException(
      `correlation_id ${input.correlationId} ja pertence a ${persistedCommand}, nao a ${input.comando}.`,
    );
  }

  private toAckRecord(record: {
    correlation_id: string;
    comando: string;
    status: statuscomandomqtt;
    topico_ack: string | null;
    ack_recebido_em: Date | null;
    mensagem_ack: string | null;
    erro: string | null;
    payload_ack: Prisma.JsonValue | null;
  }): CommandAckRecord | null {
    if (
      !record.ack_recebido_em ||
      !new Set<statuscomandomqtt>([
        statuscomandomqtt.RECEBIDO,
        statuscomandomqtt.EXECUTADO,
        statuscomandomqtt.RECUSADO,
        statuscomandomqtt.ERRO,
      ]).has(record.status)
    ) {
      return null;
    }

    const ack = this.asRecord(record.payload_ack);
    return {
      correlation_id: record.correlation_id,
      comando: record.comando,
      status: record.status as CommandAckRecord['status'],
      codigo_hardware: this.readString(ack, 'codigo_hardware'),
      id_processo: this.readInteger(ack, 'id_processo'),
      mensagem: record.mensagem_ack,
      erro: record.erro,
      recebido_em: record.ack_recebido_em,
      topic: record.topico_ack ?? 'mqtt/ack/persistido',
    };
  }

  private toPersistedStatus(
    status: CommandAckRecord['status'],
  ): statuscomandomqtt {
    return statuscomandomqtt[status];
  }

  private toJson(value: object): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private readInteger(value: object, key: string): number | null {
    const candidate = (value as Record<string, unknown>)[key];
    return Number.isInteger(candidate) ? (candidate as number) : null;
  }

  private readNestedInteger(
    value: object,
    parent: string,
    key: string,
  ): number | null {
    const nested = (value as Record<string, unknown>)[parent];
    return nested && typeof nested === 'object' && !Array.isArray(nested)
      ? this.readInteger(nested, key)
      : null;
  }

  private readString(
    value: Record<string, unknown>,
    key: string,
  ): string | null {
    const candidate = value[key];
    return typeof candidate === 'string' ? candidate : null;
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
