import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { statusconexaomqtt } from '@prisma/client';
import { CommandService } from './commands/command.service';
import type { CommandOptions } from './commands/interfaces/command-options.interface';
import type { CommandResult } from './commands/interfaces/command-result.interface';
import { MqttConfigService } from './config/mqtt-config.service';
import { UpdateMqttConfigDTO } from './dto/update-mqtt-config.dto';
import { MqttClientService } from './connection/mqtt-client.service';
import { MqttHealthService } from './connection/mqtt-health.service';
import type { HardwareState } from './interfaces/hardware-state.interface'; 

type SanitizedMqttConfig = {
  id_mqtt_configuracao: number;
  id_usuario_alteracao: number | null;
  broker_url: string;
  porta: number;
  usuario_mqtt: string | null;
  topico_leituras: string;
  topico_comandos: string;
  topico_status: string;
  topico_alarmes: string;
  topico_heartbeat: string;
  topico_acoplamentos: string;
  reconexao_automatica: boolean;
  timeout_comunicacao: number;
  status_conexao: statusconexaomqtt;
  ultima_conexao: Date | null;
  ultima_sincronizacao: Date | null;
  ultima_falha: string | null;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
};

type MqttConfigEntity = {
  id_mqtt_configuracao: number;
  id_usuario_alteracao?: number | null;
  broker_url: string;
  porta: number;
  usuario_mqtt?: string | null;
  topico_leituras: string;
  topico_comandos: string;
  topico_status: string;
  topico_alarmes: string;
  topico_heartbeat: string;
  topico_acoplamentos: string;
  reconexao_automatica: boolean;
  timeout_comunicacao: number;
  status_conexao: statusconexaomqtt;
  ultima_conexao?: Date | null;
  ultima_sincronizacao?: Date | null;
  ultima_falha?: string | null;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
  senha_mqtt_hash?: string | null;
  chave_configuracao?: string;
};

export type MqttHardwareStatusResponse = {
  mqtt: {
    connected: boolean;
    status_conexao: statusconexaomqtt;
    broker_url: string;
    porta: number;
    topico_comandos: string;
    ultima_conexao: Date | null;
    ultima_sincronizacao: Date | null;
    ultima_falha: string | null;
    ativo: boolean;
  };
  hardware: HardwareState;
  consultado_em: Date;
};

export type MqttConnectionTestResponse = {
  connected: boolean;
  checked_at: Date;
  message: string;
};

export type MqttConnectionActionResponse = {
  success: boolean;
  message: string;
  error: string | null;
  executed_at: Date;
};

export type MqttCommandExecutionResponse = {
  success: boolean;
  command: CommandResult;
  executed_at: Date;
};

@Injectable()
export class MqttService {
  private readonly logger = new Logger(MqttService.name);

  constructor(
    private readonly mqttConfigService: MqttConfigService,
    private readonly mqttClientService: MqttClientService,
    private readonly mqttHealthService: MqttHealthService,
    private readonly commandService: CommandService,
  ) {}

  async getStatus(): Promise<MqttHardwareStatusResponse> {
    const config = await this.mqttConfigService.getConfig();
    const hardware = this.mqttHealthService.getCurrentState();

    return {
      mqtt: {
        connected: this.mqttClientService.getConnectionState(),
        status_conexao: config.status_conexao,
        broker_url: config.broker_url,
        porta: config.porta,
        topico_comandos: config.topico_comandos,
        ultima_conexao: config.ultima_conexao ?? null,
        ultima_sincronizacao: config.ultima_sincronizacao ?? null,
        ultima_falha: config.ultima_falha ?? null,
        ativo: config.ativo,
      },
      hardware,
      consultado_em: new Date(),
    };
  }

  async getConfig(): Promise<SanitizedMqttConfig> {
    const config = await this.mqttConfigService.getConfig();

    return this.sanitetizeConfig(config);
  }

  async updateConfig(
    dto: UpdateMqttConfigDTO,
    idUsuarioAlteracao: number,
  ): Promise<SanitizedMqttConfig> {
    const updatedConfig = await this.mqttConfigService.updateConfig(
      dto,
      idUsuarioAlteracao,
    );

    this.logger.warn(
      `Configuração MQTT atualizada. ID ${updatedConfig.id_mqtt_configuracao}.` +
        `Usuário alteração: ${idUsuarioAlteracao}`,
    );

    return this.sanitetizeConfig(updatedConfig);
  }

  async testConnection(): Promise<MqttConnectionTestResponse> {
    const alreadyConnected = this.mqttClientService.getConnectionState();

    if (alreadyConnected) {
      return {
        connected: true,
        checked_at: new Date(),
        message: 'Cliente MQTT já está conectado.',
      };
    }

    const result = await this.mqttClientService.connect();

    return {
      connected: result.sucess,
      checked_at: result.timestamp,
      message: result.sucess
        ? 'Conexão MQTT realizada com sucesso.'
        : (result.error ?? result.message),
    };
  }

  async reconnect(): Promise<MqttConnectionActionResponse> {
    const result = await this.mqttClientService.reconnect();

    return {
      success: result.sucess,
      message: result.message,
      error: result.error ?? null,
      executed_at: result.timestamp,
    };
  }

  async disconnect(): Promise<MqttConnectionActionResponse> {
    const result = await this.mqttClientService.disconnect();

    return {
      success: result.sucess,
      message: result.message,
      error: result.error ?? null,
      executed_at: result.timestamp,
    };
  }

  async sincronizarHardware(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    await this.ensureMqttConnected();

    const command = await this.commandService.sincronizarHardware({
      ...options,
      motivo:
        options.motivo ??
        'Sincronização de hardware solicitado pela interface do sistema.',
    });

    return this.buildCommandResponse(command);
  }

  async reiniciarComunicacao(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    await this.ensureMqttConnected();

    const command = await this.commandService.reiniciarComunicacao({
      ...options,
      motivo:
        options.motivo ??
        'Reinício de comunicação solicitado pela interface do sistema.',
    });

    return this.buildCommandResponse(command);
  }

  async paradaEmergencia(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    await this.ensureMqttConnected();

    const command = await this.commandService.paradaEmergencia({
      ...options,
      motivo:
        options.motivo ??
        'Parada de emergência solicitada pela interface do sistema.',
    });

    this.logger.error(
      `Parada de emergência solicitada via HTPP. Correlation ID: ${command.correlation_id}`,
    );

    return this.buildCommandResponse(command);
  }

  async desligarTodasBombas(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    await this.ensureMqttConnected();

    const command = await this.commandService.desligarTodasBombas({
      ...options,
      motivo:
        options.motivo ??
        'Desligamento de todas as bombas solicitado pela interface do sistema.',
    });

    return this.buildCommandResponse(command);
  }

  async abrirTodasValvulas(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    await this.ensureMqttConnected();

    const command = await this.commandService.abrirTodasValvulas({
      ...options,
      motivo:
        options.motivo ??
        'Abertura de todas as válvulas solicitada pela interface do sistema.',
    });

    return this.buildCommandResponse(command);
  }

  async fecharTodasValvulas(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    await this.ensureMqttConnected();

    const command = await this.commandService.fecharTodasValvulas({
      ...options,
      motivo:
        options.motivo ??
        'Fechamento de todas as válvulas solicitado pela interface do sistema.',
    });

    return this.buildCommandResponse(command);
  }

  private async ensureMqttConnected(): Promise<void> {
    if (this.mqttClientService.getConnectionState()) {
      return;
    }

    const result = await this.mqttClientService.connect();

    if (!result.sucess) {
      throw new ServiceUnavailableException(
        result.error ??
          'Não foi possível executar o comando porque o backend não está conectado ao broker MQTT.',
      );
    }
  }

  private sanitetizeConfig(config: MqttConfigEntity): SanitizedMqttConfig {
    return {
      id_usuario_alteracao: config.id_usuario_alteracao ?? null,
      id_mqtt_configuracao: config.id_mqtt_configuracao,
      broker_url: config.broker_url,
      porta: config.porta,
      usuario_mqtt: config.usuario_mqtt ?? null,
      topico_leituras: config.topico_leituras,
      topico_comandos: config.topico_comandos,
      topico_status: config.topico_status,
      topico_alarmes: config.topico_alarmes,
      topico_heartbeat: config.topico_heartbeat,
      topico_acoplamentos: config.topico_acoplamentos,
      reconexao_automatica: config.reconexao_automatica,
      timeout_comunicacao: config.timeout_comunicacao,
      status_conexao: config.status_conexao,
      ultima_conexao: config.ultima_conexao ?? null,
      ultima_sincronizacao: config.ultima_sincronizacao ?? null,
      ultima_falha: config.ultima_falha ?? null,
      ativo: config.ativo,
      criado_em: config.criado_em,
      atualizado_em: config.atualizado_em,
    };
  }

  private buildCommandResponse(
    command: CommandResult,
  ): MqttCommandExecutionResponse {
    return {
      success: true,
      command,
      executed_at: new Date(),
    };
  }
}
