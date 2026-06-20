import { statusprocesso, statustanqueprocesso } from '@prisma/client';
import type { Socket } from 'socket.io';
import { ProcessoDashboardData } from '../interfaces';
import { PROCESSOS_SOCKET_EVENTS } from './processos-socket.events';
import { ProcessosSocketGateway } from './processos-socket.gateway';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type ServerMock = {
  emit: jest.Mock;
  to: jest.MockedFunction<(room: string) => RoomEmitterMock>;
};

type RoomEmitterMock = {
  emit: jest.Mock;
};

type SocketMock = {
  id: string;
  emit: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
};

describe('ProcessosSocketGateway', () => {
  let gateway: ProcessosSocketGateway;
  let server: ServerMock;
  let roomEmitter: RoomEmitterMock;
  let client: SocketMock;

  beforeEach(() => {
    gateway = new ProcessosSocketGateway();
    roomEmitter = {
      emit: jest.fn(),
    };
    server = {
      emit: jest.fn(),
      to: jest.fn((room: string) => {
        void room;
        return roomEmitter;
      }),
    };
    client = {
      id: 'socket-1',
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    };

    Object.defineProperty(gateway, 'server', {
      value: server,
      configurable: true,
    });
  });

  it('handleConnection emite process:socket-connected para o cliente', () => {
    gateway.handleConnection(client as unknown as Socket);

    expect(client.emit).toHaveBeenCalledWith(
      PROCESSOS_SOCKET_EVENTS.CONNECTED,
      expect.objectContaining({
        message: 'Conectado ao canal de processos.',
        socketId: 'socket-1',
      }),
    );
  });

  it('handleJoinProcess chama client.join com sala correta', () => {
    const response = gateway.handleJoinProcess(client as unknown as Socket, {
      id_processo: 10,
    });

    expect(client.join).toHaveBeenCalledWith('process:10');
    expect(client.emit).toHaveBeenCalledWith(
      PROCESSOS_SOCKET_EVENTS.JOINED_PROCESS,
      expect.objectContaining({
        id_processo: 10,
        room: 'process:10',
      }),
    );
    expect(response).toMatchObject({
      id_processo: 10,
      room: 'process:10',
    });
  });

  it('handleLeaveProcess chama client.leave com sala correta', () => {
    const response = gateway.handleLeaveProcess(client as unknown as Socket, {
      id_processo: 10,
    });

    expect(client.leave).toHaveBeenCalledWith('process:10');
    expect(client.emit).toHaveBeenCalledWith(
      PROCESSOS_SOCKET_EVENTS.LEFT_PROCESS,
      expect.objectContaining({
        id_processo: 10,
        room: 'process:10',
      }),
    );
    expect(response).toMatchObject({
      id_processo: 10,
      room: 'process:10',
    });
  });

  it('emitProcessStarted emite para todos e para sala', () => {
    const payload = {
      id_processo: 10,
      status_processo: statusprocesso.EM_EXECUCAO,
      message: 'Processo iniciado.',
      emitted_at: new Date('2026-01-01T00:00:00Z'),
    };

    gateway.emitProcessStarted(payload);

    expect(server.emit).toHaveBeenCalledWith(
      PROCESSOS_SOCKET_EVENTS.STARTED,
      payload,
    );
    expect(server.to).toHaveBeenCalledWith('process:10');
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      PROCESSOS_SOCKET_EVENTS.STARTED,
      payload,
    );
  });

  it('emitEmergencyStop emite para todos e para sala', () => {
    const payload = {
      id_processo: 10,
      motivo: 'Falha crítica',
      message: 'Parada de emergência executada.',
      emitted_at: new Date('2026-01-01T00:00:00Z'),
    };

    gateway.emitEmergencyStop(payload);

    expect(server.emit).toHaveBeenCalledWith(
      PROCESSOS_SOCKET_EVENTS.EMERGENCY_STOP,
      payload,
    );
    expect(server.to).toHaveBeenCalledWith('process:10');
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      PROCESSOS_SOCKET_EVENTS.EMERGENCY_STOP,
      payload,
    );
  });

  it('emitDashboardUpdated emite apenas para sala', () => {
    const payload = {
      id_processo: 10,
      dashboard: makeDashboard(),
      emitted_at: new Date('2026-01-01T00:00:00Z'),
    };

    gateway.emitDashboardUpdated(payload);

    expect(server.emit).not.toHaveBeenCalled();
    expect(server.to).toHaveBeenCalledWith('process:10');
    expect(roomEmitter.emit).toHaveBeenCalledWith(
      PROCESSOS_SOCKET_EVENTS.DASHBOARD_UPDATED,
      payload,
    );
  });

  it('payload invalido em handleJoinProcess emite process:error', () => {
    const response = gateway.handleJoinProcess(client as unknown as Socket, {
      id_processo: 0,
    });

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(
      PROCESSOS_SOCKET_EVENTS.ERROR,
      expect.objectContaining({
        id_processo: 0,
        room: '',
        message: 'id_processo inválido.',
      }),
    );
    expect(response).toMatchObject({
      id_processo: 0,
      room: '',
    });
  });

  function makeDashboard(): ProcessoDashboardData {
    return {
      id_processo: 10,
      nome_processo: 'Processo teste',
      status_processo: statusprocesso.EM_EXECUCAO,
      vacuo_alvo: -80,
      vacuo_atual: -40,
      tempo_maximo: 600,
      tempo_execucao: 120,
      iniciado_em: new Date('2026-01-01T00:00:00Z'),
      finalizado_em: null,
      progresso_percentual: 20,
      tanques: [
        {
          id_processo_tanque: 20,
          id_tanque: 30,
          nome_tanque: 'Tanque A',
          status_tanque_processo: statustanqueprocesso.EM_EXECUCAO,
          vacuo_alvo: -80,
          vacuo_atual: -40,
          vacuo_inicial: -5,
          vacuo_final: null,
          vacuo_medio: -30,
          eficiencia: 50,
          total_sensores: 1,
          total_leituras: 1,
          leituras: [
            {
              id_leitura_sensor: 1,
              id_processo_tanque_sensor: 40,
              id_tanque: 30,
              id_sensor: 50,
              valor_vacuo: -40,
              leitura_em: new Date('2026-01-01T00:01:00Z'),
            },
          ],
        },
      ],
      alarmes: {
        total: 0,
        criticos: 0,
        medios: 0,
        infos: 0,
        ultima_severidade: null,
      },
    };
  }
});
