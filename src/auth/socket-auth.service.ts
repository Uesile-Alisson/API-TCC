import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { nivelacesso } from '@prisma/client';
import type { Namespace, Socket } from 'socket.io';
import type { JwtPayload } from './types/jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';

export interface SocketAuthenticatedUser {
  id_usuario: number;
  login: string;
  nivel_acesso: nivelacesso;
}

interface SocketAuthenticationError extends Error {
  data: {
    code: 'UNAUTHORIZED';
  };
}

@Injectable()
export class SocketAuthService {
  private readonly logger = new Logger(SocketAuthService.name);
  private readonly authenticatedNamespaces = new Set<Namespace>();
  private readonly userRevocationGenerations = new Map<number, number>();
  private readonly clientAuthenticationGenerations = new WeakMap<
    Socket,
    number
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  registerAuthenticationMiddleware(namespace: Namespace): void {
    this.authenticatedNamespaces.add(namespace);
    namespace.use((client, next) => {
      void this.authenticate(client).then(
        (authenticatedUser) => {
          if (
            !this.isClientAuthenticationCurrent(
              client,
              authenticatedUser.id_usuario,
            )
          ) {
            this.clearClientAuthentication(client);
            this.logger.warn(
              `Conexao Socket.IO revogada durante o handshake em ${namespace.name}. ` +
                `Cliente: ${client.id}.`,
            );
            next(this.createAuthenticationError());
            return;
          }

          next();
          process.nextTick(() => {
            if (
              this.isClientAuthenticationCurrent(
                client,
                authenticatedUser.id_usuario,
              )
            ) {
              return;
            }

            this.clearClientAuthentication(client);
            this.logger.warn(
              `Conexao Socket.IO revogada antes de concluir o handshake em ${namespace.name}. ` +
                `Cliente: ${client.id}.`,
            );
            client.disconnect(true);
          });
        },
        () => {
          this.clearClientAuthentication(client);
          this.logger.warn(
            `Conexao Socket.IO nao autorizada recusada em ${namespace.name}. ` +
              `Cliente: ${client.id}.`,
          );
          next(this.createAuthenticationError());
        },
      );
    });
  }

  async authenticate(client: Socket): Promise<SocketAuthenticatedUser> {
    const token = this.extractAccessToken(client);
    if (!token) {
      throw new UnauthorizedException('Token de acesso nao informado.');
    }

    let payload: JwtPayload & { type?: string };
    try {
      payload = await this.jwtService.verifyAsync<
        JwtPayload & { type?: string }
      >(token);
    } catch {
      throw new UnauthorizedException('Token de acesso invalido ou expirado.');
    }

    if (
      !Number.isInteger(payload.sub) ||
      payload.sub <= 0 ||
      typeof payload.login !== 'string' ||
      payload.login.length === 0 ||
      !Number.isInteger(payload.id_nivel_acesso) ||
      payload.id_nivel_acesso <= 0 ||
      !Number.isInteger(payload.token_version) ||
      payload.token_version < 0 ||
      payload.type !== undefined
    ) {
      throw new UnauthorizedException('Token de acesso invalido.');
    }

    const revocationGeneration = this.getUserRevocationGeneration(payload.sub);

    const user = await this.prisma.usuarios.findUnique({
      where: { id_usuario: payload.sub },
      select: {
        id_usuario: true,
        login: true,
        versao_token_autenticacao: true,
        niveisacessos: {
          select: { nome: true },
        },
      },
    });

    if (
      !user ||
      payload.token_version !== user.versao_token_autenticacao ||
      revocationGeneration !== this.getUserRevocationGeneration(payload.sub)
    ) {
      throw new UnauthorizedException('Usuario nao autorizado.');
    }

    const authenticatedUser: SocketAuthenticatedUser = {
      id_usuario: user.id_usuario,
      login: user.login,
      nivel_acesso: user.niveisacessos.nome,
    };

    this.clientAuthenticationGenerations.set(client, revocationGeneration);
    (client.data as Record<string, unknown>).user = authenticatedUser;

    return authenticatedUser;
  }

  getAuthenticatedUser(client: Socket): SocketAuthenticatedUser | null {
    const user = (client.data as Record<string, unknown>).user;

    if (!this.isRecord(user) || !Number.isInteger(user.id_usuario)) {
      return null;
    }

    return user as unknown as SocketAuthenticatedUser;
  }

  disconnectUser(userId: number): number {
    this.userRevocationGenerations.set(
      userId,
      this.getUserRevocationGeneration(userId) + 1,
    );
    let disconnectedClients = 0;

    for (const namespace of this.authenticatedNamespaces) {
      for (const client of namespace.sockets.values()) {
        if (this.getAuthenticatedUser(client)?.id_usuario !== userId) {
          continue;
        }

        client.disconnect(true);
        disconnectedClients += 1;
      }
    }

    return disconnectedClients;
  }

  private getUserRevocationGeneration(userId: number): number {
    return this.userRevocationGenerations.get(userId) ?? 0;
  }

  private isClientAuthenticationCurrent(
    client: Socket,
    userId: number,
  ): boolean {
    return (
      this.clientAuthenticationGenerations.get(client) ===
      this.getUserRevocationGeneration(userId)
    );
  }

  private clearClientAuthentication(client: Socket): void {
    this.clientAuthenticationGenerations.delete(client);
    delete (client.data as Record<string, unknown>).user;
  }

  private createAuthenticationError(): SocketAuthenticationError {
    const error = new Error(
      'Conexao Socket.IO nao autorizada.',
    ) as SocketAuthenticationError;
    error.data = { code: 'UNAUTHORIZED' };

    return error;
  }

  private extractAccessToken(client: Socket): string | null {
    const handshakeAuth: unknown = client.handshake.auth;
    const auth = this.isRecord(handshakeAuth) ? handshakeAuth : {};
    const authToken = auth.token;
    const authAccessToken = auth.access_token;
    const authorization = client.handshake.headers.authorization;
    const candidate =
      (typeof authToken === 'string' && authToken) ||
      (typeof authAccessToken === 'string' && authAccessToken) ||
      (typeof authorization === 'string' && authorization) ||
      null;

    if (!candidate) {
      return null;
    }

    return candidate.replace(/^Bearer\s+/i, '').trim() || null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
