import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { statusconexaomqtt } from '@prisma/client';
import { MqttClientService } from '../connection/mqtt-client.service';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttSocketService } from '../socket/mqtt-socket.service';
import { TopicMatcher } from '../topics/topic-matcher';
import { AcoplamentoMangueiraHandler } from './acoplamento-mangueira.handler';
import { AlarmsHandler } from './alarms.handler';
import { HeartbeatHandler } from './heartbeat.handler';
import { ReadingHandler } from './reading.handler';
import { StatusHandler } from './status.handler';

@Injectable()
export class HandlersService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(HandlersService.name);

  private readonly messageListener = (message: MqttMessage): void => {
    void this.handleMqttMessage(message);
  };
  private readonly connectionStatusListener = (
    status: statusconexaomqtt,
    error?: string,
  ): void => {
    this.handleConnectionStatusChange(status, error);
  };

  constructor(
    private readonly mqttClientService: MqttClientService,
    private readonly mqttSocketService: MqttSocketService,
    private readonly readingHandler: ReadingHandler,
    private readonly statusHandler: StatusHandler,
    private readonly heartbeatHandler: HeartbeatHandler,
    private readonly alarmsHandler: AlarmsHandler,
    private readonly acoplamentoHandler: AcoplamentoMangueiraHandler,
  ) {}

  onModuleInit(): void {
    this.mqttClientService.registerMessageListener(this.messageListener);

    this.mqttClientService.registerConnectionStatusListener(
      this.connectionStatusListener,
    );

    this.mqttSocketService.publishedCurrentHardwareSatate();
    this.logger.log('Serviço de handlers MQTT iniciado.');
  }

  onModuleDestroy(): void {
    this.mqttClientService.removeMessageListener(this.messageListener);

    this.mqttClientService.removeConnectionStatusListener(
      this.connectionStatusListener,
    );

    this.logger.log('Serviço de handlers MQTT finalizado.');
  }

  private async handleMqttMessage(message: MqttMessage): Promise<void> {
    try {
      if (TopicMatcher.isAcoplamento(message.topic)) {
        await this.handleAcoplamentoMessage(message);
        return;
      }

      if (TopicMatcher.isAlarme(message.topic)) {
        await this.handleAlarmMessage(message);
        return;
      }

      if (TopicMatcher.isHeartbeat(message.topic)) {
        await this.handleHeartbeatMessage(message);
        return;
      }

      if (TopicMatcher.isLeitura(message.topic)) {
        await this.handleReadingMessage(message);
        return;
      }

      if (TopicMatcher.isStatus(message.topic)) {
        await this.handleStatusMessage(message);
        return;
      }

      this.logUnknownTopic(message);
    } catch (error) {
      this.handleMessageProcessingError(message, error);
    }
  }

  private async handleHeartbeatMessage(message: MqttMessage): Promise<void> {
    const result = await this.heartbeatHandler.handle(message);

    this.mqttSocketService.publishedHeartbeatUpdated(result);
  }

  private async handleReadingMessage(message: MqttMessage): Promise<void> {
    const result = await this.readingHandler.handle(message);

    if (!result) {
      return;
    }

    this.mqttSocketService.publishedSensorReadingCreated(result);
  }

  private async handleStatusMessage(message: MqttMessage): Promise<void> {
    const result = await this.statusHandler.handle(message);

    if (!result) {
      return;
    }

    this.mqttSocketService.publishedHardwareStatusUpdated(result);
  }

  private async handleAlarmMessage(message: MqttMessage): Promise<void> {
    const result = await this.alarmsHandler.handle(message);

    if (!result) {
      return;
    }

    this.mqttSocketService.publishedAlarmCreated(result);
  }

  private async handleAcoplamentoMessage(message: MqttMessage): Promise<void> {
    const result = await this.acoplamentoHandler.handle(message);

    if (!result) {
      return;
    }

    this.mqttSocketService.publishedSensorAcoplamentoUpdated(result);
  }

  private handleConnectionStatusChange(
    status: statusconexaomqtt,
    error?: string,
  ): void {
    this.mqttSocketService.publishedConnectionStatus(status, error);

    if (error) {
      this.logger.warn(
        `Status de conexão MQTT alterado para ${String(status)}. Erro: ${error}`,
      );

      return;
    }

    this.logger.debug(`Status de conexão MQTT alterado para ${String(status)}`);
  }

  private handleMessageProcessingError(
    message: MqttMessage,
    error: unknown,
  ): void {
    const errorMessage = this.rsolveErrorMessage(error);

    this.logger.error(
      `Erro ao processar mensagem MQTT.` +
        `Tópico: ${message.topic}.` +
        `Erro: ${errorMessage}`,
      error instanceof Error ? error.stack : undefined,
    );

    this.mqttSocketService.publishMqttError(
      `Erro ao processar mensagem MQTT no tópico ${message.topic}: ${errorMessage}`,
    );
  }

  private logUnknownTopic(message: MqttMessage): void {
    this.logger.warn(
      `Mqnsagem MQTT ignorada: tópico não reconhecido.` +
        `Tópico: ${message.topic}.`,
    );
  }

  private rsolveErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Erro desconhecido.';
  }
}
