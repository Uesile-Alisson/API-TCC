import { statusconexaomqtt } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandService } from './commands/command.service';
import { MqttConfigService } from './config/mqtt-config.service';
import { MqttCredentialsService } from './config/mqtt-credentials.service';
import { ProcessoGeneralClosureService } from '../processos/lifecycle';
import { MqttClientService } from './connection/mqtt-client.service';
import { MqttHealthService } from './connection/mqtt-health.service';
import type { ActiveMqttConfig } from './interfaces/active-mqtt-config.interface';
import { MqttService } from './mqtt.service';

const asyncMock = <T>(implementation: () => Promise<T>) =>
  jest.fn<(...args: unknown[]) => Promise<T>>(implementation);

describe('MqttService - estado publico das credenciais', () => {
  it('expoe indicadores derivados sem retornar usuario, senha ou hash', async () => {
    const verifiedAt = new Date('2026-07-17T12:00:00.000Z');
    const config = makeConfig({
      usuario_mqtt_configurado: true,
      senha_mqtt_configurada: true,
      credenciais_verificadas_em: verifiedAt,
    });
    const service = makeService(config, true);

    const [publicConfig, status] = await Promise.all([
      service.getConfig(),
      service.getStatus(),
    ]);

    expect(publicConfig).toMatchObject({
      usuario_mqtt_configurado: true,
      senha_mqtt_configurada: true,
      credenciais_configuradas: true,
      credenciais_verificadas: true,
      credenciais_verificadas_em: verifiedAt,
      ultima_falha_credenciais: null,
    });
    expect(publicConfig).not.toHaveProperty('usuario_mqtt');
    expect(publicConfig).not.toHaveProperty('senha_mqtt');
    expect(publicConfig).not.toHaveProperty('senha_mqtt_hash');
    expect(status.mqtt).toMatchObject({
      connected: true,
      operacional: true,
      credenciais_configuradas: true,
      credenciais_verificadas: true,
    });
    expect(status.comunicacao_pronta_para_processos).toBe(false);
    expect(status.bloqueios_comunicacao_processos).toContain('ESP32_OFFLINE');
  });

  it('nao confunde arquivo incompleto com conexao ativa', async () => {
    const service = makeService(
      makeConfig({
        usuario_mqtt_configurado: true,
        senha_mqtt_configurada: false,
        credenciais_verificadas_em: new Date('2026-07-17T12:00:00.000Z'),
      }),
      true,
    );

    const status = await service.getStatus();

    expect(status.mqtt.connected).toBe(true);
    expect(status.mqtt.operacional).toBe(false);
    expect(status.mqtt.credenciais_configuradas).toBe(false);
    expect(status.mqtt.credenciais_verificadas).toBe(false);
    expect(status.bloqueios_comunicacao_processos).toContain(
      'CREDENCIAIS_MQTT_NAO_CONFIGURADAS',
    );
  });

  it('atualiza o arquivo externo, tenta reconectar e retorna somente indicadores', async () => {
    const verifiedAt = new Date('2026-07-17T13:00:00.000Z');
    const config = makeConfig({
      usuario_mqtt_configurado: true,
      senha_mqtt_configurada: true,
      credenciais_verificadas_em: verifiedAt,
      status_conexao: statusconexaomqtt.CONECTADO,
    });
    const configureCredentials = asyncMock(() => Promise.resolve());
    const validateAndNormalizeCredentials = jest.fn(
      (input: { usuario_mqtt: string; senha_mqtt: string }) => input,
    );
    const verifyCredentials = asyncMock(() =>
      Promise.resolve({
        success: true,
        failureCode: null,
        message: 'Credenciais aceitas',
        timestamp: new Date('2026-07-17T12:59:59.000Z'),
      }),
    );
    const reconnect = jest.fn(() =>
      Promise.resolve({
        success: true,
        message: 'Conectado',
        timestamp: new Date('2026-07-17T13:00:00.000Z'),
      }),
    );
    const claimCredentialsUpdateLease = asyncMock(() =>
      Promise.resolve(new Date('2026-07-17T13:05:00.000Z')),
    );
    const renewCredentialsUpdateLease = asyncMock(() =>
      Promise.resolve(new Date('2026-07-17T13:05:01.000Z')),
    );
    const releaseCredentialsUpdateLease = asyncMock(() => Promise.resolve());
    const service = new MqttService(
      {
        getConfig: jest.fn(() => Promise.resolve(config)),
        claimCredentialsUpdateLease,
        renewCredentialsUpdateLease,
        releaseCredentialsUpdateLease,
      } as unknown as MqttConfigService,
      {
        verifyCredentials,
        reconnect,
        getConnectionState: jest.fn(() => true),
      } as unknown as MqttClientService,
      {
        getCurrentState: jest.fn(() => ({ esp32Online: false })),
      } as unknown as MqttHealthService,
      {} as CommandService,
      {
        configureCredentials,
        validateAndNormalizeCredentials,
      } as unknown as MqttCredentialsService,
      {} as ProcessoGeneralClosureService,
    );
    const dto = {
      usuario_mqtt: 'usuario-externo',
      senha_mqtt: 'senha-externa',
    };

    const result = await service.updateCredentials(dto, 7);

    expect(validateAndNormalizeCredentials).toHaveBeenCalledWith(dto);
    expect(claimCredentialsUpdateLease).toHaveBeenCalledWith(
      expect.any(String),
    );
    expect(verifyCredentials).toHaveBeenCalledWith({
      username: 'usuario-externo',
      password: 'senha-externa',
    });
    expect(configureCredentials).toHaveBeenCalledWith(dto, 7);
    expect(renewCredentialsUpdateLease).toHaveBeenCalledWith(
      expect.any(String),
    );
    expect(releaseCredentialsUpdateLease).toHaveBeenCalledWith(
      expect.any(String),
    );
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(verifyCredentials.mock.invocationCallOrder[0]).toBeLessThan(
      renewCredentialsUpdateLease.mock.invocationCallOrder[0],
    );
    expect(
      renewCredentialsUpdateLease.mock.invocationCallOrder[0],
    ).toBeLessThan(configureCredentials.mock.invocationCallOrder[0]);
    expect(configureCredentials.mock.invocationCallOrder[0]).toBeLessThan(
      reconnect.mock.invocationCallOrder[0],
    );
    expect(result).toMatchObject({
      credenciais_atualizadas: true,
      credenciais_configuradas: true,
      credenciais_verificadas: true,
      credenciais_verificadas_em: verifiedAt,
      connected: true,
      erro_conexao: null,
    });
    expect(JSON.stringify(result)).not.toContain('usuario-externo');
    expect(JSON.stringify(result)).not.toContain('senha-externa');
  });

  it('preserva o arquivo e a conexao principal quando o broker rejeita a credencial candidata', async () => {
    const configureCredentials = jest.fn(() => Promise.resolve());
    const reconnect = jest.fn(() => Promise.resolve());
    const service = new MqttService(
      {
        getConfig: jest.fn(() => Promise.resolve(makeConfig())),
        claimCredentialsUpdateLease: jest.fn(() => Promise.resolve(new Date())),
        renewCredentialsUpdateLease: jest.fn(() => Promise.resolve(new Date())),
        releaseCredentialsUpdateLease: jest.fn(() => Promise.resolve()),
      } as unknown as MqttConfigService,
      {
        verifyCredentials: jest.fn(() =>
          Promise.resolve({
            success: false,
            failureCode: 'AUTHENTICATION_REJECTED' as const,
            message: 'O broker MQTT recusou o usuario ou a senha informados.',
            error: 'Connection refused: Not authorized',
            timestamp: new Date('2026-07-17T13:00:00.000Z'),
          }),
        ),
        reconnect,
      } as unknown as MqttClientService,
      {} as MqttHealthService,
      {} as CommandService,
      {
        validateAndNormalizeCredentials: jest.fn((input) => input),
        configureCredentials,
      } as unknown as MqttCredentialsService,
      {} as ProcessoGeneralClosureService,
    );

    await expect(
      service.updateCredentials(
        {
          usuario_mqtt: 'usuario-invalido',
          senha_mqtt: 'senha-invalida',
        },
        7,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(configureCredentials).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
  });

  it('nao grava a credencial quando o broker esta indisponivel para o teste', async () => {
    const configureCredentials = jest.fn(() => Promise.resolve());
    const service = new MqttService(
      {
        claimCredentialsUpdateLease: jest.fn(() => Promise.resolve(new Date())),
        renewCredentialsUpdateLease: jest.fn(() => Promise.resolve(new Date())),
        releaseCredentialsUpdateLease: jest.fn(() => Promise.resolve()),
      } as unknown as MqttConfigService,
      {
        verifyCredentials: jest.fn(() =>
          Promise.resolve({
            success: false,
            failureCode: 'BROKER_UNAVAILABLE' as const,
            message:
              'Nao foi possivel confirmar as novas credenciais no broker MQTT.',
            error: 'ECONNREFUSED',
            timestamp: new Date('2026-07-17T13:00:00.000Z'),
          }),
        ),
      } as unknown as MqttClientService,
      {} as MqttHealthService,
      {} as CommandService,
      {
        validateAndNormalizeCredentials: jest.fn((input) => input),
        configureCredentials,
      } as unknown as MqttCredentialsService,
      {} as ProcessoGeneralClosureService,
    );

    await expect(
      service.updateCredentials(
        {
          usuario_mqtt: 'usuario-novo',
          senha_mqtt: 'senha-nova',
        },
        7,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(configureCredentials).not.toHaveBeenCalled();
  });

  it('bloqueia antes do teste e da gravacao quando existe processo operacional', async () => {
    const verifyCredentials = jest.fn(() => Promise.resolve());
    const configureCredentials = jest.fn(() => Promise.resolve());
    const reconnect = jest.fn(() => Promise.resolve());
    const releaseCredentialsUpdateLease = jest.fn(() => Promise.resolve());
    const service = new MqttService(
      {
        claimCredentialsUpdateLease: jest.fn(() =>
          Promise.reject(
            new ConflictException({
              code: 'MQTT_CREDENTIALS_UPDATE_BLOCKED_BY_ACTIVE_PROCESS',
              message: 'Processo 42 em execucao.',
            }),
          ),
        ),
        releaseCredentialsUpdateLease,
      } as unknown as MqttConfigService,
      {
        verifyCredentials,
        reconnect,
      } as unknown as MqttClientService,
      {} as MqttHealthService,
      {} as CommandService,
      {
        validateAndNormalizeCredentials: jest.fn((input) => input),
        configureCredentials,
      } as unknown as MqttCredentialsService,
      {} as ProcessoGeneralClosureService,
    );

    await expect(
      service.updateCredentials(
        {
          usuario_mqtt: 'usuario-novo',
          senha_mqtt: 'senha-nova',
        },
        7,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(verifyCredentials).not.toHaveBeenCalled();
    expect(configureCredentials).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
    expect(releaseCredentialsUpdateLease).not.toHaveBeenCalled();
  });

  it('nao grava se o intertravamento for perdido entre o teste e a gravacao', async () => {
    const configureCredentials = jest.fn(() => Promise.resolve());
    const reconnect = jest.fn(() => Promise.resolve());
    const releaseCredentialsUpdateLease = jest.fn(() => Promise.resolve());
    const service = new MqttService(
      {
        claimCredentialsUpdateLease: jest.fn(() => Promise.resolve(new Date())),
        renewCredentialsUpdateLease: jest.fn(() =>
          Promise.reject(
            new ConflictException({
              code: 'MQTT_CREDENTIALS_UPDATE_BLOCKED_BY_ACTIVE_PROCESS',
              message: 'Processo iniciou antes da gravacao.',
            }),
          ),
        ),
        releaseCredentialsUpdateLease,
      } as unknown as MqttConfigService,
      {
        verifyCredentials: jest.fn(() =>
          Promise.resolve({
            success: true,
            failureCode: null,
            message: 'Credenciais aceitas.',
            timestamp: new Date(),
          }),
        ),
        reconnect,
      } as unknown as MqttClientService,
      {} as MqttHealthService,
      {} as CommandService,
      {
        validateAndNormalizeCredentials: jest.fn((input) => input),
        configureCredentials,
      } as unknown as MqttCredentialsService,
      {} as ProcessoGeneralClosureService,
    );

    await expect(
      service.updateCredentials(
        {
          usuario_mqtt: 'usuario-novo',
          senha_mqtt: 'senha-nova',
        },
        7,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(configureCredentials).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
    expect(releaseCredentialsUpdateLease).toHaveBeenCalledTimes(1);
  });

  it('testa, persiste, reconecta e confirma a configuracao candidata nessa ordem', async () => {
    const previous = makeConfig({
      usuario_mqtt_configurado: true,
      senha_mqtt_configurada: true,
      credenciais_verificadas_em: new Date('2026-07-19T12:00:00.000Z'),
    });
    const candidate = makeConfig({
      ...previous,
      broker_url: 'mqtt://broker-novo:1884',
      porta: 1884,
      status_conexao: statusconexaomqtt.DESCONECTADO,
    });
    const applied = {
      ...candidate,
      status_conexao: statusconexaomqtt.CONECTADO,
    };
    let current = previous;
    const claimConfigurationUpdateLease = asyncMock(() =>
      Promise.resolve(new Date()),
    );
    const renewConfigurationUpdateLease = jest.fn(() =>
      Promise.resolve(new Date()),
    );
    const updateConfig = jest.fn(() => {
      current = applied;
      return Promise.resolve(applied);
    });
    const releaseConfigurationUpdateLease = asyncMock(() => Promise.resolve());
    const verifyConfiguration = asyncMock(() =>
      Promise.resolve({
        success: true,
        failureCode: null,
        message: 'Configuracao aceita.',
        timestamp: new Date(),
      }),
    );
    const reloadHealthConfig = jest.fn(() => Promise.resolve());
    const reconnect = jest.fn(() =>
      Promise.resolve({
        success: true,
        message: 'Conectado.',
        timestamp: new Date(),
      }),
    );
    const service = new MqttService(
      {
        claimConfigurationUpdateLease,
        renewConfigurationUpdateLease,
        releaseConfigurationUpdateLease,
        getConfig: jest.fn(() => Promise.resolve(current)),
        buildCandidateConfig: jest.fn(() => candidate),
        updateConfig,
      } as unknown as MqttConfigService,
      {
        verifyConfiguration,
        reconnect,
        getConnectionState: jest.fn(() => true),
        isConfigApplied: jest.fn(() => true),
      } as unknown as MqttClientService,
      { reloadHealthConfig } as unknown as MqttHealthService,
      {} as CommandService,
      {
        readCredentials: jest.fn(() =>
          Promise.resolve({ username: 'usuario', password: 'senha-segura' }),
        ),
      } as unknown as MqttCredentialsService,
      {} as ProcessoGeneralClosureService,
    );

    const result = await service.updateConfig({ porta: 1884 }, 7);

    expect(result).toMatchObject({
      broker_url: 'mqtt://broker-novo:1884',
      porta: 1884,
      connected: true,
      configuracao_aplicada: true,
    });
    expect(claimConfigurationUpdateLease).toHaveBeenCalledWith(
      expect.any(String),
    );
    expect(verifyConfiguration).toHaveBeenCalledWith(candidate, {
      username: 'usuario',
      password: 'senha-segura',
    });
    expect(verifyConfiguration.mock.invocationCallOrder[0]).toBeLessThan(
      renewConfigurationUpdateLease.mock.invocationCallOrder[0],
    );
    expect(
      renewConfigurationUpdateLease.mock.invocationCallOrder[0],
    ).toBeLessThan(updateConfig.mock.invocationCallOrder[0]);
    expect(updateConfig.mock.invocationCallOrder[0]).toBeLessThan(
      reconnect.mock.invocationCallOrder[0],
    );
    expect(reloadHealthConfig).toHaveBeenCalledTimes(1);
    expect(releaseConfigurationUpdateLease).toHaveBeenCalledWith(
      expect.any(String),
    );
  });

  it('preserva banco e cliente principal quando o teste da candidata falha', async () => {
    const previous = makeConfig();
    const updateConfig = jest.fn(() => Promise.resolve());
    const reconnect = jest.fn(() => Promise.resolve());
    const releaseConfigurationUpdateLease = jest.fn(() => Promise.resolve());
    const service = new MqttService(
      {
        claimConfigurationUpdateLease: jest.fn(() =>
          Promise.resolve(new Date()),
        ),
        releaseConfigurationUpdateLease,
        getConfig: jest.fn(() => Promise.resolve(previous)),
        buildCandidateConfig: jest.fn(() => ({
          ...previous,
          broker_url: 'mqtt://invalido:1884',
        })),
        updateConfig,
      } as unknown as MqttConfigService,
      {
        verifyConfiguration: jest.fn(() =>
          Promise.resolve({
            success: false,
            failureCode: 'BROKER_UNAVAILABLE' as const,
            message: 'Broker indisponivel.',
            error: 'ECONNREFUSED',
            timestamp: new Date(),
          }),
        ),
        reconnect,
      } as unknown as MqttClientService,
      {} as MqttHealthService,
      {} as CommandService,
      {
        readCredentials: jest.fn(() =>
          Promise.resolve({ username: 'usuario', password: 'senha' }),
        ),
      } as unknown as MqttCredentialsService,
      {} as ProcessoGeneralClosureService,
    );

    await expect(
      service.updateConfig({ porta: 1884 }, 7),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(updateConfig).not.toHaveBeenCalled();
    expect(reconnect).not.toHaveBeenCalled();
    expect(releaseConfigurationUpdateLease).toHaveBeenCalledTimes(1);
  });

  it('restaura banco e conexao anteriores quando a aplicacao principal falha', async () => {
    const previous = makeConfig({
      broker_url: 'mqtt://broker-anterior:1883',
    });
    const candidate = makeConfig({
      broker_url: 'mqtt://broker-candidato:1884',
      porta: 1884,
    });
    let current = previous;
    const restoreOperationalConfig = asyncMock(() => {
      current = previous;
      return Promise.resolve(previous);
    });
    const reconnect = jest
      .fn<(...args: unknown[]) => Promise<Record<string, unknown>>>()
      .mockResolvedValueOnce({
        success: false,
        message: 'Falha candidata.',
        error: 'usuario senha-secreta recusados',
        timestamp: new Date(),
      })
      .mockResolvedValueOnce({
        success: true,
        message: 'Anterior restaurada.',
        timestamp: new Date(),
      });
    const reloadHealthConfig = jest.fn(() => Promise.resolve());
    const service = new MqttService(
      {
        claimConfigurationUpdateLease: jest.fn(() =>
          Promise.resolve(new Date()),
        ),
        renewConfigurationUpdateLease: jest.fn(() =>
          Promise.resolve(new Date()),
        ),
        releaseConfigurationUpdateLease: jest.fn(() => Promise.resolve()),
        getConfig: jest.fn(() => Promise.resolve(current)),
        buildCandidateConfig: jest.fn(() => candidate),
        updateConfig: jest.fn(() => {
          current = candidate;
          return Promise.resolve(candidate);
        }),
        restoreOperationalConfig,
      } as unknown as MqttConfigService,
      {
        verifyConfiguration: jest.fn(() =>
          Promise.resolve({
            success: true,
            failureCode: null,
            message: 'Aceita.',
            timestamp: new Date(),
          }),
        ),
        reconnect,
        isConfigApplied: jest.fn(
          (config: ActiveMqttConfig) =>
            config.broker_url === 'mqtt://broker-anterior:1883',
        ),
      } as unknown as MqttClientService,
      { reloadHealthConfig } as unknown as MqttHealthService,
      {} as CommandService,
      {
        readCredentials: jest.fn(() =>
          Promise.resolve({ username: 'usuario', password: 'senha-secreta' }),
        ),
      } as unknown as MqttCredentialsService,
      {} as ProcessoGeneralClosureService,
    );

    let response: unknown;
    try {
      await service.updateConfig({ porta: 1884 }, 7);
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      response = (error as ServiceUnavailableException).getResponse();
    }

    expect(restoreOperationalConfig).toHaveBeenCalledWith(
      previous,
      7,
      expect.any(String),
    );
    expect(reconnect).toHaveBeenCalledTimes(2);
    expect(reloadHealthConfig).toHaveBeenCalledTimes(1);
    expect(response).toMatchObject({
      code: 'MQTT_CONFIG_APPLY_FAILED_ROLLED_BACK',
      configuracao_anterior_restaurada: true,
      conexao_anterior_restaurada: true,
    });
    expect(JSON.stringify(response)).not.toContain('senha-secreta');
  });

  describe('intertravamento dos comandos administrativos', () => {
    it.each([
      ['RECONNECT', 'reconnect'],
      ['DISCONNECT', 'disconnect'],
      ['SYNC_HARDWARE', 'sincronizarHardware'],
      ['RESTART_COMMUNICATION', 'reiniciarComunicacao'],
      ['SHUTDOWN_ALL_PUMPS', 'desligarTodasBombas'],
      ['OPEN_ALL_VALVES', 'abrirTodasValvulas'],
      ['CLOSE_ALL_VALVES', 'fecharTodasValvulas'],
    ] as const)(
      'reserva %s antes de executar %s e sempre libera o lease',
      async (action, method) => {
        const context = makeOperationalService();

        if (method === 'reconnect' || method === 'disconnect') {
          await context.service[method](7);
        } else {
          await context.service[method]({ solicitado_por: 7 });
        }

        const effect =
          method === 'reconnect' || method === 'disconnect'
            ? context.client[method]
            : context.commands[method];
        expect(
          context.config.claimOperationalControlLease,
        ).toHaveBeenCalledWith(expect.any(String), action);
        expect(
          context.config.releaseOperationalControlLease,
        ).toHaveBeenCalledWith(expect.any(String));
        expect(
          context.config.claimOperationalControlLease.mock
            .invocationCallOrder[0],
        ).toBeLessThan(effect.mock.invocationCallOrder[0]);
        expect(effect.mock.invocationCallOrder[0]).toBeLessThan(
          context.config.releaseOperationalControlLease.mock
            .invocationCallOrder[0],
        );
      },
    );

    it('nao publica nem altera conexao quando o estado operacional recusa o lease', async () => {
      const context = makeOperationalService();
      context.config.claimOperationalControlLease.mockRejectedValue(
        new ConflictException({
          code: 'MQTT_OPERATION_BLOCKED_BY_PROCESS_STATE',
        }),
      );

      await expect(
        context.service.fecharTodasValvulas({ solicitado_por: 7 }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(context.commands.fecharTodasValvulas).not.toHaveBeenCalled();
      expect(context.client.connect).not.toHaveBeenCalled();
      expect(
        context.config.releaseOperationalControlLease,
      ).not.toHaveBeenCalled();
    });

    it('libera o lease mesmo quando o comando falha depois da reserva', async () => {
      const context = makeOperationalService();
      context.commands.abrirTodasValvulas.mockRejectedValue(
        new Error('ACK recusado'),
      );

      await expect(
        context.service.abrirTodasValvulas({ solicitado_por: 7 }),
      ).rejects.toThrow('ACK recusado');

      expect(
        context.config.releaseOperationalControlLease,
      ).toHaveBeenCalledTimes(1);
    });

    it('mantem a parada de emergencia fora do intertravamento e delega ao coordenador persistente', async () => {
      const context = makeOperationalService();
      context.config.claimOperationalControlLease.mockRejectedValue(
        new Error('nao deveria ser consultado'),
      );
      context.client.getConnectionState.mockReturnValue(false);
      (
        context.service as never as {
          configurationUpdateInProgress: boolean;
          credentialsUpdateInProgress: boolean;
        }
      ).configurationUpdateInProgress = true;
      (
        context.service as never as {
          configurationUpdateInProgress: boolean;
          credentialsUpdateInProgress: boolean;
        }
      ).credentialsUpdateInProgress = true;

      await expect(
        context.service.paradaEmergencia({ solicitado_por: 7 }),
      ).resolves.toMatchObject({ success: true });

      expect(
        context.config.claimOperationalControlLease,
      ).not.toHaveBeenCalled();
      expect(context.client.connect).not.toHaveBeenCalled();
      expect(
        context.generalClosure.requestEmergencyStopForCurrent,
      ).toHaveBeenCalledWith({
        id_usuario: 7,
        motivo: 'Parada de emergencia solicitada pela interface do sistema.',
      });
      expect(context.commands.paradaEmergencia).not.toHaveBeenCalled();
    });
  });
});

function makeOperationalService() {
  const operationResult = {
    success: true,
    message: 'Executado.',
    timestamp: new Date('2026-07-19T18:00:00.000Z'),
  };
  const commandResult = {
    comando: 'COMANDO_TESTE',
    topic: 'tsea/comandos',
    qos: 1,
    retain: false,
    correlation_id: 'cmd-operacional-1',
    published_at: new Date('2026-07-19T18:00:00.000Z'),
  };
  const config = {
    claimOperationalControlLease: asyncMock(() =>
      Promise.resolve(new Date('2026-07-19T18:05:00.000Z')),
    ),
    releaseOperationalControlLease: asyncMock(() => Promise.resolve()),
  };
  const client = {
    reconnect: jest.fn(() => Promise.resolve(operationResult)),
    disconnect: jest.fn(() => Promise.resolve(operationResult)),
    connect: jest.fn(() => Promise.resolve(operationResult)),
    getConnectionState: jest.fn(() => true),
  };
  const commands = {
    reiniciarComunicacao: jest.fn(() => Promise.resolve(commandResult)),
    sincronizarHardware: jest.fn(() => Promise.resolve(commandResult)),
    desligarTodasBombas: jest.fn(() => Promise.resolve(commandResult)),
    abrirTodasValvulas: jest.fn(() => Promise.resolve(commandResult)),
    fecharTodasValvulas: jest.fn(() => Promise.resolve(commandResult)),
    paradaEmergencia: jest.fn(() => Promise.resolve(commandResult)),
  };
  const generalClosure = {
    requestEmergencyStopForCurrent: asyncMock(() =>
      Promise.resolve({
        escopo: 'PROCESSO' as const,
        id_processo: 42,
        persistencia_confirmada: true,
        confirmacao_controlador: 'PENDENTE' as const,
        processo: null,
        command_results: [],
        command_failures: [],
      }),
    ),
  };
  const service = new MqttService(
    config as unknown as MqttConfigService,
    client as unknown as MqttClientService,
    {} as MqttHealthService,
    commands as unknown as CommandService,
    {} as MqttCredentialsService,
    generalClosure as unknown as ProcessoGeneralClosureService,
  );

  return { service, config, client, commands, generalClosure };
}

function makeService(config: ActiveMqttConfig, connected: boolean) {
  const configService = {
    getConfig: jest.fn(() => Promise.resolve(config)),
  };
  const clientService = {
    getConnectionState: jest.fn(() => connected),
    isConfigApplied: jest.fn(() => connected),
  };
  const healthService = {
    getCurrentState: jest.fn(() => ({ esp32Online: false })),
  };

  return new MqttService(
    configService as unknown as MqttConfigService,
    clientService as unknown as MqttClientService,
    healthService as unknown as MqttHealthService,
    {} as CommandService,
    {} as MqttCredentialsService,
    {} as ProcessoGeneralClosureService,
  );
}

function makeConfig(
  overrides: Partial<ActiveMqttConfig> = {},
): ActiveMqttConfig {
  return {
    id_mqtt_configuracao: 1,
    chave_configuracao: 'MQTT_PRINCIPAL',
    id_usuario_alteracao: null,
    broker_url: 'mqtt://localhost',
    porta: 1883,
    usuario_mqtt_configurado: false,
    senha_mqtt_configurada: false,
    credenciais_verificadas_em: null,
    ultima_falha_credenciais: null,
    topico_leituras: 'tsea/leituras',
    topico_comandos: 'tsea/comandos',
    topico_alarmes: 'tsea/alarmes',
    topico_heartbeat: 'tsea/heartbeat',
    topico_status: 'tsea/status',
    topico_acoplamentos: 'tsea/acoplamentos',
    topico_configuracoes: 'tsea/config',
    topico_acks: 'tsea/acks',
    reconexao_automatica: true,
    timeout_comunicacao: 10_000,
    status_conexao: statusconexaomqtt.CONECTADO,
    ultima_conexao: null,
    ultima_sincronizacao: null,
    ultima_falha: null,
    criado_em: new Date('2026-07-17T00:00:00.000Z'),
    atualizado_em: new Date('2026-07-17T00:00:00.000Z'),
    ativo: true,
    ...overrides,
  };
}
