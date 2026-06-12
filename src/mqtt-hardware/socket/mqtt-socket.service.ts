import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { statusconexaomqtt } from '@prisma/client';
import { MqttClientService } from '../connection/mqtt-client.service';
import { MqttHealthService } from '../connection/mqtt-health.service';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { HardwareState } from '../interfaces/hardware-state.interface';
import { TopicMatcher } from '../topics/topic-matcher';
import { MqttSocketGateway } from './mqtt-socket.gateway';
import {
  GenericMqttSocketPayload,
  MqttConnectionStatusSocketPayload,
  MqttErrorSocketPayload,
  SensorAcoplamentoSocketPayload,
} from '../interfaces/mqtt-socket-events.interface';

@Injectable()
export class MqttSocketService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(MqttSocketService.name);
  private readonly messageListener = (message: MqttMessage): void => {
    this.handleMqttMessage(message);
  };
  private readonly connectionStatusListener = (
    status: statusconexaomqtt,
    error?: string,
  ): void => {
    this.handleConnectionStatusChange(status, error);
  };

  constructor(
    private readonly mqttClientService: MqttClientService,
    private readonly mqttHealthService: MqttHealthService,
    private readonly mqttSocketGateway: MqttSocketGateway,
  ) {}

  onModuleInit(): void {
    this.mqttClientService.registerMessageListener(this.messageListener);

    this.mqttClientService.registerConnectionStatusListener(
      this.connectionStatusListener,
    );

    this.emitCurrentHardwareState();
    this.logger.log('Serviço Socket MQTT/Hardware iniciado.');
  }

  onModuleDestroy(): void {
    this.mqttClientService.removeMessageListener(this.messageListener);

    this.mqttClientService.removeConnectionStatusListener(
      this.connectionStatusListener,
    );

    this.logger.log('Serviço Socket MQTT/Hardware finalizado.');
  }

  emitCurrentHardwareState(): void {
    const state = this.mqttHealthService.getCurrentState();

    const payload = this.buildHardwareStatePayload(state);
    this.mqttSocketGateway.emitHardwareState(payload);
  }

  private handleMqttMessage(message: MqttMessage): void {
    this.emitGenericMqttMessage(message);

    if (TopicMatcher.isLeitura(message.topic)) {
      this.handleReadingMessage(message);
      return;
    }

    if (TopicMatcher.isStatus(message.topic)) {
      this.handleStatusMessage(message);
      return;
    }

    if (TopicMatcher.isHeartbeat(message.topic)) {
      this.handleHeartbeatMessage(message);
      return;
    }

    if (TopicMatcher.isAlarme(message.topic)) {
      this.handleAlarmMessage(message);
      return;
    }

    if (TopicMatcher.isAcoplamento(message.topic)) {
      this.handleAcoplamentoMessage(message);
      return;
    }
  }

  private handleConnectionStatusChange(
    status: statusconexaomqtt,
    error?: string,
  ): void {
    const statusPayload: MqttConnectionStatusSocketPayload = {
      status_conexao: status,
      error: error ?? null,
      enviado_em: new Date(),
    };

    this.mqttSocketGateway.emitMqttConnectionStatus(statusPayload);

    if (error) {
      const errorPayload: MqttErrorSocketPayload = {
        error,
        enviado_em: new Date(),
      };

      this.mqttSocketGateway.emitMqttError(errorPayload);
    }

    this.emitCurrentHardwareState();
  }

  private emitGenericMqttMessage(message: MqttMessage): void {
    const payload: MqttMessage = {
      topic: message.topic,
      payload: message.payload,
      qos: message.qos,
      retain: message.retain,
      receivedAt: message.receivedAt,
      enviado_em: new Date(),
    };

    this.mqttSocketGateway.emitMqttMessage(payload);
  }

  private handleReadingMessage(message: MqttMessage): void {
    const payload = this.buildGenericMqttPayload(message);

    this.mqttSocketGateway.emitSensorReading(payload);
    this.emitCurrentHardwareState();
  }

  private handleStatusMessage(message: MqttMessage): void {
    const payload = this.buildGenericMqttPayload(message);

    this.mqttSocketGateway.emitHardwareStatus(payload);
    this.emitCurrentHardwareState();
  }

  private handleHeartbeatMessage(message: MqttMessage): void {
    const payload = this.buildGenericMqttPayload(message);

    this.mqttSocketGateway.emitHeartbeat(payload);
    this.emitCurrentHardwareState();
  }

  private handleAlarmMessage(message: MqttMessage): void {
    const payload = this.buildGenericMqttPayload(message);

    this.mqttSocketGateway.emitAlarm(payload);
    this.emitCurrentHardwareState();
  }

  private handleAcoplamentoMessage(message: MqttMessage): void {
    const payload = this.buildSensorAcoplamentoPayload(message);

    this.mqttSocketGateway.emitSensorAcoplamento(payload);
    this.emitCurrentHardwareState();
  }

  private buildGenericMqttPayload(
    message: MqttMessage,
  ): GenericMqttSocketPayload {
    return {
      ...message.payload,
      topic: message.topic,
      receivedAt: message.receivedAt,
      enviado_em: new Date(),
    };
  }

  private buildHardwareStatePayload(state: HardwareState): HardwareState {
    return {
      mqttConnected: state.mqttConnected,
      esp32Online: state.esp32Online,
      lastHeartbeatAt: state.lastHeartbeatAt,
      lastStatusAt: state.lastStatusAt,
      lastReadingAt: state.lastReadingAt,
      currentStatus: state.currentStatus,
      lastError: state.lastError,
      updatedAt: state.updatedAt,
      enviado_em: new Date(),
    };
  }

  private buildSensorAcoplamentoPayload(
    message: MqttMessage,
  ): SensorAcoplamentoSocketPayload {
    return {
      id_sensor: Number(message.payload.id_sensor),
      id_tanque: Number(message.payload.id_tanque),
      sinal_detectado: Boolean(message.payload.sinal_detectado),
      status_acoplamento: this.resolveStatusAcoplamento(
        Boolean(message.payload.sinal_detectado),
      ),
      verificado_em:
        message.payload.verificado_em instanceof Date ||
        typeof message.payload.verificado_em === 'string'
          ? message.payload.verificado_em
          : undefined,
      topic: message.topic,
      receivedAt: message.receivedAt,
      enviado_em: new Date(),
    };
  }

  private resolveStatusAcoplamento(sinalDetectado: boolean): string {
    return sinalDetectado ? 'ACOPLADA' : 'DESACOPLADA';
  }
}
