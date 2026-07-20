import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nivelacesso } from '@prisma/client';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { SocketAuthService } from './socket-auth.service';

describe('SocketAuthService', () => {
  const jwt = { verifyAsync: jest.fn() };
  const prisma = {
    usuarios: {
      findUnique: jest.fn(),
    },
  };
  let service: SocketAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SocketAuthService(
      jwt as unknown as JwtService,
      prisma as unknown as PrismaService,
    );
  });

  it('autentica o handshake com o mesmo access token da API HTTP', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 7,
      login: 'operador',
      id_nivel_acesso: 1,
      token_version: 2,
    });
    prisma.usuarios.findUnique.mockResolvedValue({
      id_usuario: 7,
      login: 'operador',
      versao_token_autenticacao: 2,
      niveisacessos: { nome: nivelacesso.OPERADOR },
    });
    const client = makeClient({ token: 'Bearer jwt-valido' });

    const result = await service.authenticate(client);

    expect(jwt.verifyAsync).toHaveBeenCalledWith('jwt-valido');
    expect(prisma.usuarios.findUnique).toHaveBeenCalledWith({
      where: { id_usuario: 7 },
      select: {
        id_usuario: true,
        login: true,
        versao_token_autenticacao: true,
        niveisacessos: { select: { nome: true } },
      },
    });
    expect(result).toEqual({
      id_usuario: 7,
      login: 'operador',
      nivel_acesso: nivelacesso.OPERADOR,
    });
    expect(service.getAuthenticatedUser(client)).toEqual(result);
  });

  it('recusa handshake sem token', async () => {
    await expect(service.authenticate(makeClient({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('recusa token invalido sem consultar usuario', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(
      service.authenticate(makeClient({ access_token: 'jwt-invalido' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.usuarios.findUnique).not.toHaveBeenCalled();
  });

  it('recusa token de recuperacao de senha no Socket.IO', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 7,
      login: 'operador',
      id_nivel_acesso: 1,
      token_version: 2,
      type: 'password_reset',
    });

    await expect(
      service.authenticate(makeClient({ token: 'reset-token' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.usuarios.findUnique).not.toHaveBeenCalled();
  });

  it('recusa access token emitido antes da troca de senha', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 7,
      login: 'operador',
      id_nivel_acesso: 1,
      token_version: 1,
    });
    prisma.usuarios.findUnique.mockResolvedValue({
      id_usuario: 7,
      login: 'operador',
      versao_token_autenticacao: 2,
      niveisacessos: { nome: nivelacesso.OPERADOR },
    });

    await expect(
      service.authenticate(makeClient({ token: 'jwt-antigo' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('recusa handshake em andamento quando o usuario e revogado durante a consulta', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 7,
      login: 'operador',
      id_nivel_acesso: 1,
      token_version: 2,
    });
    let resolveLookupStarted: (() => void) | undefined;
    const lookupStarted = new Promise<void>((resolve) => {
      resolveLookupStarted = resolve;
    });
    let resolveUser:
      | ((value: {
          id_usuario: number;
          login: string;
          versao_token_autenticacao: number;
          niveisacessos: { nome: nivelacesso };
        }) => void)
      | undefined;
    const userLookup = new Promise<{
      id_usuario: number;
      login: string;
      versao_token_autenticacao: number;
      niveisacessos: { nome: nivelacesso };
    }>((resolve) => {
      resolveUser = resolve;
    });
    prisma.usuarios.findUnique.mockImplementation(() => {
      resolveLookupStarted?.();
      return userLookup;
    });

    const authentication = service.authenticate(
      makeClient({ token: 'jwt-antigo-ainda-em-handshake' }),
    );
    await lookupStarted;

    service.disconnectUser(7);
    resolveUser?.({
      id_usuario: 7,
      login: 'operador',
      versao_token_autenticacao: 2,
      niveisacessos: { nome: nivelacesso.OPERADOR },
    });

    await expect(authentication).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('recusa revogacao depois da autenticacao e antes de registrar a conexao', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 7,
      login: 'operador',
      id_nivel_acesso: 1,
      token_version: 2,
    });
    let resolveLookupStarted: (() => void) | undefined;
    const lookupStarted = new Promise<void>((resolve) => {
      resolveLookupStarted = resolve;
    });
    let resolveUser:
      | ((value: {
          id_usuario: number;
          login: string;
          versao_token_autenticacao: number;
          niveisacessos: { nome: nivelacesso };
        }) => void)
      | undefined;
    const userLookup = new Promise<{
      id_usuario: number;
      login: string;
      versao_token_autenticacao: number;
      niveisacessos: { nome: nivelacesso };
    }>((resolve) => {
      resolveUser = resolve;
    });
    prisma.usuarios.findUnique.mockImplementation(() => {
      resolveLookupStarted?.();
      return userLookup;
    });

    let middleware:
      | ((client: Socket, next: (error?: Error) => void) => void)
      | undefined;
    const namespace = {
      name: '/processos',
      use: jest.fn((registeredMiddleware) => {
        middleware = registeredMiddleware;
      }),
      sockets: new Map(),
    };
    service.registerAuthenticationMiddleware(namespace as unknown as Namespace);
    const client = makeClient({ token: 'jwt-valido-antes-da-revogacao' });
    const middlewareResult = new Promise<Error | undefined>((resolve) => {
      middleware?.(client, resolve);
    });
    await lookupStarted;

    resolveUser?.({
      id_usuario: 7,
      login: 'operador',
      versao_token_autenticacao: 2,
      niveisacessos: { nome: nivelacesso.OPERADOR },
    });
    queueMicrotask(() => service.disconnectUser(7));

    await expect(middlewareResult).resolves.toMatchObject({
      message: 'Conexao Socket.IO nao autorizada.',
      data: { code: 'UNAUTHORIZED' },
    });
    expect(service.getAuthenticatedUser(client)).toBeNull();
  });

  it('desconecta revogacao ocorrida depois de next e antes do registro no namespace', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 7,
      login: 'operador',
      id_nivel_acesso: 1,
      token_version: 2,
    });
    prisma.usuarios.findUnique.mockResolvedValue({
      id_usuario: 7,
      login: 'operador',
      versao_token_autenticacao: 2,
      niveisacessos: { nome: nivelacesso.OPERADOR },
    });

    let middleware:
      | ((client: Socket, next: (error?: Error) => void) => void)
      | undefined;
    const sockets = new Map<string, Socket>();
    const namespace = {
      name: '/mqtt-hardware',
      use: jest.fn((registeredMiddleware) => {
        middleware = registeredMiddleware;
      }),
      sockets,
    };
    service.registerAuthenticationMiddleware(namespace as unknown as Namespace);
    const disconnect = jest.fn();
    const client = makeClient({ token: 'jwt-valido' }, disconnect);

    middleware?.(client, (error) => {
      expect(error).toBeUndefined();
      process.nextTick(() => {
        (client as unknown as { connected: boolean }).connected = true;
        sockets.set(client.id, client);
      });
      queueMicrotask(() =>
        queueMicrotask(() => {
          service.disconnectUser(7);
        }),
      );
    });

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(disconnect).toHaveBeenCalledWith(true);
    expect(service.getAuthenticatedUser(client)).toBeNull();
  });

  it('desconecta sockets ativos do usuário após troca de senha', () => {
    const targetDisconnect = jest.fn();
    const anotherDisconnect = jest.fn();
    const targetClient = makeClient({}, targetDisconnect);
    (targetClient.data as Record<string, unknown>).user = {
      id_usuario: 7,
      login: 'operador',
      nivel_acesso: nivelacesso.OPERADOR,
    };
    const anotherClient = makeClient({}, anotherDisconnect);
    (anotherClient.data as Record<string, unknown>).user = {
      id_usuario: 8,
      login: 'tecnico',
      nivel_acesso: nivelacesso.TECNICO,
    };
    const namespace = {
      name: '/processos',
      use: jest.fn(),
      sockets: new Map([
        ['socket-1', targetClient],
        ['socket-2', anotherClient],
      ]),
    };
    service.registerAuthenticationMiddleware(namespace as unknown as Namespace);

    expect(service.disconnectUser(7)).toBe(1);
    expect(targetDisconnect).toHaveBeenCalledWith(true);
    expect(anotherDisconnect).not.toHaveBeenCalled();
  });

  it('desconecta o usuario alvo em todos os namespaces registrados', () => {
    const disconnects = [jest.fn(), jest.fn(), jest.fn()];
    const namespaceNames = ['/processos', '/alarmes', '/mqtt-hardware'];

    namespaceNames.forEach((name, index) => {
      const client = makeClient({}, disconnects[index]);
      (client.data as Record<string, unknown>).user = {
        id_usuario: 7,
        login: 'operador',
        nivel_acesso: nivelacesso.OPERADOR,
      };
      service.registerAuthenticationMiddleware({
        name,
        use: jest.fn(),
        sockets: new Map([[`socket-${index}`, client]]),
      } as unknown as Namespace);
    });

    expect(service.disconnectUser(7)).toBe(3);
    for (const disconnect of disconnects) {
      expect(disconnect).toHaveBeenCalledWith(true);
    }
  });

  it('middleware recusa a conexao antes do evento connection', async () => {
    let middleware:
      | ((client: Socket, next: (error?: Error) => void) => void)
      | undefined;
    const namespace = {
      name: '/alarmes',
      use: jest.fn((registeredMiddleware) => {
        middleware = registeredMiddleware;
      }),
    };
    service.registerAuthenticationMiddleware(namespace as unknown as Namespace);
    const client = makeClient({});

    const error = await new Promise<Error | undefined>((resolve) => {
      middleware?.(client, resolve);
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: 'Conexao Socket.IO nao autorizada.',
      data: { code: 'UNAUTHORIZED' },
    });
  });

  function makeClient(
    auth: Record<string, unknown>,
    disconnect = jest.fn(),
  ): Socket {
    return {
      id: 'socket-1',
      data: {},
      disconnect,
      handshake: {
        auth,
        headers: {},
      },
    } as unknown as Socket;
  }
});
