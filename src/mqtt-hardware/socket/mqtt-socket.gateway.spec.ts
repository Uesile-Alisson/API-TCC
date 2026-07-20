import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nivelacesso } from '@prisma/client';
import type { Socket } from 'socket.io';
import { SocketAuthService } from '../../auth/socket-auth.service';
import { MqttSocketGateway } from './mqtt-socket.gateway';

describe('MqttSocketGateway', () => {
  let gateway: MqttSocketGateway;
  let socketAuthService: {
    registerAuthenticationMiddleware: jest.Mock;
    getAuthenticatedUser: jest.Mock;
  };
  let client: {
    id: string;
    emit: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(() => {
    socketAuthService = {
      registerAuthenticationMiddleware: jest.fn(),
      getAuthenticatedUser: jest.fn().mockReturnValue({
        id_usuario: 7,
        login: 'operador',
        nivel_acesso: nivelacesso.OPERADOR,
      }),
    };
    gateway = new MqttSocketGateway(
      socketAuthService as unknown as SocketAuthService,
    );
    client = {
      id: 'socket-1',
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  it('registra autenticacao no namespace MQTT/Hardware', () => {
    const namespace = { name: '/mqtt-hardware' };

    gateway.afterInit(namespace as never);

    expect(
      socketAuthService.registerAuthenticationMiddleware,
    ).toHaveBeenCalledWith(namespace);
  });

  it('emite confirmacao somente para cliente com contexto autenticado', () => {
    gateway.handleConnection(client as unknown as Socket);

    expect(client.emit).toHaveBeenCalledWith(
      'socket:connected',
      expect.objectContaining({
        socketId: 'socket-1',
        conectado_em: expect.any(Date),
      }),
    );
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('desconecta por defesa em profundidade sem contexto autenticado', () => {
    socketAuthService.getAuthenticatedUser.mockReturnValueOnce(null);

    gateway.handleConnection(client as unknown as Socket);

    expect(client.emit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});
