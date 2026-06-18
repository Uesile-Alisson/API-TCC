import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MqttClientService } from '../connection/mqtt-client.service';
import { MqttConfigService } from '../config/mqtt-config.service';
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
  ) {}

  async ligarBomba(
    options: CommandOptions,
    idBomba: number,
  ): Promise<CommandResult> {
    this.validatePositiveId(idBomba, 'id_bomba');

    return await this.publishCommand<BombaCommandParams>(
      MQTT_COMMANDS.LIGAR_BOMBA,
      {
        id_bomba: idBomba,
      },
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async deligarBomba(
    options: CommandOptions,
    idBomba: number,
  ): Promise<CommandResult> {
    this.validatePositiveId(idBomba, 'id_bomba');

    return await this.publishCommand<BombaCommandParams>(
      MQTT_COMMANDS.DESLIGAR_BOMBA,
      {
        id_bomba: idBomba,
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
  ): Promise<CommandResult> {
    this.validatePositiveId(idValvula, 'id_valvula');

    return await this.publishCommand<ValvulaCommandParams>(
      MQTT_COMMANDS.ABRIR_VALVULA,
      {
        id_valvula: idValvula,
      },
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async fecharValvula(
    options: CommandOptions,
    idValvula: number,
  ): Promise<CommandResult> {
    this.validatePositiveId(idValvula, 'id_valvula');

    return await this.publishCommand<ValvulaCommandParams>(
      MQTT_COMMANDS.FECHAR_VALVULA,
      {
        id_valvula: idValvula,
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
    return await this.publishCommand<EmptyCommandParams>(
      MQTT_COMMANDS.SINCRONIZAR_HARDWARE,
      {},
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  async reiniciarComunicacao(options: CommandOptions): Promise<CommandResult> {
    return await this.publishCommand<EmptyCommandParams>(
      MQTT_COMMANDS.REINICIAR_COMUNICACAO,
      {},
      this.resolveStandardPublishOptions(options),
      options,
    );
  }

  private async publishCommand<TParams extends CommandParams>(
    comando: CommandName,
    params: TParams,
    publishOptions: PublishOptions,
    comandoOptions: CommandOptions,
  ): Promise<CommandResult> {
    const topic = await this.resolveCommandTopic();

    const payload = CommandPayloadBuilder.build(
      comando,
      params,
      comandoOptions,
    );

    await this.publishToMqtt(topic, payload, publishOptions);

    const result: CommandResult = {
      comando,
      topic,
      qos: publishOptions.qos,
      retain: publishOptions.retain,
      correlation_id: payload.correlation_id,
      published_at: new Date(),
    };

    this.logCommandPublished(payload, result);
    return result;
  }

  private async resolveCommandTopic(): Promise<string> {
    const config = await this.mqttConfigService.getConfig();

    if (!config.topico_comandos || config.topico_comandos.trim().length === 0) {
      throw new ServiceUnavailableException(
        'Tópico de comandos MQTT não está configurado.',
      );
    }

    return config.topico_comandos;
  }

  private async publishToMqtt<TParams extends CommandParams>(
    topic: string,
    payload: CommandPayload<TParams>,
    options: PublishOptions,
  ): Promise<void> {
    await this.mqttClientService.publish(topic, payload, {
      qos: options.qos,
      retain: options.retain,
    });
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
      `Solicitado por: ${payload.solicitado_por ?? 'sistema'}. ` +
      `Motivo: ${payload.motivo ?? 'não informado'}.`;

    if (payload.comando === MQTT_COMMANDS.PARADA_EMERGENCIA) {
      this.logger.error(logMessage);
      return;
    }

    this.logger.log(logMessage);
  }
}
