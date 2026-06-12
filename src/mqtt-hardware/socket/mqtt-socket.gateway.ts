import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  AlarmCreatedSocketPayload,
  HardwareStatusSocketPayload,
  HeartbeatSocketPayload,
  MqttConnectionStatusSocketPayload,
  MqttErrorSocketPayload,
  SensorAcoplamentoSocketPayload,
  SensorReadingSocketPayload,
} from '../interfaces/mqtt-socket-events.interface';
import { HardwareState } from '../interfaces/hardware-state.interface';

@WebSocketGateway({
  namespace: 'mqtt-hardware',
  cors: {
    origin: '*',
  },
})
export class MqttSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MqttSocketGateway.name);

  @WebSocketServer()
  private server!: Server;

  handleConnection(@ConnectedSocket() client: Socket): void {
    this.logger.log(`Cliente conectado ao socket MQTT/Hardware: ${client.id}`);

    client.emit('socket:connected', {
      message: 'Conectado ao canal MQTT/Hardware',
      socketId: client.id,
      conectado_em: new Date(),
    });
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.logger.warn(
      `Cliente desconectado do socket MQTT/Hardware: ${client.id}`,
    );
  }

  emitMqttConnectionStatus(payload: MqttConnectionStatusSocketPayload): void {
    this.server.emit('mqtt:connection-status', {
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });
  }

  emitMqttError(payload: MqttErrorSocketPayload): void {
    this.server.emit('mqtt:error', {
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });
  }

  emitHardwareState(payload: HardwareState): void {
    this.server.emit('hardware:state', {
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });
  }

  emitSensorReading(payload: SensorReadingSocketPayload): void {
    this.server.emit('sensor:reading', {
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });
  }

  emitHardwareStatus(payload: HardwareStatusSocketPayload): void {
    this.server.emit('hardware:status', {
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });
  }

  emitHeartbeat(payload: HeartbeatSocketPayload): void {
    this.server.emit('hardware:heartbeat', {
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });
  }

  emitAlarm(payload: AlarmCreatedSocketPayload): void {
    this.server.emit('alarm:created', {
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });
  }

  emitSensorAcoplamento(payload: SensorAcoplamentoSocketPayload): void {
    this.server.emit('sensor-acoplamento:updated', {
      ...payload,
      enviado_em: payload.enviado_em ?? new Date(),
    });
  }
}
