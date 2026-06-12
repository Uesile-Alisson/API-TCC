import { Injectable, Logger } from '@nestjs/common';
import { MqttConfigService } from '../config/mqtt-config.service';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';
import { MqttMessageHandler } from './interfaces/mqtt-message-handler.interface';
import { MqttHeartbeatHandlerResult } from './interfaces/mqtt-handler-results.interfaces';

@Injectable()
export class HeartbeatHandler implements MqttMessageHandler<MqttHeartbeatHandlerResult> {
  private readonly logger = new Logger(HeartbeatHandler.name);

  constructor(private readonly mqttConfigService: MqttConfigService) {}

  async handle(message: MqttMessage): Promise<MqttHeartbeatHandlerResult> {
    MqttPayloadValidator.validateHeartbeat(message.payload);

    const heartbeatAt = this.resolveHeartbeatDate(message);
    const deviceId = this.extractOpitionalString(message.payload, 'device_id');

    await this.mqttConfigService.updateLastSync();

    this.logHeartbeatReceived({
      topic: message.topic,
      deviceId,
      heartbeatAt,
    });

    return this.buildHeartbeatHandlerResult({ deviceId, heartbeatAt, message });
  }

  private buildHeartbeatHandlerResult(params: {
    deviceId: string | null;
    heartbeatAt: Date;
    message: MqttMessage;
  }): MqttHeartbeatHandlerResult {
    const { deviceId, heartbeatAt, message } = params;

    return {
      device_id: deviceId,
      heartbeat_at: heartbeatAt,
      receivedAt: message.receivedAt,
      topic: message.topic,
    };
  }

  private resolveHeartbeatDate(message: MqttMessage): Date {
    const enviadoEm = message.payload.enviado_em;

    if (typeof enviadoEm === 'string') {
      const parsedDate = new Date(enviadoEm);

      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }

    return message.receivedAt;
  }

  private extractOpitionalString(
    payload: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = payload[key];

    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    return null;
  }

  private logHeartbeatReceived(params: {
    topic: string;
    deviceId: string | null;
    heartbeatAt: Date;
  }): void {
    const { topic, deviceId, heartbeatAt } = params;

    this.logger.debug(
      `Heartbeat recebido. Tópico: ${topic}.` +
        `Dispositivo: ${deviceId ?? 'não informado'}.` +
        `Horário: ${heartbeatAt.toISOString()}.`,
    );
  }
}
