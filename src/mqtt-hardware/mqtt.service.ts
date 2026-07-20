import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { statusconexaomqtt } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ProcessoGeneralClosureService } from '../processos/lifecycle';
import { CommandService } from './commands/command.service';
import type { CommandOptions } from './commands/interfaces/command-options.interface';
import type { CommandResult } from './commands/interfaces/command-result.interface';
import {
  MqttConfigService,
  type MqttOperationalControlAction,
} from './config/mqtt-config.service';
import { UpdateMqttConfigDTO } from './dto/update-mqtt-config.dto';
import {
  MqttClientService,
  type MqttConfigurationProbeResult,
  type MqttCredentialProbeResult,
} from './connection/mqtt-client.service';
import { MqttHealthService } from './connection/mqtt-health.service';
import type { HardwareState } from './interfaces/hardware-state.interface';
import type { ActiveMqttConfig } from './interfaces/active-mqtt-config.interface';
import {
  type MqttCredentials,
  MqttCredentialsService,
} from './config/mqtt-credentials.service';
import { UpdateMqttCredentialsDTO } from './dto/update-mqtt-credentials.dto';

type SanitizedMqttConfig = {
  id_mqtt_configuracao: number;
  id_usuario_alteracao: number | null;
  broker_url: string;
  porta: number;
  usuario_mqtt_configurado: boolean;
  senha_mqtt_configurada: boolean;
  credenciais_configuradas: boolean;
  credenciais_verificadas: boolean;
  credenciais_verificadas_em: Date | null;
  ultima_falha_credenciais: string | null;
  topico_leituras: string;
  topico_comandos: string;
  topico_status: string;
  topico_alarmes: string;
  topico_heartbeat: string;
  topico_acoplamentos: string;
  topico_configuracoes: string;
  topico_acks: string;
  reconexao_automatica: boolean;
  timeout_comunicacao: number;
  status_conexao: statusconexaomqtt;
  ultima_conexao: Date | null;
  ultima_sincronizacao: Date | null;
  ultima_falha: string | null;
  ativo: boolean;
  connected: boolean;
  configuracao_aplicada: boolean;
  criado_em: Date;
  atualizado_em: Date;
};

type MqttConfigEntity = {
  id_mqtt_configuracao: number;
  id_usuario_alteracao: number | null;
  broker_url: string;
  porta: number;
  usuario_mqtt_configurado: boolean;
  senha_mqtt_configurada: boolean;
  credenciais_verificadas_em: Date | null;
  ultima_falha_credenciais: string | null;
  topico_leituras: string;
  topico_comandos: string;
  topico_status: string;
  topico_alarmes: string;
  topico_heartbeat: string;
  topico_acoplamentos: string;
  topico_configuracoes: string;
  topico_acks: string;
  reconexao_automatica: boolean;
  timeout_comunicacao: number;
  status_conexao: statusconexaomqtt;
  ultima_conexao: Date | null;
  ultima_sincronizacao: Date | null;
  ultima_falha: string | null;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
  chave_configuracao: string;
};

export type MqttHardwareStatusResponse = {
  mqtt: {
    connected: boolean;
    operacional: boolean;
    configuracao_aplicada: boolean;
    status_conexao: statusconexaomqtt;
    broker_url: string;
    porta: number;
    usuario_mqtt_configurado: boolean;
    senha_mqtt_configurada: boolean;
    credenciais_configuradas: boolean;
    credenciais_verificadas: boolean;
    credenciais_verificadas_em: Date | null;
    ultima_falha_credenciais: string | null;
    topico_comandos: string;
    ultima_conexao: Date | null;
    ultima_sincronizacao: Date | null;
    ultima_falha: string | null;
    ativo: boolean;
  };
  hardware: HardwareState;
  status_conexao: statusconexaomqtt;
  esp32_online: boolean;
  comunicacao_pronta_para_processos: boolean;
  bloqueios_comunicacao_processos: string[];
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

export type MqttCredentialsUpdateResponse = {
  credenciais_atualizadas: true;
  usuario_mqtt_configurado: boolean;
  senha_mqtt_configurada: boolean;
  credenciais_configuradas: boolean;
  credenciais_verificadas: boolean;
  credenciais_verificadas_em: Date | null;
  ultima_falha_credenciais: string | null;
  connected: boolean;
  status_conexao: statusconexaomqtt;
  mensagem: string;
  erro_conexao: string | null;
  atualizado_em: Date;
};

export type MqttCommandExecutionResponse = {
  success: boolean;
  command: CommandResult;
  executed_at: Date;
};

export type MqttEmergencyStopExecutionResponse = {
  success: true;
  message: string;
  emergency: Awaited<
    ReturnType<ProcessoGeneralClosureService['requestEmergencyStopForCurrent']>
  >;
  executed_at: Date;
};

@Injectable()
export class MqttService {
  private readonly logger = new Logger(MqttService.name);
  private credentialsUpdateInProgress = false;
  private configurationUpdateInProgress = false;

  constructor(
    private readonly mqttConfigService: MqttConfigService,
    private readonly mqttClientService: MqttClientService,
    private readonly mqttHealthService: MqttHealthService,
    private readonly commandService: CommandService,
    private readonly mqttCredentialsService: MqttCredentialsService,
    private readonly processoGeneralClosureService: ProcessoGeneralClosureService,
  ) {}

  async getStatus(): Promise<MqttHardwareStatusResponse> {
    const config = await this.mqttConfigService.getConfig();
    const hardware = this.mqttHealthService.getCurrentState();
    const credentialState = this.buildCredentialState(config);
    const connected = this.mqttClientService.getConnectionState();
    const configurationApplied = this.mqttClientService.isConfigApplied(config);
    const mqttOperational =
      credentialState.credenciais_configuradas &&
      credentialState.credenciais_verificadas &&
      connected &&
      configurationApplied;
    const communicationReady = mqttOperational && hardware.esp32Online;
    const communicationBlockers: string[] = [];

    if (!credentialState.credenciais_configuradas) {
      communicationBlockers.push('CREDENCIAIS_MQTT_NAO_CONFIGURADAS');
    } else if (!credentialState.credenciais_verificadas) {
      communicationBlockers.push('CREDENCIAIS_MQTT_NAO_VERIFICADAS');
    }
    if (!connected) {
      communicationBlockers.push('MQTT_DESCONECTADO');
    }
    if (!configurationApplied) {
      communicationBlockers.push('CONFIGURACAO_MQTT_NAO_APLICADA');
    }
    if (!hardware.esp32Online) {
      communicationBlockers.push('ESP32_OFFLINE');
    }

    return {
      mqtt: {
        connected,
        operacional: mqttOperational,
        configuracao_aplicada: configurationApplied,
        status_conexao: config.status_conexao,
        broker_url: config.broker_url,
        porta: config.porta,
        ...credentialState,
        topico_comandos: config.topico_comandos,
        ultima_conexao: config.ultima_conexao ?? null,
        ultima_sincronizacao: config.ultima_sincronizacao ?? null,
        ultima_falha: config.ultima_falha ?? null,
        ativo: config.ativo,
      },
      status_conexao: config.status_conexao,
      esp32_online: hardware.esp32Online,
      comunicacao_pronta_para_processos: communicationReady,
      bloqueios_comunicacao_processos: communicationBlockers,
      hardware,
      consultado_em: new Date(),
    };
  }

  async getConfig(): Promise<SanitizedMqttConfig> {
    const config = await this.mqttConfigService.getConfig();

    return this.sanitizeConfig(config);
  }

  async updateConfig(
    dto: UpdateMqttConfigDTO,
    idUsuarioAlteracao: number,
  ): Promise<SanitizedMqttConfig> {
    this.assertNoMqttUpdateInProgress();
    this.configurationUpdateInProgress = true;
    const updateLeaseToken = randomUUID();
    let updateLeaseClaimed = false;
    let previousConfig: ActiveMqttConfig | null = null;
    let candidatePersisted = false;
    let credentials: MqttCredentials | null = null;

    try {
      await this.mqttConfigService.claimConfigurationUpdateLease(
        updateLeaseToken,
      );
      updateLeaseClaimed = true;

      previousConfig = await this.mqttConfigService.getConfig();
      const candidate = this.mqttConfigService.buildCandidateConfig(
        previousConfig,
        dto,
      );
      credentials = await this.mqttCredentialsService.readCredentials();
      const verification = await this.mqttClientService.verifyConfiguration(
        candidate,
        credentials,
      );
      if (!verification.success) {
        throw this.buildConfigurationProbeException(verification);
      }

      await this.mqttConfigService.renewConfigurationUpdateLease(
        updateLeaseToken,
      );
      await this.mqttConfigService.updateConfig(
        dto,
        idUsuarioAlteracao,
        updateLeaseToken,
      );
      candidatePersisted = true;

      const connection = await this.mqttClientService.reconnect();
      const appliedConfig = await this.mqttConfigService.getConfig();
      if (
        !connection.success ||
        !this.mqttClientService.isConfigApplied(appliedConfig)
      ) {
        throw new ServiceUnavailableException(
          connection.error ??
            'A conexao principal nao confirmou a configuracao MQTT candidata.',
        );
      }
      await this.mqttHealthService.reloadHealthConfig();

      this.logger.warn(
        `Configuracao MQTT ${appliedConfig.id_mqtt_configuracao} atualizada, ` +
          `testada e aplicada pelo usuario ${idUsuarioAlteracao}.`,
      );

      return this.sanitizeConfig(appliedConfig);
    } catch (error) {
      if (candidatePersisted && previousConfig) {
        throw await this.rollbackConfigurationUpdate({
          previousConfig,
          idUsuarioAlteracao,
          updateLeaseToken,
          originalError: error,
          credentials,
        });
      }

      throw error;
    } finally {
      if (updateLeaseClaimed) {
        await this.mqttConfigService
          .releaseConfigurationUpdateLease(updateLeaseToken)
          .catch((error: unknown) => {
            this.logger.error(
              'Nao foi possivel liberar imediatamente o bloqueio da atualizacao da configuracao MQTT. O lease expirara automaticamente.',
              error instanceof Error ? error.stack : undefined,
            );
          });
      }
      this.configurationUpdateInProgress = false;
    }
  }

  async updateCredentials(
    dto: UpdateMqttCredentialsDTO,
    idUsuarioAlteracao: number,
  ): Promise<MqttCredentialsUpdateResponse> {
    this.assertNoMqttUpdateInProgress();

    this.credentialsUpdateInProgress = true;
    let credentialsUpdateLeaseToken: string | null = null;
    let credentialsUpdateLeaseClaimed = false;

    try {
      const normalizedCredentials =
        this.mqttCredentialsService.validateAndNormalizeCredentials(dto);
      credentialsUpdateLeaseToken = randomUUID();
      await this.mqttConfigService.claimCredentialsUpdateLease(
        credentialsUpdateLeaseToken,
      );
      credentialsUpdateLeaseClaimed = true;

      const verification = await this.mqttClientService.verifyCredentials({
        username: normalizedCredentials.usuario_mqtt,
        password: normalizedCredentials.senha_mqtt,
      });

      if (!verification.success) {
        this.logger.warn(
          `Atualizacao de credenciais MQTT recusada antes da gravacao. ` +
            `Usuario solicitante: ${idUsuarioAlteracao}. ` +
            `Motivo: ${verification.failureCode ?? 'NAO_CONFIRMADO'}.`,
        );
        throw this.buildCredentialProbeException(verification);
      }

      await this.mqttConfigService.renewCredentialsUpdateLease(
        credentialsUpdateLeaseToken,
      );
      await this.mqttCredentialsService.configureCredentials(
        normalizedCredentials,
        idUsuarioAlteracao,
      );

      const connection = await this.mqttClientService.reconnect();
      const config = await this.mqttConfigService.getConfig();
      const credentialState = this.buildCredentialState(config);
      const connected = this.mqttClientService.getConnectionState();

      this.logger.warn(
        `Credenciais MQTT externas atualizadas pelo usuario ${idUsuarioAlteracao}. ` +
          `Verificadas: ${credentialState.credenciais_verificadas}. Conectado: ${connected}.`,
      );

      return {
        credenciais_atualizadas: true,
        ...credentialState,
        connected,
        status_conexao: config.status_conexao,
        mensagem: credentialState.credenciais_verificadas
          ? 'Credenciais MQTT atualizadas e verificadas com sucesso.'
          : 'Credenciais MQTT atualizadas, mas a conexao com o broker ainda nao foi confirmada.',
        erro_conexao: connection.success
          ? null
          : this.sanitizeConnectionError(
              connection.error ?? connection.message,
            ),
        atualizado_em: config.atualizado_em,
      };
    } finally {
      if (credentialsUpdateLeaseClaimed && credentialsUpdateLeaseToken) {
        await this.mqttConfigService
          .releaseCredentialsUpdateLease(credentialsUpdateLeaseToken)
          .catch((error: unknown) => {
            this.logger.error(
              'Nao foi possivel liberar imediatamente o bloqueio da atualizacao de credenciais MQTT. O lease expirara automaticamente.',
              error instanceof Error ? error.stack : undefined,
            );
          });
      }
      this.credentialsUpdateInProgress = false;
    }
  }

  async testConnection(): Promise<MqttConnectionTestResponse> {
    this.assertNoMqttUpdateInProgress();
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
      connected: result.success,
      checked_at: result.timestamp,
      message: result.success
        ? 'Conexão MQTT realizada com sucesso.'
        : (result.error ?? result.message),
    };
  }

  async reconnect(idUsuario: number): Promise<MqttConnectionActionResponse> {
    return await this.executeProtectedOperationalAction(
      'RECONNECT',
      idUsuario,
      async () => {
        const result = await this.mqttClientService.reconnect();

        return {
          success: result.success,
          message: result.message,
          error: result.error ?? null,
          executed_at: result.timestamp,
        };
      },
    );
  }

  async disconnect(idUsuario: number): Promise<MqttConnectionActionResponse> {
    return await this.executeProtectedOperationalAction(
      'DISCONNECT',
      idUsuario,
      async () => {
        const result = await this.mqttClientService.disconnect();

        return {
          success: result.success,
          message: result.message,
          error: result.error ?? null,
          executed_at: result.timestamp,
        };
      },
    );
  }

  async sincronizarHardware(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    return await this.executeProtectedOperationalAction(
      'SYNC_HARDWARE',
      options.solicitado_por ?? null,
      async () => {
        await this.ensureMqttConnected();

        const command = await this.commandService.sincronizarHardware({
          ...options,
          motivo:
            options.motivo ??
            'Sincronização de hardware solicitado pela interface do sistema.',
        });

        return this.buildCommandResponse(command);
      },
    );
  }

  async reiniciarComunicacao(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    return await this.executeProtectedOperationalAction(
      'RESTART_COMMUNICATION',
      options.solicitado_por ?? null,
      async () => {
        await this.ensureMqttConnected();

        const command = await this.commandService.reiniciarComunicacao({
          ...options,
          motivo:
            options.motivo ??
            'Reinício de comunicação solicitado pela interface do sistema.',
        });

        return this.buildCommandResponse(command);
      },
    );
  }

  async paradaEmergencia(
    options: CommandOptions,
  ): Promise<MqttEmergencyStopExecutionResponse> {
    const emergency =
      await this.processoGeneralClosureService.requestEmergencyStopForCurrent({
        ...(options.id_processo !== undefined
          ? { id_processo: options.id_processo }
          : {}),
        id_usuario: options.solicitado_por ?? null,
        motivo:
          options.motivo ??
          'Parada de emergencia solicitada pela interface do sistema.',
      });

    this.logger.error(
      `Parada de emergencia coordenada solicitada via HTTP. Escopo: ${emergency.escopo}. Processo: ${emergency.id_processo ?? 'nenhum'}.`,
    );

    return {
      success: true,
      message:
        emergency.escopo === 'PROCESSO'
          ? 'Parada persistida e comandos enviados; acompanhe a confirmacao do controlador.'
          : 'Nenhum processo operacional foi encontrado; comandos globais enviados em modo best-effort, sem confirmacao persistida.',
      emergency,
      executed_at: new Date(),
    };
  }

  async desligarTodasBombas(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    return await this.executeProtectedOperationalAction(
      'SHUTDOWN_ALL_PUMPS',
      options.solicitado_por ?? null,
      async () => {
        await this.ensureMqttConnected();

        const command = await this.commandService.desligarTodasBombas({
          ...options,
          motivo:
            options.motivo ??
            'Desligamento de todas as bombas solicitado pela interface do sistema.',
        });

        return this.buildCommandResponse(command);
      },
    );
  }

  async abrirTodasValvulas(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    return await this.executeProtectedOperationalAction(
      'OPEN_ALL_VALVES',
      options.solicitado_por ?? null,
      async () => {
        await this.ensureMqttConnected();

        const command = await this.commandService.abrirTodasValvulas({
          ...options,
          motivo:
            options.motivo ??
            'Abertura de todas as válvulas solicitada pela interface do sistema.',
        });

        return this.buildCommandResponse(command);
      },
    );
  }

  async fecharTodasValvulas(
    options: CommandOptions,
  ): Promise<MqttCommandExecutionResponse> {
    return await this.executeProtectedOperationalAction(
      'CLOSE_ALL_VALVES',
      options.solicitado_por ?? null,
      async () => {
        await this.ensureMqttConnected();

        const command = await this.commandService.fecharTodasValvulas({
          ...options,
          motivo:
            options.motivo ??
            'Fechamento de todas as válvulas solicitado pela interface do sistema.',
        });

        return this.buildCommandResponse(command);
      },
    );
  }

  private async executeProtectedOperationalAction<T>(
    action: MqttOperationalControlAction,
    idUsuario: number | null,
    operation: () => Promise<T>,
  ): Promise<T> {
    this.assertNoMqttUpdateInProgress();
    const leaseToken = randomUUID();
    let leaseClaimed = false;

    try {
      await this.mqttConfigService.claimOperationalControlLease(
        leaseToken,
        action,
      );
      leaseClaimed = true;

      const result = await operation();
      this.logger.warn(
        `Operacao administrativa MQTT ${action} executada pelo usuario ${idUsuario ?? 'sistema'}.`,
      );
      return result;
    } finally {
      if (leaseClaimed) {
        await this.mqttConfigService
          .releaseOperationalControlLease(leaseToken)
          .catch((error: unknown) => {
            this.logger.error(
              `Nao foi possivel liberar imediatamente o lease da operacao MQTT ${action}. O lease expirara automaticamente.`,
              error instanceof Error ? error.stack : undefined,
            );
          });
      }
    }
  }

  private async ensureMqttConnected(
    options: { allowDuringMqttUpdate?: boolean } = {},
  ): Promise<void> {
    if (!options.allowDuringMqttUpdate) {
      this.assertNoMqttUpdateInProgress();
    }
    if (this.mqttClientService.getConnectionState()) {
      return;
    }

    const result = await this.mqttClientService.connect();

    if (!result.success) {
      throw new ServiceUnavailableException(
        result.error ??
          'Não foi possível executar o comando porque o backend não está conectado ao broker MQTT.',
      );
    }
  }

  private sanitizeConfig(config: MqttConfigEntity): SanitizedMqttConfig {
    return {
      id_usuario_alteracao: config.id_usuario_alteracao ?? null,
      id_mqtt_configuracao: config.id_mqtt_configuracao,
      broker_url: config.broker_url,
      porta: config.porta,
      ...this.buildCredentialState(config),
      topico_leituras: config.topico_leituras,
      topico_comandos: config.topico_comandos,
      topico_status: config.topico_status,
      topico_alarmes: config.topico_alarmes,
      topico_heartbeat: config.topico_heartbeat,
      topico_acoplamentos: config.topico_acoplamentos,
      topico_configuracoes: config.topico_configuracoes,
      topico_acks: config.topico_acks,
      reconexao_automatica: config.reconexao_automatica,
      timeout_comunicacao: config.timeout_comunicacao,
      status_conexao: config.status_conexao,
      ultima_conexao: config.ultima_conexao ?? null,
      ultima_sincronizacao: config.ultima_sincronizacao ?? null,
      ultima_falha: config.ultima_falha ?? null,
      ativo: config.ativo,
      connected: this.mqttClientService.getConnectionState(),
      configuracao_aplicada: this.mqttClientService.isConfigApplied(config),
      criado_em: config.criado_em,
      atualizado_em: config.atualizado_em,
    };
  }

  private buildCredentialState(config: MqttConfigEntity) {
    const credenciaisConfiguradas =
      config.usuario_mqtt_configurado && config.senha_mqtt_configurada;
    const credenciaisVerificadas =
      credenciaisConfiguradas &&
      config.credenciais_verificadas_em != null &&
      config.ultima_falha_credenciais == null;

    return {
      usuario_mqtt_configurado: config.usuario_mqtt_configurado,
      senha_mqtt_configurada: config.senha_mqtt_configurada,
      credenciais_configuradas: credenciaisConfiguradas,
      credenciais_verificadas: credenciaisVerificadas,
      credenciais_verificadas_em: config.credenciais_verificadas_em ?? null,
      ultima_falha_credenciais: config.ultima_falha_credenciais ?? null,
    };
  }

  private sanitizeConnectionError(
    message: string,
    credentials: MqttCredentials | null = null,
  ): string {
    let sanitized = message;
    if (credentials) {
      for (const secret of [credentials.password, credentials.username].sort(
        (left, right) => right.length - left.length,
      )) {
        if (secret) {
          sanitized = sanitized.split(secret).join('[redigido]');
        }
      }
    }

    return sanitized
      .replace(/\p{Cc}/gu, ' ')
      .trim()
      .slice(0, 1000);
  }

  private buildCredentialProbeException(
    verification: MqttCredentialProbeResult,
  ): ServiceUnavailableException | UnprocessableEntityException {
    const response = {
      code: verification.failureCode ?? 'MQTT_CREDENTIALS_NOT_VERIFIED',
      message: verification.message,
      credenciais_atualizadas: false,
      credenciais_anteriores_preservadas: true,
      erro_conexao: verification.error ?? null,
      testado_em: verification.timestamp,
    };

    if (verification.failureCode === 'BROKER_UNAVAILABLE') {
      return new ServiceUnavailableException(response);
    }

    return new UnprocessableEntityException(response);
  }

  private buildConfigurationProbeException(
    verification: MqttConfigurationProbeResult,
  ): ServiceUnavailableException | UnprocessableEntityException {
    const response = {
      code: verification.failureCode ?? 'MQTT_CONFIG_NOT_VERIFIED',
      message: verification.message,
      configuracao_atualizada: false,
      configuracao_anterior_preservada: true,
      erro_conexao: verification.error ?? null,
      testado_em: verification.timestamp,
    };

    if (verification.failureCode === 'BROKER_UNAVAILABLE') {
      return new ServiceUnavailableException(response);
    }

    return new UnprocessableEntityException(response);
  }

  private async rollbackConfigurationUpdate(input: {
    previousConfig: ActiveMqttConfig;
    idUsuarioAlteracao: number;
    updateLeaseToken: string;
    originalError: unknown;
    credentials: MqttCredentials | null;
  }): Promise<ServiceUnavailableException> {
    let databaseRestored = false;
    let previousConnectionRestored = false;
    let rollbackError: string | null = null;

    try {
      await this.mqttConfigService.restoreOperationalConfig(
        input.previousConfig,
        input.idUsuarioAlteracao,
        input.updateLeaseToken,
      );
      databaseRestored = true;

      const reconnect = await this.mqttClientService.reconnect();
      const restoredConfig = await this.mqttConfigService.getConfig();
      previousConnectionRestored =
        reconnect.success &&
        this.mqttClientService.isConfigApplied(restoredConfig);
      await this.mqttHealthService.reloadHealthConfig();
      if (!previousConnectionRestored) {
        rollbackError = this.sanitizeConnectionError(
          reconnect.error ?? reconnect.message,
          input.credentials,
        );
      }
    } catch (error) {
      rollbackError = this.sanitizeConnectionError(
        this.getErrorMessage(error),
        input.credentials,
      );
    }

    const originalError = this.sanitizeConnectionError(
      this.getErrorMessage(input.originalError),
      input.credentials,
    );
    this.logger.error(
      `Falha ao aplicar configuracao MQTT candidata. ` +
        `Banco restaurado: ${databaseRestored}. ` +
        `Conexao anterior restaurada: ${previousConnectionRestored}.`,
    );

    return new ServiceUnavailableException({
      code: databaseRestored
        ? 'MQTT_CONFIG_APPLY_FAILED_ROLLED_BACK'
        : 'MQTT_CONFIG_APPLY_FAILED_ROLLBACK_INCOMPLETE',
      message: databaseRestored
        ? 'A configuracao candidata nao foi aplicada e a configuracao anterior foi restaurada.'
        : 'A configuracao candidata falhou e a restauracao automatica nao foi concluida.',
      configuracao_atualizada: false,
      configuracao_anterior_restaurada: databaseRestored,
      conexao_anterior_restaurada: previousConnectionRestored,
      erro_aplicacao: originalError,
      erro_rollback: rollbackError,
    });
  }

  private assertNoMqttUpdateInProgress(): void {
    if (
      this.credentialsUpdateInProgress ||
      this.configurationUpdateInProgress
    ) {
      throw new ConflictException({
        code: 'MQTT_UPDATE_ALREADY_IN_PROGRESS',
        message: 'Ja existe uma atualizacao MQTT em andamento.',
      });
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Erro MQTT desconhecido.';
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
