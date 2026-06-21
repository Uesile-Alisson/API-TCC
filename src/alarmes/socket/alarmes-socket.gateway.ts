import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type {
  AlarmeDashboard,
  AlarmeNotificationPayload,
  ResolveAlarmeResult,
} from '../interfaces';
import {
  ALARMES_SOCKET_EVENTS,
  ALARMES_SOCKET_NAMESPACE,
} from './alarmes-socket.events';

@WebSocketGateway({
  namespace: ALARMES_SOCKET_NAMESPACE,
  cors: {
    origin: '*',
  },
})
export class AlarmesSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AlarmesSocketGateway.name);

  @WebSocketServer()
  private server!: Server;

  handleConnection(@ConnectedSocket() client: Socket): void {
    this.logger.log(`Cliente conectado ao socket de alarmes: ${client.id}`);

    client.emit(ALARMES_SOCKET_EVENTS.CONNECTED, {
      message: 'Conectado ao canal de alarmes.',
      socketId: client.id,
      connected_at: new Date(),
    });
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.logger.warn(`Cliente desconectado do socket de alarmes: ${client.id}`);
  }

  emitAlarmResolved(payload: ResolveAlarmeResult): void {
    this.server.emit(ALARMES_SOCKET_EVENTS.RESOLVED, payload);
  }

  emitDashboardUpdated(payload: AlarmeDashboard): void {
    this.server.emit(ALARMES_SOCKET_EVENTS.DASHBOARD_UPDATED, payload);
  }

  emitAlarmNotification(payload: AlarmeNotificationPayload): void {
    this.server.emit(ALARMES_SOCKET_EVENTS.NOTIFICATION, payload);
  }
}
