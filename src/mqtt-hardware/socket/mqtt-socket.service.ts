import { Injectable, Logger } from '@nestjs/common';
import { statusconexaomqtt } from '@prisma/client';
import { MqttHealthService } from '../connection/mqtt-health.service';
import { HardwareState } from '../interfaces/hardware-state.interface';
import { MqttSocketGateway } from './mqtt-socket.gateway';
import {
  AlarmCreatedSocketPayload,
  HardwareStatusSocketPayload,
  HeartbeatSocketPayload,
  MqttConnectionStatusSocketPayload,
  MqttErrorSocketPayload,
  SensorAcoplamentoSocketPayload,
  SensorReadingSocketPayload,
} from '../interfaces/mqtt-socket-events.interface';

@Injectable()
export class MqttSocketService {
  private readonly logger = new Logger(MqttSocketService.name);

  constructor(
    private readonly mqttHealthService: MqttHealthService,
    private readonly mqttSocketGateway: MqttSocketGateway,
  ) {}

  emitCurrentHardwareState(): void {
    const state = this.mqttHealthService.getCurrentState();

    const payload = this.buildHardwareStatePayload(state);
    this.mqttSocketGateway.emitHardwareState(payload);
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

  publishedConnectionStatus(status: statusconexaomqtt, error?: string): void {
    const statusPayload: MqttConnectionStatusSocketPayload = {
      status_conexao: status,
      error: error ?? null,
      enviado_em: new Date(),
    };

    this.mqttSocketGateway.emitMqttConnectionStatus(statusPayload);

    if (error) {
      this.publishMqttError(error);
    }

    this.publishedCurrentHardwareSatate();
    this.logger.debug(
      `Status de conexão MQTT publicado no socket. Status: ${String(status)}`,
    );
  }

  publishMqttError(error: string): void {
    const errorPayload: MqttErrorSocketPayload = {
      error,
      enviado_em: new Date(),
    };

    this.mqttSocketGateway.emitMqttError(errorPayload);
    this.logger.warn(`Erro MQTT publicado no socket: ${error}`);
  }

  publishedCurrentHardwareSatate(): void {
    const state = this.mqttHealthService.getCurrentState();
    const payload = this.buildHardwareStatePayload(state);

    this.mqttSocketGateway.emitHardwareState(payload);
  }

  publishedSensorReadingCreated(payload: SensorReadingSocketPayload): void {
    this.mqttSocketGateway.emitSensorReading({
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });

    this.publishedCurrentHardwareSatate();

    this.logger.debug(
      `Leitura publicada no socket. ` +
        `Id leitura: ${payload.id_leitura_sensor}. ` +
        `Sensor: ${payload.id_sensor}. ` +
        `Tanque: ${payload.id_tanque}.`,
    );
  }

  publishedHardwareStatusUpdated(payload: HardwareStatusSocketPayload): void {
    this.mqttSocketGateway.emitHardwareStatus({
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });

    this.publishedCurrentHardwareSatate();

    this.logger.debug(
      `Status de hardware publicado no socket. ` +
        `Status: ${String(payload.status_geral_sistema)}. ` +
        `Dispositivo: ${payload.device_id ?? 'não informado'}. `,
    );
  }

  publishedHeartbeatUpdated(payload: HeartbeatSocketPayload): void {
    this.mqttSocketGateway.emitHeartbeat({
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });

    this.publishedCurrentHardwareSatate();

    this.logger.debug(
      `Heartbeat publicado no socket. ` +
        `Dispositivo: ${payload.device_id}. ` +
        `Heartbeat em: ${payload.heartbeat_at?.toISOString()}. `,
    );
  }

  publishedAlarmCreated(payload: AlarmCreatedSocketPayload): void {
    this.mqttSocketGateway.emitAlarm({
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });

    this.publishedCurrentHardwareSatate();

    this.logger.debug(
      `Alarme publicado no socket. ` +
        `Id alarme: ${payload.id_alarme}. ` +
        `Severidade: ${String(payload.severidade)}. ` +
        `Título: ${payload.titulo}.`,
    );
  }

  publishedSensorAcoplamentoUpdated(
    payload: SensorAcoplamentoSocketPayload,
  ): void {
    this.mqttSocketGateway.emitSensorAcoplamento({
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });

    this.publishedCurrentHardwareSatate();

    this.logger.debug(
      `Status de acoplamento publicado no socket. ` +
        `Sensor: ${payload.id_sensor}. ` +
        `Tanque: ${payload.id_tanque}. ` +
        `Status: ${payload.status_acoplamento}.`,
    );
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
}
