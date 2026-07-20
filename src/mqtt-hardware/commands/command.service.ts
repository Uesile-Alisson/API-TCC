import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MqttClientService } from '../connection/mqtt-client.service';
import { MqttConfigService } from '../config/mqtt-config.service';
import { Esp32SyncConfigService } from '../config/esp32-sync-config.service';
import { CommandPayloadBuilder } from './command-payload.builder';
import {
  MQTT_COMMANDS,
  CommandName,
} from './interfaces/command-name.interface';
import {
  CommandOptions,
  CommandQos,
} from './interfaces/command-options.interface';
import {
  BombaCommandParams,
  CommandParams,
  EmptyCommandParams,
  ValvulaCommandParams,
} from './interfaces/command-params.interface';
import { CommandPayload } from './interfaces/command-payload.interface';
import { CommandResult } from './interfaces/command-result.interface';
import { Esp32ProcessStartPayload } from '../interfaces/esp32-contracts.interface';
import {
  CommandAckHandler,
  CommandAckRecord,
} from '../handlers/command-ack.handler';
import { statuscomandomqtt } from '@prisma/client';
import { CommandLedgerService } from './command-ledger.service';

type PublishOptions = {
  qos: CommandQos;
  retain: boolean;
};

@Injectable()
export class CommandService {
  private readonly logger = new Logger(CommandService.name);
  private readonly DEFAULT_COMMAND_QOS: CommandQos = 1;
  private readonly EMERGENCY_COMMAND_QOS: CommandQos = 2;
  private readonly COMMAND_RETAIN = false;

  constructor(
    private readonly mqttClientService: MqttClientService,
    private readonly mqttConfigService: MqttConfigService,
    private readonly esp32SyncConfigService: Esp32SyncConfigService,
    private readonly commandAckHandler: CommandAckHandler,
    @Optional() private readonly commandLedgerService?: CommandLedgerService,
  ) {}

  async ligarBomba(
    options: CommandOptions,
    idBomba: number,
    codigoHardware?: string,
  ): Promise<CommandResult> {
    this.validatePositiveId(idBomba, 'id_bomba');

    return await this.publishCommand<BombaCommandParams>(
      MQTT_COMMANDS.LIGAR_BOMBA,
      {
        id_bomba: idBomba,
        ...(codigoHardware ? { codigo_hardware: codigoHardware } : {}),
      },
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async desligarBomba(
    options: CommandOptions,
    idBomba: number,
    codigoHardware?: string,
  ): Promise<CommandResult> {
    this.validatePositiveId(idBomba, 'id_bomba');

    return await this.publishCommand<BombaCommandParams>(
      MQTT_COMMANDS.DESLIGAR_BOMBA,
      {
        id_bomba: idBomba,
        ...(codigoHardware ? { codigo_hardware: codigoHardware } : {}),
      },
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async desligarTodasBombas(options: CommandOptions): Promise<CommandResult> {
    return await this.publishCommand<EmptyCommandParams>(
      MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS,
      {},
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async abrirValvula(
    options: CommandOptions,
    idValvula: number,
    codigoHardware?: string,
    context?: Pick<ValvulaCommandParams, 'id_tanque' | 'id_processo_tanque'>,
  ): Promise<CommandResult> {
    this.validatePositiveId(idValvula, 'id_valvula');

    return await this.publishCommand<ValvulaCommandParams>(
      MQTT_COMMANDS.ABRIR_VALVULA,
      {
        id_valvula: idValvula,
        ...(codigoHardware ? { codigo_hardware: codigoHardware } : {}),
        ...(context?.id_tanque !== undefined
          ? { id_tanque: context.id_tanque }
          : {}),
        ...(context?.id_processo_tanque !== undefined
          ? { id_processo_tanque: context.id_processo_tanque }
          : {}),
      },
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async fecharValvula(
    options: CommandOptions,
    idValvula: number,
    codigoHardware?: string,
    context?: Pick<ValvulaCommandParams, 'id_tanque' | 'id_processo_tanque'>,
  ): Promise<CommandResult> {
    this.validatePositiveId(idValvula, 'id_valvula');

    return await this.publishCommand<ValvulaCommandParams>(
      MQTT_COMMANDS.FECHAR_VALVULA,
      {
        id_valvula: idValvula,
        ...(codigoHardware ? { codigo_hardware: codigoHardware } : {}),
        ...(context?.id_tanque !== undefined
          ? { id_tanque: context.id_tanque }
          : {}),
        ...(context?.id_processo_tanque !== undefined
          ? { id_processo_tanque: context.id_processo_tanque }
          : {}),
      },
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async abrirTodasValvulas(options: CommandOptions): Promise<CommandResult> {
    return await this.publishCommand<EmptyCommandParams>(
      MQTT_COMMANDS.ABRIR_TODAS_VALVULAS,
      {},
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async fecharTodasValvulas(options: CommandOptions): Promise<CommandResult> {
    return await this.publishCommand<EmptyCommandParams>(
      MQTT_COMMANDS.FECHAR_TODAS_VALVULAS,
      {},
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async paradaEmergencia(options: CommandOptions): Promise<CommandResult> {
    return await this.publishCommand<EmptyCommandParams>(
      MQTT_COMMANDS.PARADA_EMERGENCIA,
      {},
      this.resolveEmergencyPublishOptions(options),
      {
        ...options,
        motivo:
          options.motivo ?? 'Parada de emergência solicitada pelo sistema.',
      },
    );
  }

  async sincronizarHardware(options: CommandOptions): Promise<CommandResult> {
    return await this.esp32SyncConfigService.publishSyncConfig(options);
  }

  async reiniciarComunicacao(options: CommandOptions): Promise<CommandResult> {
    return await this.publishCommand<EmptyCommandParams>(
      MQTT_COMMANDS.REINICIAR_COMUNICACAO,
      {},
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async deligarBomba(
    options: CommandOptions,
    idBomba: number,
    codigoHardware?: string,
  ): Promise<CommandResult> {
    return await this.desligarBomba(options, idBomba, codigoHardware);
  }

  async iniciarProcessoVacuo(
    payload: Esp32ProcessStartPayload,
    options?: CommandOptions,
  ): Promise<CommandResult> {
    const target = await this.resolveCommandTarget();
    const publishOptions = this.resolveStandardPublishOptions(options);
    const execution = await this.publishAndAwaitAck({
      topic: target.topic,
      payload,
      publishOptions,
      comando: MQTT_COMMANDS.INICIAR_PROCESSO_VACUO,
      correlationId: payload.correlation_id,
      ackTimeoutMs: target.ackTimeoutMs,
    });
    const result = this.buildAcknowledgedResult({
      comando: MQTT_COMMANDS.INICIAR_PROCESSO_VACUO,
      topic: target.topic,
      publishOptions,
      correlationId: payload.correlation_id,
      execution,
    });

    this.logger.log(
      `Comando MQTT de inicio de processo de vacuo publicado. ` +
        `Processo: ${payload.id_processo}. ` +
        `Topico: ${target.topic}. ` +
        `Correlation ID: ${payload.correlation_id}.`,
    );

    return result;
  }

  private async publishCommand<TParams extends CommandParams>(
    comando: CommandName,
    params: TParams,
    publishOptions: PublishOptions,
    comandoOptions: CommandOptions,
  ): Promise<CommandResult> {
    const payload = CommandPayloadBuilder.build(
      comando,
      params,
      comandoOptions,
    );
    const target = await this.resolveCommandTarget();
    const execution = await this.publishAndAwaitAck({
      topic: target.topic,
      payload,
      publishOptions,
      comando,
      correlationId: payload.correlation_id,
      ackTimeoutMs: target.ackTimeoutMs,
    });
    const result = this.buildAcknowledgedResult({
      comando,
      topic: target.topic,
      publishOptions,
      correlationId: payload.correlation_id,
      execution,
    });

    this.logCommandPublished(payload, result);
    return result;
  }

  private async resolveCommandTarget(): Promise<{
    topic: string;
    ackTimeoutMs: number;
  }> {
    const config = await this.mqttConfigService.getConfig();

    if (!config.topico_comandos || config.topico_comandos.trim().length === 0) {
      throw new ServiceUnavailableException(
        'Tópico de comandos MQTT não está configurado.',
      );
    }

    return {
      topic: config.topico_comandos,
      ackTimeoutMs: config.timeout_comunicacao,
    };
  }

  private async publishAndAwaitAck<TPayload extends object>(input: {
    topic: string;
    payload: TPayload;
    publishOptions: PublishOptions;
    comando: CommandName;
    correlationId: string;
    ackTimeoutMs: number;
  }): Promise<{
    ack: CommandAckRecord;
    publishedAt: Date;
    reusedAck: boolean;
  }> {
    const persisted = await this.commandLedgerService?.prepare({
      correlationId: input.correlationId,
      comando: input.comando,
      topic: input.topic,
      payload: input.payload,
      qos: input.publishOptions.qos,
      retain: input.publishOptions.retain,
      timeoutMs: input.ackTimeoutMs,
    });
    if (persisted?.restoredAck) {
      this.commandAckHandler.restorePersistedAck(persisted.restoredAck);
    }

    const waitRegistration = this.commandAckHandler.waitForFinalAck(
      input.correlationId,
      input.comando,
      input.ackTimeoutMs,
    );
    const publicationAttemptedAt = new Date();
    const shouldPublish =
      (persisted?.shouldPublish ?? true) && waitRegistration.shouldPublish;

    if (shouldPublish) {
      try {
        await this.mqttClientService.publish(input.topic, input.payload, {
          qos: input.publishOptions.qos,
          retain: input.publishOptions.retain,
        });
        await this.commandLedgerService?.markPublished(
          input.correlationId,
          publicationAttemptedAt,
        );
      } catch (error) {
        waitRegistration.cancel(error);
        await waitRegistration.promise.catch(() => undefined);
        await this.commandLedgerService?.markFailure(
          input.correlationId,
          statuscomandomqtt.ERRO,
          error,
        );
        throw error;
      }
    }

    let ack: CommandAckRecord;
    try {
      ack = await waitRegistration.promise;
      await this.commandLedgerService?.recordAck(ack);
    } catch (error) {
      await this.commandLedgerService?.markFailure(
        input.correlationId,
        error instanceof GatewayTimeoutException
          ? statuscomandomqtt.TIMEOUT
          : statuscomandomqtt.ERRO,
        error,
      );
      throw error;
    }

    return {
      ack,
      publishedAt: shouldPublish ? publicationAttemptedAt : ack.recebido_em,
      reusedAck: !shouldPublish,
    };
  }

  private buildAcknowledgedResult(input: {
    comando: CommandName;
    topic: string;
    publishOptions: PublishOptions;
    correlationId: string;
    execution: {
      ack: CommandAckRecord;
      publishedAt: Date;
      reusedAck: boolean;
    };
  }): CommandResult {
    return {
      comando: input.comando,
      topic: input.topic,
      qos: input.publishOptions.qos,
      retain: input.publishOptions.retain,
      correlation_id: input.correlationId,
      published_at: input.execution.publishedAt,
      acknowledged: true,
      ack_status: 'EXECUTADO',
      ack_received_at: input.execution.ack.recebido_em,
      ack_message: input.execution.ack.mensagem,
      reused_ack: input.execution.reusedAck,
    };
  }

  private resolveStandardPublishOptions(
    options?: CommandOptions,
  ): PublishOptions {
    return {
      qos: options?.qos ?? this.DEFAULT_COMMAND_QOS,
      retain: this.COMMAND_RETAIN,
    };
  }

  private resolveEmergencyPublishOptions(
    options?: CommandOptions,
  ): PublishOptions {
    return {
      qos: options?.qos ?? this.EMERGENCY_COMMAND_QOS,
      retain: this.COMMAND_RETAIN,
    };
  }

  private validatePositiveId(value: number, fieldname: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(
        `${fieldname} deve ser um número inteiro maior que zero`,
      );
    }
  }

  private logCommandPublished<TParams extends CommandParams>(
    payload: CommandPayload<TParams>,
    result: CommandResult,
  ): void {
    const logMessage =
      `Comando MQTT publicado. ` +
      `Comando: ${payload.comando}. ` +
      `Tópico: ${result.topic}. ` +
      `QoS: ${result.qos}. ` +
      `Retain: ${String(result.retain)}. ` +
      `Correlation ID: ${result.correlation_id}. ` +
      `ACK: ${result.ack_status ?? 'nao confirmado'}. ` +
      `Solicitado por: ${payload.solicitado_por ?? 'sistema'}. ` +
      `Motivo: ${payload.motivo ?? 'não informado'}.`;

    if (payload.comando === MQTT_COMMANDS.PARADA_EMERGENCIA) {
      this.logger.error(logMessage);
      return;
    }

    this.logger.log(logMessage);
  }
}
