import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { SocketAuthService } from '../../auth/socket-auth.service';
import type {
  AcknowledgeAlarmeResult,
  AlarmeDashboard,
  AlarmeNotificationPayload,
  ResolveAlarmeResult,
} from '../interfaces';
import {
  ALARMES_SOCKET_EVENTS,
  ALARMES_SOCKET_NAMESPACE,
} from './alarmes-socket.events';

@WebSocketGateway({ namespace: ALARMES_SOCKET_NAMESPACE })
export class AlarmesSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AlarmesSocketGateway.name);

  constructor(private readonly socketAuthService: SocketAuthService) {}

  @WebSocketServer()
  private server!: Namespace;

  afterInit(namespace: Namespace): void {
    this.socketAuthService.registerAuthenticationMiddleware(namespace);
  }

  handleConnection(@ConnectedSocket() client: Socket): void {
    const user = this.socketAuthService.getAuthenticatedUser(client);
    if (!user) {
      this.logger.warn(
        `Conexao sem contexto autenticado recusada no socket de alarmes: ${client.id}`,
      );
      client.disconnect(true);
      return;
    }

    this.logger.log(
      `Cliente autenticado no socket de alarmes: ${client.id}. ` +
        `Usuario: ${user.id_usuario}.`,
    );

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

  emitAlarmAcknowledged(payload: AcknowledgeAlarmeResult): void {
    this.server.emit(ALARMES_SOCKET_EVENTS.ACKNOWLEDGED, payload);
  }

  emitAlarmNormalized(payload: {
    id_alarme: number;
    normalizado_em: Date;
  }): void {
    this.server.emit(ALARMES_SOCKET_EVENTS.NORMALIZED, payload);
  }

  emitAlarmRecoveryAttempt(payload: {
    id_alarme: number;
    attempted_at: Date;
  }): void {
    this.server.emit(ALARMES_SOCKET_EVENTS.RECOVERY_ATTEMPT, payload);
  }

  emitAlarmUpdated(payload: { id_alarme: number }): void {
    this.server.emit(ALARMES_SOCKET_EVENTS.UPDATED, payload);
  }

  emitDashboardUpdated(payload: AlarmeDashboard): void {
    this.server.emit(ALARMES_SOCKET_EVENTS.DASHBOARD_UPDATED, payload);
  }

  emitAlarmNotification(payload: AlarmeNotificationPayload): void {
    this.server.emit(ALARMES_SOCKET_EVENTS.NOTIFICATION, payload);
  }
}
