import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandName } from '../commands/interfaces/command-name.interface';
import {
  Esp32CommandAckDTO,
  Esp32CommandAckStatus,
} from '../dto/esp32-command-ack.dto';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';
import { CommandLedgerService } from '../commands/command-ledger.service';

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

export interface CommandAckWaitRegistration {
  promise: Promise<CommandAckRecord>;
  shouldPublish: boolean;
  cancel: (reason?: unknown) => void;
}

interface PendingCommandAck {
  expectedCommand: CommandName;
  promise: Promise<CommandAckRecord>;
  resolve: (record: CommandAckRecord) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

@Injectable()
export class CommandAckHandler implements OnModuleDestroy {
  private readonly logger = new Logger(CommandAckHandler.name);
  private readonly maxRecentAcks = 1000;
  private readonly latestAcks = new Map<string, CommandAckRecord>();
  private readonly pendingAcks = new Map<string, PendingCommandAck>();

  constructor(
    @Optional() private readonly commandLedgerService?: CommandLedgerService,
  ) {}

  handle(message: MqttMessage): CommandAckRecord {
    const dto = MqttPayloadValidator.validateCommandAck(message.payload);
    const record = this.toRecord(dto, message.topic);

    this.rememberAck(record);
    this.settlePendingWait(record);
    this.logAck(record);

    return record;
  }

  async handleAndPersist(message: MqttMessage): Promise<CommandAckRecord> {
    const dto = MqttPayloadValidator.validateCommandAck(message.payload);
    const record = this.toRecord(dto, message.topic);

    await this.commandLedgerService?.recordAck(record);
    this.rememberAck(record);
    this.settlePendingWait(record);
    this.logAck(record);

    return record;
  }

  restorePersistedAck(record: CommandAckRecord): void {
    this.rememberAck(record);
  }

  getLatestAck(correlationId: string): CommandAckRecord | null {
    return this.latestAcks.get(correlationId) ?? null;
  }

  waitForFinalAck(
    correlationId: string,
    expectedCommand: CommandName,
    timeoutMs: number,
  ): CommandAckWaitRegistration {
    const normalizedCorrelationId = correlationId.trim();

    if (!normalizedCorrelationId) {
      throw new BadRequestException(
        'correlation_id e obrigatorio para aguardar ACK do ESP32.',
      );
    }

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new BadRequestException(
        'Timeout de ACK deve ser um inteiro maior que zero.',
      );
    }

    const cachedAck = this.latestAcks.get(normalizedCorrelationId);
    if (cachedAck) {
      this.assertExpectedCommand(cachedAck, expectedCommand);

      if (cachedAck.status !== Esp32CommandAckStatus.RECEBIDO) {
        return {
          promise: this.toFinalAckPromise(cachedAck),
          shouldPublish: false,
          cancel: () => undefined,
        };
      }
    }

    const existing = this.pendingAcks.get(normalizedCorrelationId);
    if (existing) {
      if (existing.expectedCommand !== expectedCommand) {
        throw new BadGatewayException(
          `correlation_id ${normalizedCorrelationId} ja aguarda ACK de ${existing.expectedCommand}, nao de ${expectedCommand}.`,
        );
      }

      return {
        promise: existing.promise,
        shouldPublish: false,
        cancel: () => undefined,
      };
    }

    let resolvePromise!: (record: CommandAckRecord) => void;
    let rejectPromise!: (reason: Error) => void;
    const promise = new Promise<CommandAckRecord>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const timeout = setTimeout(() => {
      const pending = this.pendingAcks.get(normalizedCorrelationId);
      if (!pending || pending.promise !== promise) {
        return;
      }

      this.pendingAcks.delete(normalizedCorrelationId);
      pending.reject(
        new GatewayTimeoutException(
          `Timeout aguardando ACK EXECUTADO de ${expectedCommand}. Correlation ID: ${normalizedCorrelationId}.`,
        ),
      );
    }, timeoutMs);
    const pending: PendingCommandAck = {
      expectedCommand,
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      timeout,
    };

    this.pendingAcks.set(normalizedCorrelationId, pending);

    return {
      promise,
      shouldPublish: !cachedAck,
      cancel: (reason?: unknown) => {
        const current = this.pendingAcks.get(normalizedCorrelationId);
        if (!current || current.promise !== promise) {
          return;
        }

        this.clearPending(normalizedCorrelationId, current);
        current.reject(this.toCancellationError(reason));
      },
    };
  }

  rejectAllPending(reason?: unknown): void {
    const error = this.toCancellationError(reason);

    for (const [correlationId, pending] of this.pendingAcks) {
      this.clearPending(correlationId, pending);
      pending.reject(error);
    }
  }

  onModuleDestroy(): void {
    this.rejectAllPending(
      new ServiceUnavailableException(
        'API encerrada enquanto aguardava ACK do ESP32.',
      ),
    );
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

  private rememberAck(record: CommandAckRecord): void {
    this.latestAcks.delete(record.correlation_id);
    this.latestAcks.set(record.correlation_id, record);

    while (this.latestAcks.size > this.maxRecentAcks) {
      const oldestCorrelationId = this.latestAcks.keys().next().value as
        | string
        | undefined;

      if (!oldestCorrelationId) {
        break;
      }

      this.latestAcks.delete(oldestCorrelationId);
    }
  }

  private settlePendingWait(record: CommandAckRecord): void {
    const pending = this.pendingAcks.get(record.correlation_id);
    if (!pending) {
      return;
    }

    if (record.comando !== pending.expectedCommand) {
      this.clearPending(record.correlation_id, pending);
      pending.reject(
        new BadGatewayException(
          `ACK com comando divergente para ${record.correlation_id}: esperado ${pending.expectedCommand}, recebido ${record.comando}.`,
        ),
      );
      return;
    }

    if (record.status === Esp32CommandAckStatus.RECEBIDO) {
      return;
    }

    this.clearPending(record.correlation_id, pending);

    if (record.status === Esp32CommandAckStatus.EXECUTADO) {
      pending.resolve(record);
      return;
    }

    pending.reject(this.toFinalAckError(record));
  }

  private clearPending(
    correlationId: string,
    pending: PendingCommandAck,
  ): void {
    clearTimeout(pending.timeout);
    this.pendingAcks.delete(correlationId);
  }

  private toFinalAckPromise(
    record: CommandAckRecord,
  ): Promise<CommandAckRecord> {
    if (record.status === Esp32CommandAckStatus.EXECUTADO) {
      return Promise.resolve(record);
    }

    return Promise.reject(this.toFinalAckError(record));
  }

  private toFinalAckError(record: CommandAckRecord): Error {
    const details = record.erro ?? record.mensagem ?? 'motivo nao informado';

    if (record.status === Esp32CommandAckStatus.RECUSADO) {
      return new UnprocessableEntityException(
        `ESP32 recusou ${record.comando}. Correlation ID: ${record.correlation_id}. Motivo: ${details}.`,
      );
    }

    return new BadGatewayException(
      `ESP32 reportou erro ao executar ${record.comando}. Correlation ID: ${record.correlation_id}. Erro: ${details}.`,
    );
  }

  private assertExpectedCommand(
    record: CommandAckRecord,
    expectedCommand: CommandName,
  ): void {
    if (record.comando === expectedCommand) {
      return;
    }

    throw new BadGatewayException(
      `ACK armazenado para ${record.correlation_id} pertence a ${record.comando}, nao a ${expectedCommand}.`,
    );
  }

  private toCancellationError(reason?: unknown): Error {
    if (reason instanceof Error) {
      return reason;
    }

    return new ServiceUnavailableException(
      typeof reason === 'string' && reason.trim()
        ? reason
        : 'Espera por ACK do ESP32 foi cancelada.',
    );
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
