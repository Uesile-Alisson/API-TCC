import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import mqtt, { IClientPublishOptions, MqttClient } from 'mqtt';
import { statusconexaomqtt } from '@prisma/client';
import { MqttConfigService } from '../config/mqtt-config.service';
import { ActiveMqttConfig } from '../interfaces/active-mqtt-config.interface';
import { MqttClientOptions } from '../interfaces/mqtt-client-options.interfaces';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttOperationResult } from '../interfaces/mqtt-operation-result.interface';
import { MqttPublishOptions } from '../interfaces/mqtt-publish-options.interface';
import { MqttSubscriptions } from '../interfaces/mqtt-subscription.interface';
import { MqttMessageValidator } from '../validators/mqtt-message.validator';
import {
  normalizeMqttBrokerUrl,
  sanitizeMqttBrokerUrlForLog,
} from '../config/mqtt-broker-url.util';

type MqttMessageListenner = (message: MqttMessage) => Promise<void> | void;
type MqttConnectionStatusListener = (
  status: statusconexaomqtt,
  error?: string,
) => Promise<void> | void;

@Injectable()
export class MqttClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttClientService.name);

  private client: MqttClient | null = null;
  private isConnecting = false;
  private isConnected = false;

  private readonly messageListenner = new Set<MqttMessageListenner>();
  private readonly connectionStatusListeners =
    new Set<MqttConnectionStatusListener>();

  constructor(private readonly mqttConfigService: MqttConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async connect(): Promise<MqttOperationResult> {
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

    try {
      const config = await this.mqttConfigService.getConfig();
      const clientOptions = this.buildClientOptions(config);
      const connectionUrl = this.buildConnectionUrl(clientOptions);

      await this.updateConnectionStatus(statusconexaomqtt.RECONECTANDO);

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

      this.registerClientEvents();

      await this.waitForConnection(config.timeout_comunicacao);

      const subscriptions = this.buildDefaultSubscriptions(config);
      await this.subscribeMany(subscriptions);

      await this.updateConnectionStatus(statusconexaomqtt.CONECTADO);

      this.isConnected = true;

      return {
        success: true,
        message: 'Conexão MQTT realizada com sucesso',
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      this.logger.error(`Falha ao conectar no MQTT: ${errorMessage}`);

      await this.updateConnectionStatus(statusconexaomqtt.FALHA, errorMessage);

      this.forceClearCient();

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

      await this.updateConnectionStatus(statusconexaomqtt.DESCONECTADO);

      return {
        success: true,
        message: 'Cliente MQTT já estava desconectado',
        timestamp: new Date(),
      };
    }

    await new Promise<void>((resolve) => {
      client.end(false, {}, () => {
        resolve();
      });
    });

    this.forceClearCient();

    await this.updateConnectionStatus(statusconexaomqtt.DESCONECTADO);

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
        (error) => {
          if (error) {
            reject(error);
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
    for (const subscription of subscriptions) {
      await this.subscribe(subscription);
    }
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

  private async notifyConnectionStatusListeners(
    status: statusconexaomqtt,
    error?: string,
  ): Promise<void> {
    for (const listener of this.connectionStatusListeners) {
      await listener(status, error);
    }
  }

  private async updateConnectionStatus(
    status: statusconexaomqtt,
    error?: string,
  ): Promise<void> {
    await this.mqttConfigService.updateConnectionStatus(status, error);
    await this.notifyConnectionStatusListeners(status, error);
  }

  private registerClientEvents(): void {
    if (!this.client) {
      return;
    }

    this.client.on('connect', () => {
      this.isConnected = true;

      this.logger.log('Cliente MQTT conectado ao broker');

      void this.updateConnectionStatus(statusconexaomqtt.CONECTADO);
    });

    this.client.on('reconnect', () => {
      this.isConnected = false;

      this.logger.warn('Cliente MQTT tentando reconectar ...');

      void this.updateConnectionStatus(statusconexaomqtt.RECONECTANDO);
    });

    this.client.on('close', () => {
      this.isConnected = false;

      this.logger.log('Conexão MQTT fechada');

      void this.updateConnectionStatus(statusconexaomqtt.DESCONECTADO);
    });

    this.client.on('offline', () => {
      this.isConnected = false;

      this.logger.log('Cliente MQTT offline');

      void this.updateConnectionStatus(statusconexaomqtt.DESCONECTADO);
    });

    this.client.on('error', (error) => {
      this.isConnected = false;

      const messageError = this.getErrorMessage(error);

      this.logger.log('Conexão MQTT fechada');

      void this.updateConnectionStatus(statusconexaomqtt.FALHA, messageError);
    });

    this.client.on('message', (topic, rawPayoad, packet) => {
      void this.handleIncomingMessage(topic, rawPayoad, {
        qos: packet.qos,
        retain: packet.retain,
      });
    });
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
      await this.notifyMessageListenner(message);
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      this.logger.log(
        `Erro ao processar mensagem MQTT do tópico ${topic}: ${errorMessage}`,
      );
    }
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

  private buildClientOptions(config: ActiveMqttConfig): MqttClientOptions {
    const mqttUsername =
      config.usuario_mqtt?.trim() || process.env.MQTT_USERNAME || undefined;
    const mqttPassword = process.env.MQTT_PASSWORD?.trim() || undefined;

    return {
      brokerUrl: config.broker_url,
      port: config.porta,
      username: mqttUsername,
      password: mqttPassword,
      reconnectPeriod: 5000,
      connectTimeout: config.timeout_comunicacao,
      clean: true,
      clientId: 'tsea-api-server',
    };
  }

  private buildConnectionUrl(options: MqttClientOptions): string {
    return normalizeMqttBrokerUrl(options.brokerUrl, options.port);
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
    ];
  }

  waitForConnection(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(
          new ServiceUnavailableException('Cliente MQTT não foi inicializado.'),
        );

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
        this.client?.off('connect', onConnect);
        this.client?.off('error', onError);
      };

      this.client.once('connect', onConnect);
      this.client.once('error', onError);
    });
  }

  private ensureClientConnected(): void {
    if (!this.isConnected || !this.client) {
      throw new ServiceUnavailableException(
        'Cliente MQTT não está conectado ao broker',
      );
    }
  }

  private forceClearCient(): void {
    this.client?.removeAllListeners();
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Erro desconhecido';
  }
}
