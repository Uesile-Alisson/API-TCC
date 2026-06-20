import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  PROCESSOS_SOCKET_EVENTS,
  ProcessosSocketEventName,
} from './processos-socket.events';
import type {
  ProcessoConfigUpdatedSocketPayload,
  ProcessoDashboardUpdatedSocketPayload,
  ProcessoEmergencyStopSocketPayload,
  ProcessoFailureSocketPayload,
  ProcessoJoinRoomPayload,
  ProcessoLifecycleSocketPayload,
  ProcessoMetricsUpdatedSocketPayload,
  ProcessoRoomResponsePayload,
  ProcessoStatusChangedPayload,
} from './processos-socket.types';

@WebSocketGateway({
  namespace: 'processos',
  cors: {
    origin: '*',
  },
})
export class ProcessosSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ProcessosSocketGateway.name);

  @WebSocketServer()
  private server!: Server;

  handleConnection(@ConnectedSocket() client: Socket): void {
    this.logger.log(`Cliente conectado ao socket de processos: ${client.id}`);

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

  emitStatusChanged(payload: ProcessoStatusChangedPayload): void {
    this.emitToAllAndProcessRoom(
      PROCESSOS_SOCKET_EVENTS.STATUS_CHANGED,
      payload,
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
