import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { SocketAuthService } from '../../auth/socket-auth.service';
import {
  PROCESSOS_SOCKET_EVENTS,
  ProcessosSocketEventName,
} from './processos-socket.events';
import type {
  ProcessoAuxiliaryStateUpdatedSocketPayload,
  ProcessoConfigUpdatedSocketPayload,
  ProcessoDashboardUpdatedSocketPayload,
  ProcessoEmergencyStopSocketPayload,
  ProcessoFailureSocketPayload,
  ProcessoGeneralClosureUpdatedSocketPayload,
  ProcessoJoinRoomPayload,
  ProcessoLifecycleSocketPayload,
  ProcessoMetricsUpdatedSocketPayload,
  ProcessoRoomResponsePayload,
  ProcessoStatusChangedPayload,
  ProcessoTankUpdatedSocketPayload,
  ProcessoTankClosureUpdatedSocketPayload,
} from './processos-socket.types';
import type { ProcessoPrecheckResultado } from '../precheck';

@WebSocketGateway({ namespace: 'processos' })
export class ProcessosSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ProcessosSocketGateway.name);

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
        `Conexao sem contexto autenticado recusada no socket de processos: ${client.id}`,
      );
      client.disconnect(true);
      return;
    }

    this.logger.log(
      `Cliente autenticado no socket de processos: ${client.id}. ` +
        `Usuario: ${user.id_usuario}.`,
    );

    client.emit(PROCESSOS_SOCKET_EVENTS.CONNECTED, {
      message: 'Conectado ao canal de processos.',
      socketId: client.id,
      connected_at: new Date(),
    });
  }

  handleDisconnect(@ConnectedSocket() client: Socket): void {
    this.logger.warn(
      `Cliente desconectado do socket de processos: ${client.id}`,
    );
  }

  @SubscribeMessage(PROCESSOS_SOCKET_EVENTS.JOIN_PROCESS)
  handleJoinProcess(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ProcessoJoinRoomPayload,
  ): ProcessoRoomResponsePayload {
    if (!this.isValidProcessId(payload?.id_processo)) {
      return this.emitInvalidProcessId(client);
    }

    const room = this.getProcessRoom(payload.id_processo);
    const response = this.buildRoomResponse(
      payload.id_processo,
      room,
      'Cliente entrou na sala do processo.',
    );

    void client.join(room);
    client.emit(PROCESSOS_SOCKET_EVENTS.JOINED_PROCESS, response);

    return response;
  }

  @SubscribeMessage(PROCESSOS_SOCKET_EVENTS.LEAVE_PROCESS)
  handleLeaveProcess(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ProcessoJoinRoomPayload,
  ): ProcessoRoomResponsePayload {
    if (!this.isValidProcessId(payload?.id_processo)) {
      return this.emitInvalidProcessId(client);
    }

    const room = this.getProcessRoom(payload.id_processo);
    const response = this.buildRoomResponse(
      payload.id_processo,
      room,
      'Cliente saiu da sala do processo.',
    );

    void client.leave(room);
    client.emit(PROCESSOS_SOCKET_EVENTS.LEFT_PROCESS, response);

    return response;
  }

  emitProcessCreated(payload: ProcessoLifecycleSocketPayload): void {
    this.emitToAll(PROCESSOS_SOCKET_EVENTS.CREATED, payload);
  }

  emitProcessStarted(payload: ProcessoLifecycleSocketPayload): void {
    this.emitToAllAndProcessRoom(PROCESSOS_SOCKET_EVENTS.STARTED, payload);
  }

  emitProcessPaused(payload: ProcessoLifecycleSocketPayload): void {
    this.emitToAllAndProcessRoom(PROCESSOS_SOCKET_EVENTS.PAUSED, payload);
  }

  emitProcessResumed(payload: ProcessoLifecycleSocketPayload): void {
    this.emitToAllAndProcessRoom(PROCESSOS_SOCKET_EVENTS.RESUMED, payload);
  }

  emitProcessFinished(payload: ProcessoLifecycleSocketPayload): void {
    this.emitToAllAndProcessRoom(PROCESSOS_SOCKET_EVENTS.FINISHED, payload);
  }

  emitProcessInterrupted(payload: ProcessoLifecycleSocketPayload): void {
    this.emitToAllAndProcessRoom(PROCESSOS_SOCKET_EVENTS.INTERRUPTED, payload);
  }

  emitEmergencyStop(payload: ProcessoEmergencyStopSocketPayload): void {
    this.emitToAllAndProcessRoom(
      PROCESSOS_SOCKET_EVENTS.EMERGENCY_STOP,
      payload,
    );
  }

  emitProcessFailure(payload: ProcessoFailureSocketPayload): void {
    this.emitToAllAndProcessRoom(PROCESSOS_SOCKET_EVENTS.FAILURE, payload);
  }

  emitConfigUpdated(payload: ProcessoConfigUpdatedSocketPayload): void {
    this.emitToAllAndProcessRoom(
      PROCESSOS_SOCKET_EVENTS.CONFIG_UPDATED,
      payload,
    );
  }

  emitMetricsUpdated(payload: ProcessoMetricsUpdatedSocketPayload): void {
    this.emitToProcessRoom(
      payload.id_processo,
      PROCESSOS_SOCKET_EVENTS.METRICS_UPDATED,
      payload,
    );
  }

  emitDashboardUpdated(payload: ProcessoDashboardUpdatedSocketPayload): void {
    this.emitToProcessRoom(
      payload.id_processo,
      PROCESSOS_SOCKET_EVENTS.DASHBOARD_UPDATED,
      payload,
    );
  }

  emitAuxiliaryStateUpdated(
    payload: ProcessoAuxiliaryStateUpdatedSocketPayload,
  ): void {
    this.emitToProcessRoom(
      payload.id_processo,
      PROCESSOS_SOCKET_EVENTS.AUXILIARY_STATE_UPDATED,
      payload,
    );
  }

  emitTankUpdated(payload: ProcessoTankUpdatedSocketPayload): void {
    this.emitToProcessRoom(
      payload.id_processo,
      PROCESSOS_SOCKET_EVENTS.TANK_UPDATED,
      payload,
    );
  }

  emitTankClosureUpdated(
    payload: ProcessoTankClosureUpdatedSocketPayload,
  ): void {
    this.emitToProcessRoom(
      payload.id_processo,
      PROCESSOS_SOCKET_EVENTS.TANK_CLOSURE_UPDATED,
      payload,
    );
  }

  emitGeneralClosureUpdated(
    payload: ProcessoGeneralClosureUpdatedSocketPayload,
  ): void {
    this.emitToProcessRoom(
      payload.id_processo,
      PROCESSOS_SOCKET_EVENTS.GENERAL_CLOSURE_UPDATED,
      payload,
    );
  }

  emitStatusChanged(payload: ProcessoStatusChangedPayload): void {
    this.emitToAllAndProcessRoom(
      PROCESSOS_SOCKET_EVENTS.STATUS_CHANGED,
      payload,
    );
  }

  emitPrecheckResult(resultado: ProcessoPrecheckResultado): void {
    this.emitToAllAndProcessRoom(
      PROCESSOS_SOCKET_EVENTS.PRECHECK_RESULT,
      resultado,
    );
  }

  private emitToAllAndProcessRoom(
    event: ProcessosSocketEventName,
    payload: ProcessoSocketPayloadWithProcess,
  ): void {
    this.emitToAll(event, payload);
    this.emitToProcessRoom(payload.id_processo, event, payload);
  }

  private emitToAll(event: ProcessosSocketEventName, payload: unknown): void {
    if (!this.server) {
      return;
    }

    this.server.emit(event, payload);
  }

  private emitToProcessRoom(
    id_processo: number,
    event: ProcessosSocketEventName,
    payload: unknown,
  ): void {
    if (!this.server) {
      return;
    }

    this.server.to(this.getProcessRoom(id_processo)).emit(event, payload);
  }

  private getProcessRoom(id_processo: number): string {
    return `process:${id_processo}`;
  }

  private isValidProcessId(id_processo: unknown): id_processo is number {
    return (
      typeof id_processo === 'number' &&
      Number.isInteger(id_processo) &&
      id_processo > 0
    );
  }

  private emitInvalidProcessId(client: Socket): ProcessoRoomResponsePayload {
    const response: ProcessoRoomResponsePayload = {
      id_processo: 0,
      room: '',
      message: 'id_processo inválido.',
      emitted_at: new Date(),
    };

    client.emit(PROCESSOS_SOCKET_EVENTS.ERROR, response);

    return response;
  }

  private buildRoomResponse(
    id_processo: number,
    room: string,
    message: string,
  ): ProcessoRoomResponsePayload {
    return {
      id_processo,
      room,
      message,
      emitted_at: new Date(),
    };
  }
}

type ProcessoSocketPayloadWithProcess = {
  id_processo: number;
};
