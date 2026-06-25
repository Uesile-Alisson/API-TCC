import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { nivelacesso } from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './types/authenticated-user.type';

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

type PrismaMock = {
  usuarios: {
    findUnique: AsyncMock;
  };
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwt: {
    signAsync: AsyncMock;
    verifyAsync: AsyncMock;
  };
  let mailService: {
    sendPasswordResetEmail: AsyncMock;
  };

  const currentUser: AuthenticatedUser = {
    id_usuario: 7,
    login: 'tecnico',
    nome: 'TÃ©cnico Teste',
    email: 'tecnico@teste.com',
    nivel_acesso: {
      nome: 'TECNICO',
    },
    primeiro_acesso: false,
  };

  beforeEach(() => {
    prisma = {
      usuarios: {
        findUnique: asyncMock(),
      },
    };
    jwt = {
      signAsync: asyncMock(),
      verifyAsync: asyncMock(),
    };
    mailService = {
      sendPasswordResetEmail: asyncMock(),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      mailService as unknown as MailService,
    );
  });

  it('retorna usuario autenticado seguro quando existe no banco', async () => {
    prisma.usuarios.findUnique.mockResolvedValue({
      id_usuario: 7,
      nome: 'TÃ©cnico Teste',
      login: 'tecnico',
      email: 'tecnico@teste.com',
      id_nivel_acesso: 2,
      primeiro_acesso: false,
      niveisacessos: {
        nome: nivelacesso.TECNICO,
      },
      senha_hash: 'hash-secreto',
      accessToken: 'token-secreto',
      senha_temporaria: 'temporaria',
    });

    const result = await service.me(currentUser);

    expect(prisma.usuarios.findUnique).toHaveBeenCalledWith({
      where: {
        id_usuario: 7,
      },
      select: {
        id_usuario: true,
        nome: true,
        login: true,
        email: true,
        id_nivel_acesso: true,
        primeiro_acesso: true,
        niveisacessos: {
          select: {
            nome: true,
          },
        },
      },
    });
    expect(result).toEqual({
      id_usuario: 7,
      nome: 'TÃ©cnico Teste',
      login: 'tecnico',
      email: 'tecnico@teste.com',
      id_nivel_acesso: 2,
      nivel_acesso: nivelacesso.TECNICO,
      primeiro_acesso: false,
    });
    expect(result).not.toHaveProperty('senha_hash');
    expect(result).not.toHaveProperty('accessToken');
    expect(result).not.toHaveProperty('senha_temporaria');
  });

  it('retorna 401 quando usuario autenticado nao existe mais', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(null);

    await expect(service.me(currentUser)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
