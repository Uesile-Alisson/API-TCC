import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import mqtt, {
  IClientPublishOptions,
  ISubscriptionGrant,
  MqttClient,
} from 'mqtt';
import { statusconexaomqtt } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MqttConfigService } from '../config/mqtt-config.service';
import { ActiveMqttConfig } from '../interfaces/active-mqtt-config.interface';
import { MqttClientOptions } from '../interfaces/mqtt-client-options.interfaces';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttOperationResult } from '../interfaces/mqtt-operation-result.interface';
import { MqttPublishOptions } from '../interfaces/mqtt-publish-options.interface';
import { MqttSubscriptions } from '../interfaces/mqtt-subscription.interface';
import { TopicMatcher } from '../topics/topic-matcher';
import { MqttMessageValidator } from '../validators/mqtt-message.validator';
import {
  normalizeMqttBrokerUrl,
  sanitizeMqttBrokerUrlForLog,
} from '../config/mqtt-broker-url.util';
import {
  MqttCredentials,
  MqttCredentialsService,
} from '../config/mqtt-credentials.service';

type MqttMessageListenner = (message: MqttMessage) => Promise<void> | void;
type MqttConnectionStatusListener = (
  status: statusconexaomqtt,
  error?: string,
) => Promise<void> | void;

type MqttCredentialTransition =
  | { type: 'VERIFIED' }
  | { type: 'AUTHENTICATION_FAILURE'; message: string };

interface MqttConnectionTransition {
  status: statusconexaomqtt;
  error?: string;
  expectedConfig?: ActiveMqttConfig;
  client?: MqttClient;
  credential?: MqttCredentialTransition;
}

export type MqttCredentialProbeFailureCode =
  | 'AUTHENTICATION_REJECTED'
  | 'SUBSCRIPTION_REJECTED'
  | 'BROKER_UNAVAILABLE';

export type MqttCredentialProbeResult = MqttOperationResult & {
  failureCode: MqttCredentialProbeFailureCode | null;
};

export type MqttConfigurationProbeResult = MqttCredentialProbeResult;

@Injectable()
export class MqttClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttClientService.name);

  private client: MqttClient | null = null;
  private isConnecting = false;
  private isConnected = false;
  private appliedConfigFingerprint: string | null = null;
  private disconnectingClient: MqttClient | null = null;
  private isShuttingDown = false;
  private connectionTransitionQueue: Promise<void> = Promise.resolve();

  private readonly messageListenner = new Set<MqttMessageListenner>();
  private readonly connectionStatusListeners =
    new Set<MqttConnectionStatusListener>();

  constructor(
    private readonly mqttConfigService: MqttConfigService,
    private readonly mqttCredentialsService: MqttCredentialsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;

    try {
      await this.disconnect();
    } catch (error) {
      this.logger.warn(
        `Falha ao encerrar o cliente MQTT: ${this.getErrorMessage(error)}`,
      );
    } finally {
      await this.drainConnectionTransitions();
    }
  }

  async connect(): Promise<MqttOperationResult> {
    if (this.isShuttingDown) {
      return {
        success: false,
        message: 'Cliente MQTT esta em processo de encerramento.',
        timestamp: new Date(),
      };
    }

    if (this.isConnected && this.client) {
      return {
        success: true,
        message: 'Cliente MQTT já conectado.',
        timestamp: new Date(),
      };
    }

    if (this.isConnecting) {
      return {
        success: false,
        message: 'Cliente MQTT já está conectando.',
        timestamp: new Date(),
      };
    }

    this.isConnecting = true;
    let attemptedConfig: ActiveMqttConfig | undefined;

    try {
      const config = await this.mqttConfigService.getConfig();
      attemptedConfig = config;
      const credentials = await this.mqttCredentialsService.readCredentials();
      const clientOptions = this.buildClientOptions(config, credentials);
      const connectionUrl = this.buildConnectionUrl(clientOptions);

      await this.enqueueConnectionTransition({
        status: statusconexaomqtt.RECONECTANDO,
        expectedConfig: config,
      });

      this.logger.log(
        `Iniciando conexão MQTT em ${sanitizeMqttBrokerUrlForLog(connectionUrl)}`,
      );

      this.client = mqtt.connect(connectionUrl, {
        clientId: clientOptions.clientId,
        clean: clientOptions.clean,
        reconnectPeriod: config.reconexao_automatica
          ? clientOptions.reconnectPeriod
          : 0,
        connectTimeout: clientOptions.connectTimeout,
        username: clientOptions.username,
        password: clientOptions.password,
      });

      this.registerClientEvents(config);

      await this.waitForConnection(config.timeout_comunicacao);

      TopicMatcher.configure(config);
      const subscriptions = this.buildDefaultSubscriptions(config);
      await this.withTimeout(
        this.subscribeMany(subscriptions),
        config.timeout_comunicacao,
        'Timeout ao confirmar as assinaturas MQTT obrigatorias.',
      );

      await this.enqueueConnectionTransition({
        status: statusconexaomqtt.CONECTADO,
        expectedConfig: config,
        client: this.client ?? undefined,
        credential: { type: 'VERIFIED' },
      });

      this.isConnected = true;
      this.appliedConfigFingerprint = this.buildConfigFingerprint(config);

      return {
        success: true,
        message: 'Conexão MQTT realizada com sucesso',
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      this.logger.error(`Falha ao conectar no MQTT: ${errorMessage}`);

      try {
        await this.enqueueConnectionTransition({
          status: statusconexaomqtt.FALHA,
          error: errorMessage,
          expectedConfig: attemptedConfig,
          credential: this.isAuthenticationError(errorMessage)
            ? {
                type: 'AUTHENTICATION_FAILURE',
                message: errorMessage,
              }
            : undefined,
        });
      } catch (persistError) {
        this.logger.warn(
          `Falha ao persistir o erro da conexao MQTT: ${this.getErrorMessage(persistError)}`,
        );
      } finally {
        await this.closeFailedClientSafely();
      }

      return {
        success: false,
        message: 'Falha ao conectar ao broker MQTT.',
        error: errorMessage,
        timestamp: new Date(),
      };
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(): Promise<MqttOperationResult> {
    const client = this.client;
    if (!client) {
      this.isConnected = false;
      this.appliedConfigFingerprint = null;

      await this.enqueueConnectionTransition({
        status: statusconexaomqtt.DESCONECTADO,
      });

      return {
        success: true,
        message: 'Cliente MQTT já estava desconectado',
        timestamp: new Date(),
      };
    }

    this.disconnectingClient = client;
    try {
      await new Promise<void>((resolve) => {
        client.end(false, {}, () => {
          resolve();
        });
      });
    } finally {
      if (this.disconnectingClient === client) {
        this.disconnectingClient = null;
      }
    }

    this.forceClearCient();

    await this.enqueueConnectionTransition({
      status: statusconexaomqtt.DESCONECTADO,
    });

    return {
      success: true,
      message: 'Cliente MQTT desconectado com sucesso.',
      timestamp: new Date(),
    };
  }

  async reconnect(): Promise<MqttOperationResult> {
    await this.disconnect();
    return this.connect();
  }

  async verifyCredentials(
    credentials: MqttCredentials,
  ): Promise<MqttCredentialProbeResult> {
    const config = await this.mqttConfigService.getConfig();

    return await this.verifyConfiguration(config, credentials);
  }

  async verifyConfiguration(
    config: ActiveMqttConfig,
    credentials: MqttCredentials,
  ): Promise<MqttConfigurationProbeResult> {
    const clientOptions = this.buildClientOptions(config, credentials);
    const connectionUrl = this.buildConnectionUrl(clientOptions);
    let probeClient: MqttClient | null = null;

    try {
      const candidateClient = mqtt.connect(connectionUrl, {
        clientId: this.buildCredentialProbeClientId(),
        clean: true,
        reconnectPeriod: 0,
        connectTimeout: clientOptions.connectTimeout,
        username: credentials.username,
        password: credentials.password,
        resubscribe: false,
        queueQoSZero: false,
      });
      probeClient = candidateClient;

      await this.waitForClientConnection(
        candidateClient,
        config.timeout_comunicacao,
      );

      await this.withTimeout(
        Promise.all(
          this.buildDefaultSubscriptions(config).map(async (subscription) => {
            const grants = await candidateClient.subscribeAsync(
              subscription.topic,
              { qos: subscription.qos },
            );
            this.assertSubscriptionGranted(subscription.topic, grants);
          }),
        ),
        config.timeout_comunicacao,
        'Timeout ao confirmar as assinaturas MQTT da configuracao candidata.',
      );

      return {
        success: true,
        failureCode: null,
        message:
          'O broker aceitou as credenciais MQTT e as assinaturas obrigatorias.',
        timestamp: new Date(),
      };
    } catch (error) {
      const rawError = this.getErrorMessage(error);
      const failureCode = this.classifyCredentialProbeFailure(error, rawError);
      const safeError = this.sanitizeCredentialProbeError(
        rawError,
        credentials,
      );

      return {
        success: false,
        failureCode,
        message: this.buildCredentialProbeFailureMessage(failureCode),
        error: safeError,
        timestamp: new Date(),
      };
    } finally {
      if (probeClient) {
        await probeClient.endAsync(true).catch(() => undefined);
        probeClient.removeAllListeners();
      }
    }
  }

  async publish<TPayload extends object>(
    topic: string,
    payload: TPayload,
    options: MqttPublishOptions,
  ): Promise<MqttOperationResult> {
    this.ensureClientConnected();

    const client = this.client;

    if (!client) {
      throw new ServiceUnavailableException(
        'Cliente MQTT ainda não foi inicializado.',
      );
    }

    const publishOptions: IClientPublishOptions = {
      qos: options.qos,
      retain: options.retain,
    };

    const payloadAsString = JSON.stringify(payload);

    await new Promise<void>((resolve, reject) => {
      client.publish(topic, payloadAsString, publishOptions, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    return {
      success: true,
      message: `Mensagem publicada no tópico ${topic}`,
      timestamp: new Date(),
    };
  }

  async subscribe(
    subscription: MqttSubscriptions,
  ): Promise<MqttOperationResult> {
    this.ensureClientConnected();

    const client = this.client;

    if (!client) {
      throw new ServiceUnavailableException(
        'Cliente MQTT ainda não foi inicializado.',
      );
    }

    await new Promise<void>((resolve, reject) => {
      client.subscribe(
        subscription.topic,
        {
          qos: subscription.qos,
        },
        (error, grants) => {
          if (error) {
            reject(error);
            return;
          }

          try {
            this.assertSubscriptionGranted(subscription.topic, grants ?? []);
          } catch (subscriptionError) {
            reject(
              subscriptionError instanceof Error
                ? subscriptionError
                : new Error('Assinatura MQTT obrigatoria recusada.'),
            );
            return;
          }

          resolve();
        },
      );
    });

    return {
      success: true,
      message: `Inscrição realizada no tópico ${subscription.topic}`,
      timestamp: new Date(),
    };
  }

  async subscribeMany(subscriptions: MqttSubscriptions[]): Promise<void> {
    await Promise.all(
      subscriptions.map((subscription) => this.subscribe(subscription)),
    );
  }

  registerMessageListener(listener: MqttMessageListenner): void {
    this.messageListenner.add(listener);
  }

  removeMessageListener(listener: MqttMessageListenner): void {
    this.messageListenner.delete(listener);
  }

  registerConnectionStatusListener(
    listener: MqttConnectionStatusListener,
  ): void {
    this.connectionStatusListeners.add(listener);
  }

  removeConnectionStatusListener(listener: MqttConnectionStatusListener): void {
    this.connectionStatusListeners.delete(listener);
  }

  getConnectionState(): boolean {
    return this.isConnected;
  }

  isConfigApplied(config: ActiveMqttConfig): boolean {
    return (
      this.isConnected &&
      this.appliedConfigFingerprint === this.buildConfigFingerprint(config)
    );
  }

  private async notifyConnectionStatusListeners(
    status: statusconexaomqtt,
    error?: string,
  ): Promise<void> {
    for (const listener of this.connectionStatusListeners) {
      try {
        await listener(status, error);
      } catch (listenerError) {
        this.logger.warn(
          `Listener do estado MQTT falhou para ${String(status)}: ${this.getErrorMessage(listenerError)}`,
        );
      }
    }
  }

  private async updateConnectionStatus(
    status: statusconexaomqtt,
    error?: string,
    expectedConfig?: ActiveMqttConfig,
  ): Promise<void> {
    const persisted = expectedConfig
      ? await this.mqttConfigService.updateConnectionStatus(
          status,
          error,
          expectedConfig,
        )
      : await this.mqttConfigService.updateConnectionStatus(status, error);
    if (persisted === false) {
      throw new ServiceUnavailableException(
        'A configuracao MQTT mudou antes da persistencia do estado da conexao.',
      );
    }
  }

  private enqueueConnectionTransition(
    transition: MqttConnectionTransition,
  ): Promise<void> {
    const operation = this.connectionTransitionQueue.then(() =>
      this.executeConnectionTransition(transition),
    );

    this.connectionTransitionQueue = operation.catch((persistError) => {
      this.logger.warn(
        `Nao foi possivel persistir o estado MQTT ${String(transition.status)}: ${this.getErrorMessage(persistError)}`,
      );
    });

    return operation;
  }

  private async executeConnectionTransition(
    transition: MqttConnectionTransition,
  ): Promise<void> {
    if (
      transition.client &&
      !this.isCurrentOperationalClient(transition.client)
    ) {
      return;
    }

    let persistenceError: unknown;

    try {
      await this.updateConnectionStatus(
        transition.status,
        transition.error,
        transition.expectedConfig,
      );
    } catch (error) {
      persistenceError = error;
    }

    if (
      transition.credential &&
      (transition.credential.type === 'AUTHENTICATION_FAILURE' ||
        !persistenceError)
    ) {
      await this.persistCredentialTransition(transition.credential);
    }

    await this.notifyConnectionStatusListeners(
      transition.status,
      transition.error,
    );

    if (persistenceError) {
      throw persistenceError instanceof Error
        ? persistenceError
        : new Error(this.getErrorMessage(persistenceError));
    }
  }

  private async drainConnectionTransitions(): Promise<void> {
    await this.connectionTransitionQueue;
  }

  private registerClientEvents(expectedConfig?: ActiveMqttConfig): void {
    const client = this.client;
    if (!client) {
      return;
    }

    client.on('connect', () => {
      if (this.isShuttingDown || !this.isCurrentOperationalClient(client)) {
        return;
      }
      this.isConnected = true;

      this.logger.log('Cliente MQTT conectado ao broker');

      if (!this.isConnecting) {
        void this.enqueueConnectionTransition({
          status: statusconexaomqtt.CONECTADO,
          expectedConfig,
          client,
          credential: { type: 'VERIFIED' },
        });
      }
    });

    client.on('reconnect', () => {
      if (this.isShuttingDown || !this.isCurrentOperationalClient(client)) {
        return;
      }
      this.isConnected = false;

      this.logger.warn('Cliente MQTT tentando reconectar ...');

      void this.enqueueConnectionTransition({
        status: statusconexaomqtt.RECONECTANDO,
        expectedConfig,
        client,
      });
    });

    client.on('close', () => {
      if (this.isShuttingDown || !this.isCurrentOperationalClient(client)) {
        return;
      }
      this.isConnected = false;

      this.logger.log('Conexão MQTT fechada');

      void this.enqueueConnectionTransition({
        status: statusconexaomqtt.DESCONECTADO,
        expectedConfig,
        client,
      });
    });

    client.on('offline', () => {
      if (this.isShuttingDown || !this.isCurrentOperationalClient(client)) {
        return;
      }
      this.isConnected = false;

      this.logger.log('Cliente MQTT offline');

      void this.enqueueConnectionTransition({
        status: statusconexaomqtt.DESCONECTADO,
        expectedConfig,
        client,
      });
    });

    client.on('error', (error) => {
      if (this.isShuttingDown || !this.isCurrentOperationalClient(client)) {
        return;
      }
      this.isConnected = false;

      const messageError = this.getErrorMessage(error);

      this.logger.log('Conexão MQTT fechada');

      void this.enqueueConnectionTransition({
        status: statusconexaomqtt.FALHA,
        error: messageError,
        expectedConfig,
        client,
        credential: this.isAuthenticationError(messageError)
          ? {
              type: 'AUTHENTICATION_FAILURE',
              message: messageError,
            }
          : undefined,
      });
    });

    client.on('message', (topic, rawPayoad, packet) => {
      if (this.isShuttingDown || !this.isCurrentOperationalClient(client)) {
        return;
      }
      void this.handleIncomingMessage(topic, rawPayoad, {
        qos: packet.qos,
        retain: packet.retain,
      }).catch((processingError) => {
        this.logger.error(
          `Falha inesperada no pipeline MQTT do topico ${topic}: ${this.getErrorMessage(processingError)}`,
          processingError instanceof Error ? processingError.stack : undefined,
        );
      });
    });
  }

  private isCurrentOperationalClient(client: MqttClient): boolean {
    return this.client === client && this.disconnectingClient !== client;
  }

  private async handleIncomingMessage(
    topic: string,
    rawPayload: Buffer,
    packet: {
      qos?: number;
      retain?: boolean;
    },
  ): Promise<void> {
    let message: MqttMessage;

    try {
      message = MqttMessageValidator.normalizeIncomingMessage(
        topic,
        rawPayload,
        packet,
      );
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      this.logger.log(
        `Mensagem MQTT inválida no tópico ${topic}: ${errorMessage}`,
      );

      return;
    }

    try {
      await this.mqttConfigService.updateLastSync();
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      this.logger.warn(
        `Mensagem MQTT recebida no topico ${topic}, mas a ultima sincronizacao nao pode ser persistida: ${errorMessage}`,
      );
    }

    await this.notifyMessageListenner(message);
  }

  private async notifyMessageListenner(message: MqttMessage): Promise<void> {
    for (const listener of this.messageListenner) {
      try {
        await listener(message);
      } catch (error) {
        this.logger.log('Erro ao notificar listener de mensagem MQTT', error);
      }
    }
  }

  private buildClientOptions(
    config: ActiveMqttConfig,
    credentials: MqttCredentials,
  ): MqttClientOptions {
    return {
      brokerUrl: config.broker_url,
      port: config.porta,
      username: credentials.username,
      password: credentials.password,
      reconnectPeriod: 5000,
      connectTimeout: config.timeout_comunicacao,
      clean: false,
      clientId: process.env.MQTT_CLIENT_ID?.trim() || 'tsea-api-server',
    };
  }

  private async persistCredentialTransition(
    transition: MqttCredentialTransition,
  ): Promise<void> {
    if (transition.type === 'VERIFIED') {
      try {
        await this.mqttCredentialsService.markCredentialsVerified();
      } catch {
        this.logger.warn(
          'Conexao MQTT confirmada, mas o estado de verificacao das credenciais nao pode ser persistido.',
        );
      }
      return;
    }

    try {
      await this.mqttCredentialsService.markAuthenticationFailure(
        transition.message,
      );
    } catch {
      this.logger.warn(
        'Nao foi possivel persistir a falha de autenticacao MQTT.',
      );
    }
  }

  private async closeFailedClientSafely(): Promise<void> {
    const client = this.client;

    if (!client) {
      this.forceClearCient();
      return;
    }

    this.disconnectingClient = client;
    client.removeAllListeners();

    try {
      await client.endAsync(true);
    } catch (closeError) {
      this.logger.warn(
        `Falha ao fechar o cliente MQTT apos erro de conexao: ${this.getErrorMessage(closeError)}`,
      );
    } finally {
      this.forceClearCient();
    }
  }

  private isAuthenticationError(message: string): boolean {
    return /not authorized|not authorised|bad user name|bad username|bad password|authentication|nao autorizado|não autorizado/iu.test(
      message,
    );
  }

  private buildConnectionUrl(options: MqttClientOptions): string {
    return normalizeMqttBrokerUrl(options.brokerUrl, options.port, true);
  }

  private buildDefaultSubscriptions(
    config: ActiveMqttConfig,
  ): MqttSubscriptions[] {
    return [
      {
        topic: config.topico_alarmes,
        qos: 1,
      },
      {
        topic: config.topico_status,
        qos: 1,
      },
      {
        topic: config.topico_heartbeat,
        qos: 0,
      },
      {
        topic: config.topico_leituras,
        qos: 0,
      },
      {
        topic: config.topico_acoplamentos,
        qos: 1,
      },
      {
        topic: config.topico_acks,
        qos: 1,
      },
    ];
  }

  private assertSubscriptionGranted(
    expectedTopic: string,
    grants: ISubscriptionGrant[],
  ): void {
    const matchingGrant = grants.find((grant) => grant.topic === expectedTopic);
    if (!matchingGrant || matchingGrant.qos === 128) {
      throw Object.assign(
        new Error(
          `Subscribe error: broker recusou o topico obrigatorio ${expectedTopic}.`,
        ),
        { code: 128 },
      );
    }
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private buildConfigFingerprint(config: ActiveMqttConfig): string {
    return JSON.stringify({
      broker_url: normalizeMqttBrokerUrl(config.broker_url, config.porta, true),
      porta: config.porta,
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
      ativo: config.ativo,
    });
  }

  waitForConnection(timeoutMs: number): Promise<void> {
    if (!this.client) {
      return Promise.reject(
        new ServiceUnavailableException('Cliente MQTT não foi inicializado.'),
      );
    }

    return this.waitForClientConnection(this.client, timeoutMs);
  }

  private waitForClientConnection(
    client: MqttClient,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (client.connected) {
        resolve();
        return;
      }

      const onConnect = (): void => {
        cleanup();
        resolve();
      };

      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };

      const onClose = (): void => {
        cleanup();
        reject(
          new ServiceUnavailableException(
            'Conexão encerrada antes da confirmação do broker MQTT.',
          ),
        );
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new ServiceUnavailableException(
            'Timeout ao conectar no broker MQTT.',
          ),
        );
      }, timeoutMs);

      const cleanup = (): void => {
        clearTimeout(timeout);
        client.off('connect', onConnect);
        client.off('error', onError);
        client.off('close', onClose);
      };

      client.once('connect', onConnect);
      client.once('error', onError);
      client.once('close', onClose);
    });
  }

  private buildCredentialProbeClientId(): string {
    const randomSuffix = randomUUID().replaceAll('-', '').slice(0, 12);
    return `tsea-probe-${randomSuffix}`;
  }

  private classifyCredentialProbeFailure(
    error: unknown,
    message: string,
  ): MqttCredentialProbeFailureCode {
    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;

    if (
      errorCode === 128 ||
      errorCode === 135 ||
      /subscribe error|subscription.*(?:denied|refused|reject)/iu.test(message)
    ) {
      return 'SUBSCRIPTION_REJECTED';
    }

    if (this.isAuthenticationError(message)) {
      return 'AUTHENTICATION_REJECTED';
    }

    return 'BROKER_UNAVAILABLE';
  }

  private buildCredentialProbeFailureMessage(
    failureCode: MqttCredentialProbeFailureCode,
  ): string {
    if (failureCode === 'AUTHENTICATION_REJECTED') {
      return 'O broker MQTT recusou o usuário ou a senha informados.';
    }

    if (failureCode === 'SUBSCRIPTION_REJECTED') {
      return 'O broker aceitou a conexão, mas recusou uma assinatura MQTT obrigatória.';
    }

    return 'Não foi possível confirmar as novas credenciais no broker MQTT.';
  }

  private sanitizeCredentialProbeError(
    message: string,
    credentials: MqttCredentials,
  ): string {
    let sanitized = message;

    for (const secret of [credentials.password, credentials.username].sort(
      (left, right) => right.length - left.length,
    )) {
      if (secret) {
        sanitized = sanitized.split(secret).join('[redigido]');
      }
    }

    return sanitized
      .replace(/\p{Cc}/gu, ' ')
      .trim()
      .slice(0, 1000);
  }

  private ensureClientConnected(): void {
    if (!this.isConnected || !this.client) {
      throw new ServiceUnavailableException(
        'Cliente MQTT não está conectado ao broker',
      );
    }
  }

  private forceClearCient(): void {
    if (this.disconnectingClient === this.client) {
      this.disconnectingClient = null;
    }
    this.client?.removeAllListeners();
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.appliedConfigFingerprint = null;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Erro desconhecido';
  }
}
