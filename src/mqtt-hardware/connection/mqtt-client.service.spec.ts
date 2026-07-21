import { ServiceUnavailableException } from '@nestjs/common';
import { statusconexaomqtt } from '@prisma/client';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import mqtt, { MqttClient } from 'mqtt';
import { MqttConfigService } from '../config/mqtt-config.service';
import {
  MqttCredentials,
  MqttCredentialsService,
} from '../config/mqtt-credentials.service';
import { ActiveMqttConfig } from '../interfaces/active-mqtt-config.interface';
import { TopicMatcher } from '../topics/topic-matcher';
import { MqttClientService } from './mqtt-client.service';

describe('MqttClientService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    TopicMatcher.configure(makeConfig());
  });

  it('configura reconexao automatica e sessao MQTT persistente', () => {
    const service = makeService().service;

    const options = service['buildClientOptions'](
      makeConfig(),
      makeCredentials(),
    );

    expect(options).toMatchObject({
      clientId: process.env.MQTT_CLIENT_ID?.trim() || 'tsea-api-server',
      clean: false,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
      username: 'usuario-arquivo-externo',
      password: 'senha-arquivo-externo',
    });
  });

  it('testa credenciais em cliente isolado antes de permitir a rotacao', async () => {
    const { service } = makeService();
    const probeClient = makeProbeClient();
    const connectSpy = jest
      .spyOn(mqtt, 'connect')
      .mockReturnValue(probeClient.client);

    const verificationPromise = service.verifyCredentials(makeCredentials());
    probeClient.client.connected = true;
    (probeClient.client as unknown as EventEmitter).emit('connect');

    const result = await verificationPromise;

    expect(result).toMatchObject({
      success: true,
      failureCode: null,
    });
    expect(connectSpy).toHaveBeenCalledWith(
      'mqtt://localhost:1883',
      expect.objectContaining({
        clean: true,
        reconnectPeriod: 0,
        resubscribe: false,
        queueQoSZero: false,
        username: 'usuario-arquivo-externo',
        password: 'senha-arquivo-externo',
      }),
    );
    expect(probeClient.subscribeAsync).toHaveBeenCalledTimes(6);
    expect(probeClient.endAsync).toHaveBeenCalledWith(true);
    expect(service.getConnectionState()).toBe(false);
  });

  it('testa broker, porta e topicos da configuracao candidata sem consultar outra configuracao', async () => {
    const { service } = makeService();
    const probeClient = makeProbeClient();
    const connectSpy = jest
      .spyOn(mqtt, 'connect')
      .mockReturnValue(probeClient.client);
    const candidate = makeConfig({
      broker_url: 'mqtts://broker-novo.exemplo:8883',
      porta: 8884,
      topico_leituras: 'novo/leituras',
    });

    const verificationPromise = service.verifyConfiguration(
      candidate,
      makeCredentials(),
    );
    probeClient.client.connected = true;
    (probeClient.client as unknown as EventEmitter).emit('connect');

    await expect(verificationPromise).resolves.toMatchObject({
      success: true,
      failureCode: null,
    });
    expect(connectSpy).toHaveBeenCalledWith(
      'mqtts://broker-novo.exemplo:8884',
      expect.objectContaining({ reconnectPeriod: 0 }),
    );
    expect(probeClient.subscribeAsync).toHaveBeenCalledWith('novo/leituras', {
      qos: 0,
    });
    expect(TopicMatcher.isLeitura('tsea/leituras')).toBe(true);
    expect(TopicMatcher.isLeitura('novo/leituras')).toBe(false);
  });

  it('ativa o roteamento exato do snapshot aplicado pelo cliente principal', () => {
    TopicMatcher.configure(
      makeConfig({
        topico_leituras: 'planta-a/vacuo',
        topico_heartbeat: 'planta-a/vida',
        topico_acoplamentos: 'planta-a/mangueiras',
      }),
    );

    expect(TopicMatcher.isLeitura('planta-a/vacuo')).toBe(true);
    expect(TopicMatcher.isHeartbeat('planta-a/vida')).toBe(true);
    expect(TopicMatcher.isAcoplamento('planta-a/mangueiras')).toBe(true);
    expect(TopicMatcher.isHeartbeat('tsea/heartbeat')).toBe(false);
  });

  it('encerra o cliente temporario e nao altera o estado atual quando o broker rejeita a candidata', async () => {
    const { service, markAuthenticationFailure } = makeService();
    const probeClient = makeProbeClient();
    jest.spyOn(mqtt, 'connect').mockReturnValue(probeClient.client);

    const verificationPromise = service.verifyCredentials(makeCredentials());
    await flushPromises();
    probeClient.client.emit(
      'error',
      new Error(
        'Not authorized: usuario-arquivo-externo senha-arquivo-externo',
      ),
    );

    const result = await verificationPromise;

    expect(result).toMatchObject({
      success: false,
      failureCode: 'AUTHENTICATION_REJECTED',
    });
    expect(result.error).not.toContain('usuario-arquivo-externo');
    expect(result.error).not.toContain('senha-arquivo-externo');
    expect(probeClient.endAsync).toHaveBeenCalledWith(true);
    expect(markAuthenticationFailure).not.toHaveBeenCalled();
    expect(service.getConnectionState()).toBe(false);
  });

  it('recusa a candidata quando o broker nega uma assinatura obrigatoria', async () => {
    const { service } = makeService();
    const subscriptionError = Object.assign(
      new Error('Subscribe error: Not authorized'),
      { code: 128 },
    );
    const probeClient = makeProbeClient(subscriptionError);
    jest.spyOn(mqtt, 'connect').mockReturnValue(probeClient.client);

    const verificationPromise = service.verifyCredentials(makeCredentials());
    probeClient.client.connected = true;
    (probeClient.client as unknown as EventEmitter).emit('connect');

    await expect(verificationPromise).resolves.toMatchObject({
      success: false,
      failureCode: 'SUBSCRIPTION_REJECTED',
    });
    expect(probeClient.endAsync).toHaveBeenCalledWith(true);
  });

  it('recusa SUBACK com qos 128 mesmo quando subscribeAsync resolve', async () => {
    const { service } = makeService();
    const probeClient = makeProbeClient(undefined, 128);
    jest.spyOn(mqtt, 'connect').mockReturnValue(probeClient.client);

    const verificationPromise = service.verifyCredentials(makeCredentials());
    probeClient.client.connected = true;
    (probeClient.client as unknown as EventEmitter).emit('connect');

    await expect(verificationPromise).resolves.toMatchObject({
      success: false,
      failureCode: 'SUBSCRIPTION_REJECTED',
    });
  });

  it('limita a espera por SUBACK para nao ultrapassar o lease operacional', async () => {
    jest.useFakeTimers();
    const { service } = makeService();
    const pending = new Promise<void>(() => undefined);

    const boundedOperation = service['withTimeout'](
      pending,
      1_000,
      'Timeout de SUBACK.',
    );
    const expectation =
      expect(boundedOperation).rejects.toThrow('Timeout de SUBACK.');
    await jest.advanceTimersByTimeAsync(1_001);

    await expectation;
  });

  it('reflete queda, tentativa de reconexao e nova conexao nos estados persistidos', async () => {
    const { service, updateConnectionStatus } = makeService();
    const client = new EventEmitter();
    service['client'] = client as never;
    service['registerClientEvents']();

    client.emit('connect');
    await flushPromises();
    expect(service.getConnectionState()).toBe(true);
    expect(updateConnectionStatus).toHaveBeenLastCalledWith(
      statusconexaomqtt.CONECTADO,
      undefined,
    );

    client.emit('reconnect');
    await flushPromises();
    expect(service.getConnectionState()).toBe(false);
    expect(updateConnectionStatus).toHaveBeenLastCalledWith(
      statusconexaomqtt.RECONECTANDO,
      undefined,
    );

    client.emit('offline');
    await flushPromises();
    expect(updateConnectionStatus).toHaveBeenLastCalledWith(
      statusconexaomqtt.DESCONECTADO,
      undefined,
    );

    client.emit('connect');
    await flushPromises();
    expect(service.getConnectionState()).toBe(true);
  });

  it('marca falha MQTT e bloqueia publicacao enquanto desconectado', async () => {
    const { service, updateConnectionStatus } = makeService();
    const client = new EventEmitter();
    service['client'] = client as never;
    service['registerClientEvents']();

    client.emit('error', new Error('broker indisponivel'));
    await flushPromises();

    expect(service.getConnectionState()).toBe(false);
    expect(updateConnectionStatus).toHaveBeenLastCalledWith(
      statusconexaomqtt.FALHA,
      'broker indisponivel',
    );
    await expect(
      service.publish(
        'tsea/comandos',
        { comando: 'TESTE' },
        { qos: 1, retain: false },
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('marca credenciais como nao verificadas quando o broker recusa autenticacao', async () => {
    const { service, markAuthenticationFailure } = makeService();
    const client = new EventEmitter();
    service['client'] = client as never;
    service['registerClientEvents']();

    client.emit('error', new Error('Connection refused: Not authorized'));
    await flushPromises();

    expect(markAuthenticationFailure).toHaveBeenCalledWith(
      'Connection refused: Not authorized',
    );
  });

  it('serializa estado e credenciais na ordem dos eventos do mesmo cliente', async () => {
    const {
      service,
      updateConnectionStatus,
      markCredentialsVerified,
      markAuthenticationFailure,
    } = makeService();
    const firstWrite = deferred<void>();
    updateConnectionStatus
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValue(undefined);
    const client = new EventEmitter();
    service['client'] = client as never;
    service['registerClientEvents']();

    client.emit('connect');
    client.emit('error', new Error('Connection refused: Not authorized'));
    await flushPromises();

    expect(updateConnectionStatus).toHaveBeenCalledTimes(1);
    expect(updateConnectionStatus).toHaveBeenNthCalledWith(
      1,
      statusconexaomqtt.CONECTADO,
      undefined,
    );
    expect(markCredentialsVerified).not.toHaveBeenCalled();
    expect(markAuthenticationFailure).not.toHaveBeenCalled();

    firstWrite.resolve(undefined);
    await drainTransitions(service);

    expect(updateConnectionStatus).toHaveBeenNthCalledWith(
      2,
      statusconexaomqtt.FALHA,
      'Connection refused: Not authorized',
    );
    expect(markCredentialsVerified).toHaveBeenCalledTimes(1);
    expect(markAuthenticationFailure).toHaveBeenCalledWith(
      'Connection refused: Not authorized',
    );
    expect(markCredentialsVerified.mock.invocationCallOrder[0]).toBeLessThan(
      markAuthenticationFailure.mock.invocationCallOrder[0],
    );
    expect(service.getConnectionState()).toBe(false);
  });

  it('observa rejeicao da persistencia e mantem a fila utilizavel', async () => {
    const { service, updateConnectionStatus, markCredentialsVerified } =
      makeService();
    const warn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);
    updateConnectionStatus
      .mockRejectedValueOnce(new Error('PostgreSQL indisponivel'))
      .mockResolvedValue(undefined);
    const client = new EventEmitter();
    service['client'] = client as never;
    service['registerClientEvents']();

    client.emit('connect');
    client.emit('offline');
    await drainTransitions(service);

    expect(updateConnectionStatus).toHaveBeenNthCalledWith(
      1,
      statusconexaomqtt.CONECTADO,
      undefined,
    );
    expect(updateConnectionStatus).toHaveBeenNthCalledWith(
      2,
      statusconexaomqtt.DESCONECTADO,
      undefined,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('PostgreSQL indisponivel'),
    );
    expect(markCredentialsVerified).not.toHaveBeenCalled();
  });

  it('isola listener rejeitado e continua notificando os demais', async () => {
    const { service, updateConnectionStatus } = makeService();
    const rejectedListener = jest.fn<(...args: unknown[]) => Promise<void>>(
      () => Promise.reject(new Error('Socket indisponivel')),
    );
    const successfulListener = jest.fn<(...args: unknown[]) => Promise<void>>(
      () => Promise.resolve(),
    );
    service.registerConnectionStatusListener(rejectedListener);
    service.registerConnectionStatusListener(successfulListener);
    const client = new EventEmitter();
    service['client'] = client as never;
    service['registerClientEvents']();

    client.emit('connect');
    await drainTransitions(service);

    expect(updateConnectionStatus).toHaveBeenCalledWith(
      statusconexaomqtt.CONECTADO,
      undefined,
    );
    expect(rejectedListener).toHaveBeenCalledWith(
      statusconexaomqtt.CONECTADO,
      undefined,
    );
    expect(successfulListener).toHaveBeenCalledWith(
      statusconexaomqtt.CONECTADO,
      undefined,
    );
    expect(service.getConnectionState()).toBe(true);
  });

  it('aguarda transicao pendente e persiste desconectado por ultimo no shutdown', async () => {
    const { service, updateConnectionStatus } = makeService();
    const pendingReconnect = deferred<void>();
    updateConnectionStatus
      .mockImplementationOnce(() => pendingReconnect.promise)
      .mockResolvedValue(undefined);
    const client = makeOperationalClient();
    service['client'] = client.client;
    service['registerClientEvents']();

    client.client.emit('reconnect');
    await flushPromises();
    expect(updateConnectionStatus).toHaveBeenCalledTimes(1);

    const shutdown = service.onModuleDestroy();
    pendingReconnect.resolve(undefined);
    await shutdown;

    expect(client.end).toHaveBeenCalledTimes(1);
    expect(updateConnectionStatus).toHaveBeenLastCalledWith(
      statusconexaomqtt.DESCONECTADO,
      undefined,
    );
    expect(service['client']).toBeNull();
  });

  it('processa a mensagem mesmo quando ultima sincronizacao nao pode ser persistida', async () => {
    const { service, updateLastSync } = makeService();
    updateLastSync.mockRejectedValueOnce(new Error('Falha no timestamp'));
    const listener = jest.fn<(...args: unknown[]) => Promise<void>>(() =>
      Promise.resolve(),
    );
    service.registerMessageListener(listener);

    await service['handleIncomingMessage'](
      'tsea/heartbeat',
      Buffer.from(JSON.stringify({ status: 'ONLINE' })),
      { qos: 0, retain: false },
    );

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'tsea/heartbeat',
        payload: { status: 'ONLINE' },
      }),
    );
  });

  it('fecha e limpa o cliente mesmo quando persiste falha da conexao com erro', async () => {
    const { service, updateConnectionStatus } = makeService();
    updateConnectionStatus
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Banco indisponivel'));
    const failedClient = makeFailedConnectionClient();
    jest.spyOn(mqtt, 'connect').mockReturnValue(failedClient.client);
    jest
      .spyOn(service, 'waitForConnection')
      .mockRejectedValueOnce(new Error('Broker indisponivel'));

    const result = await service.connect();

    expect(result).toMatchObject({
      success: false,
      error: 'Broker indisponivel',
    });
    expect(failedClient.endAsync).toHaveBeenCalledWith(true);
    expect(service['client']).toBeNull();
    expect(service['isConnecting']).toBe(false);
  });

  it('permite a inicializacao da API quando o arquivo de credenciais nao existe', async () => {
    const updateConnectionStatus = jest.fn<
      (...args: unknown[]) => Promise<void>
    >(() => Promise.resolve());
    const configService = {
      getConfig: jest.fn(() => Promise.resolve(makeConfig())),
      updateConnectionStatus,
      updateLastSync: jest.fn(() => Promise.resolve()),
    };
    const credentialsService = {
      readCredentials: jest.fn(() =>
        Promise.reject(
          new ServiceUnavailableException(
            'Credenciais MQTT externas ainda nao configuradas.',
          ),
        ),
      ),
      markCredentialsVerified: jest.fn(() => Promise.resolve()),
      markAuthenticationFailure: jest.fn(() => Promise.resolve()),
    };
    const service = new MqttClientService(
      configService as unknown as MqttConfigService,
      credentialsService as unknown as MqttCredentialsService,
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(service.getConnectionState()).toBe(false);
    expect(updateConnectionStatus).toHaveBeenLastCalledWith(
      statusconexaomqtt.FALHA,
      'Credenciais MQTT externas ainda nao configuradas.',
      makeConfig(),
    );
  });
});

function makeService() {
  const updateConnectionStatus = jest.fn<(...args: unknown[]) => Promise<void>>(
    () => Promise.resolve(),
  );
  const updateLastSync = jest.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const markCredentialsVerified = jest.fn<
    (...args: unknown[]) => Promise<void>
  >(() => Promise.resolve());
  const markAuthenticationFailure = jest.fn<
    (...args: unknown[]) => Promise<void>
  >(() => Promise.resolve());
  const configService = {
    getConfig: jest.fn(() => Promise.resolve(makeConfig())),
    updateConnectionStatus,
    updateLastSync,
  };
  const credentialsService = {
    readCredentials: jest.fn(() => Promise.resolve(makeCredentials())),
    markCredentialsVerified,
    markAuthenticationFailure,
  };

  return {
    service: new MqttClientService(
      configService as unknown as MqttConfigService,
      credentialsService as unknown as MqttCredentialsService,
    ),
    updateConnectionStatus,
    updateLastSync,
    markCredentialsVerified,
    markAuthenticationFailure,
  };
}

function makeCredentials(): MqttCredentials {
  return {
    username: 'usuario-arquivo-externo',
    password: 'senha-arquivo-externo',
  };
}

function makeProbeClient(subscriptionError?: Error, grantedQos?: number) {
  const emitter = new EventEmitter();
  const subscribeAsync = subscriptionError
    ? jest.fn(() => Promise.reject(subscriptionError))
    : jest.fn((topic: string, options: { qos: number }) =>
        Promise.resolve([
          {
            topic,
            qos: grantedQos ?? options.qos,
          },
        ]),
      );
  const endAsync = jest.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const client = Object.assign(emitter, {
    connected: false,
    subscribeAsync,
    endAsync,
  }) as unknown as MqttClient;

  return {
    client,
    subscribeAsync,
    endAsync,
  };
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
    status_conexao: statusconexaomqtt.DESCONECTADO,
    ultima_conexao: null,
    ultima_sincronizacao: null,
    ultima_falha: null,
    criado_em: new Date('2026-07-17T00:00:00.000Z'),
    atualizado_em: new Date('2026-07-17T00:00:00.000Z'),
    ativo: true,
    ...overrides,
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function drainTransitions(service: MqttClientService): Promise<void> {
  return service['drainConnectionTransitions']();
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function makeOperationalClient() {
  const emitter = new EventEmitter();
  const end = jest.fn(
    (_force: boolean, _options: object, callback: () => void) => callback(),
  );
  const client = Object.assign(emitter, {
    connected: true,
    end,
  }) as unknown as MqttClient;

  return { client, end };
}

function makeFailedConnectionClient() {
  const emitter = new EventEmitter();
  const endAsync = jest.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const client = Object.assign(emitter, {
    connected: false,
    endAsync,
  }) as unknown as MqttClient;

  return { client, endAsync };
}
