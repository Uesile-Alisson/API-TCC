import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Socket } from 'socket.io';
import type {
  AlarmeDashboard,
  AlarmeNotificationPayload,
  ResolveAlarmeResult,
} from '../interfaces';
import { ALARMES_SOCKET_EVENTS, AlarmesSocketGateway } from '../socket';

type ServerMock = {
  emit: jest.Mock;
};

type SocketMock = {
  id: string;
  emit: jest.Mock;
};

describe('AlarmesSocketGateway', () => {
  let gateway: AlarmesSocketGateway;
  let server: ServerMock;
  let client: SocketMock;

  beforeEach(() => {
    gateway = new AlarmesSocketGateway();
    server = {
      emit: jest.fn(),
    };
    client = {
      id: 'socket-1',
      emit: jest.fn(),
    };

    Object.defineProperty(gateway, 'server', {
      value: server,
      configurable: true,
    });
  });

  it('deve estar definido', () => {
    expect(gateway).toBeDefined();
  });

  it('handleConnection emite evento CONNECTED para o cliente', () => {
    gateway.handleConnection(client as unknown as Socket);

    expect(client.emit).toHaveBeenCalledWith(
      ALARMES_SOCKET_EVENTS.CONNECTED,
      expect.objectContaining({
        message: 'Conectado ao canal de alarmes.',
        socketId: 'socket-1',
        connected_at: expect.any(Date),
      }),
    );
  });

  it('handleDisconnect nao lanca erro', () => {
    expect(() =>
      gateway.handleDisconnect(client as unknown as Socket),
    ).not.toThrow();
  });

  it('emitAlarmResolved emite alarm:resolved com payload recebido', () => {
    const payload: ResolveAlarmeResult = {
      success: true,
      id_alarme: 10,
      action: 'RESOLVED',
      message: 'Alarme resolvido com sucesso.',
      occurred_at: new Date('2026-06-21T10:00:00Z'),
      status_alarme: 'RESOLVIDO',
      resolvido_em: new Date('2026-06-21T10:00:00Z'),
      id_usuario_responsavel: 7,
    };

    gateway.emitAlarmResolved(payload);

    expect(server.emit).toHaveBeenCalledWith(
      ALARMES_SOCKET_EVENTS.RESOLVED,
      payload,
    );
  });

  it('emitDashboardUpdated emite alarm:dashboard-updated com payload recebido', () => {
    const payload = makeDashboard();

    gateway.emitDashboardUpdated(payload);

    expect(server.emit).toHaveBeenCalledWith(
      ALARMES_SOCKET_EVENTS.DASHBOARD_UPDATED,
      payload,
    );
  });

  it('emitAlarmNotification emite alarm:notification com payload recebido', () => {
    const payload: AlarmeNotificationPayload = {
      id_alarme: 10,
      titulo: 'Falha de pressao',
      descricao: 'Pressao fora do esperado.',
      severidade: 'CRITICO',
      status_alarme: 'ATIVO',
      ocorrido_em: new Date('2026-06-21T09:00:00Z'),
      policy: {
        severity: 'CRITICO',
        showPopup: true,
        autoDismiss: false,
        autoDismissMs: null,
        dismissible: false,
        reappearAfterMs: 5000,
        requiresResolution: true,
      },
      emitted_at: new Date('2026-06-21T09:00:01Z'),
    };

    gateway.emitAlarmNotification(payload);

    expect(server.emit).toHaveBeenCalledWith(
      ALARMES_SOCKET_EVENTS.NOTIFICATION,
      payload,
    );
  });
});

function makeDashboard(): AlarmeDashboard {
  return {
    total: 1,
    ativos: 1,
    resolvidos: 0,
    criticos: 1,
    medios: 0,
    infos: 0,
    por_severidade: [{ severidade: 'CRITICO', total: 1 }],
    por_status: [{ status_alarme: 'ATIVO', total: 1 }],
    por_tipo: [{ tipo_alarme: 'PROCESSO', total: 1 }],
    por_origem: [{ origem_alarme: 'BACKEND', total: 1 }],
    ultimos_criticos: [],
    ultimos_ativos: [],
    generated_at: new Date('2026-06-21T09:00:00Z'),
  };
}
