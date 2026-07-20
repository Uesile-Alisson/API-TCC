import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { nivelacesso } from '@prisma/client';
import { validate } from 'class-validator';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { FirstAcessDTO } from './dto/first-acess.dto';
import { ResetPasswordDTO } from './dto/reset-password.dto';
import { PasswordHasherService } from './password-hasher.service';
import { JwtStrategy } from './strategys/jwt.strategy';
import { SocketAuthService } from './socket-auth.service';
import type { AuthenticatedUser } from './types/authenticated-user.type';

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

type PrismaMock = {
  usuarios: {
    findUnique: AsyncMock;
    update: AsyncMock;
    updateMany: AsyncMock;
    updateManyAndReturn: AsyncMock;
  };
};

const validNewPassword = 'uma frase longa e memorável';

function createUser(passwordHash: string) {
  return {
    id_usuario: 7,
    nome: 'Técnico Teste',
    login: 'tecnico',
    email: 'tecnico@teste.com',
    id_nivel_acesso: 2,
    senha_hash: passwordHash,
    primeiro_acesso: true,
    versao_token_autenticacao: 3,
    tentativas_login_falhas: 0,
    login_bloqueado_ate: null,
    token_redefinicao_senha_hash: null,
    token_redefinicao_senha_expira_em: null,
    niveisacessos: {
      nome: nivelacesso.TECNICO,
    },
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwt: {
    signAsync: AsyncMock;
  };
  let mailService: {
    sendPasswordResetEmail: AsyncMock;
  };
  let passwordHasher: PasswordHasherService;
  let socketAuth: {
    disconnectUser: Mock<(userId: number) => number>;
  };

  const currentUser: AuthenticatedUser = {
    id_usuario: 7,
    login: 'tecnico',
    nome: 'Técnico Teste',
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
        update: asyncMock(),
        updateMany: asyncMock(),
        updateManyAndReturn: asyncMock(),
      },
    };
    jwt = {
      signAsync: asyncMock(),
    };
    mailService = {
      sendPasswordResetEmail: asyncMock(),
    };
    passwordHasher = new PasswordHasherService();
    socketAuth = {
      disconnectUser: jest.fn<(userId: number) => number>().mockReturnValue(0),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      mailService as unknown as MailService,
      passwordHasher,
      socketAuth as unknown as SocketAuthService,
    );
  });

  it('usa a mesma resposta para login inexistente e senha incorreta', async () => {
    prisma.usuarios.findUnique.mockResolvedValueOnce(null);
    const missingUserError = await service
      .signin({ login: 'inexistente', senha: 'senha qualquer' })
      .catch((error: unknown) => error);

    const legacyHash = await bcrypt.hash('senha correta legada', 4);
    prisma.usuarios.findUnique.mockResolvedValueOnce(createUser(legacyHash));
    prisma.usuarios.update.mockResolvedValueOnce({
      tentativas_login_falhas: 1,
    });
    const wrongPasswordError = await service
      .signin({ login: 'tecnico', senha: 'senha incorreta' })
      .catch((error: unknown) => error);

    expect(missingUserError).toBeInstanceOf(UnauthorizedException);
    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
    expect((missingUserError as UnauthorizedException).message).toBe(
      'Credenciais inválidas.',
    );
    expect((wrongPasswordError as UnauthorizedException).message).toBe(
      'Credenciais inválidas.',
    );
  });

  it('migra bcrypt legado para scrypt depois de login válido', async () => {
    const legacyPassword = 'senha legada correta';
    const user = createUser(await bcrypt.hash(legacyPassword, 4));
    user.primeiro_acesso = false;
    prisma.usuarios.findUnique.mockResolvedValue(user);
    prisma.usuarios.update.mockResolvedValue(user);
    jwt.signAsync.mockResolvedValue('access-token');

    await expect(
      service.signin({ login: user.login, senha: legacyPassword }),
    ).resolves.toMatchObject({ access_token: 'access-token' });

    expect(prisma.usuarios.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_usuario: user.id_usuario },
        data: expect.objectContaining({
          senha_hash: expect.stringMatching(/^scrypt\$/),
          tentativas_login_falhas: 0,
          login_bloqueado_ate: null,
        }),
      }),
    );
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: user.id_usuario,
      login: user.login,
      id_nivel_acesso: user.id_nivel_acesso,
      token_version: user.versao_token_autenticacao,
    });
  });

  it('inicia bloqueio progressivo a partir da quinta falha', async () => {
    const before = Date.now();
    prisma.usuarios.update
      .mockResolvedValueOnce({ tentativas_login_falhas: 5 })
      .mockResolvedValueOnce({});

    await (
      service as unknown as { recordFailedLogin(userId: number): Promise<void> }
    ).recordFailedLogin(7);

    const secondUpdate = prisma.usuarios.update.mock.calls[1][0] as {
      data: { login_bloqueado_ate: Date };
    };
    expect(
      secondUpdate.data.login_bloqueado_ate.getTime(),
    ).toBeGreaterThanOrEqual(before + 30_000);
    expect(secondUpdate.data.login_bloqueado_ate.getTime()).toBeLessThanOrEqual(
      Date.now() + 31_000,
    );
  });

  it('primeiro acesso troca a senha e invalida tokens emitidos', async () => {
    const user = createUser(await bcrypt.hash('senha temporaria antiga', 4));
    prisma.usuarios.findUnique.mockResolvedValue(user);
    prisma.usuarios.update.mockResolvedValue(user);

    await expect(
      service.firstAccess(user.id_usuario, {
        senhaNova: validNewPassword,
        confirmarSenha: validNewPassword,
      }),
    ).resolves.toMatchObject({ message: expect.stringContaining('sucesso') });

    expect(prisma.usuarios.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          senha_hash: expect.stringMatching(/^scrypt\$/),
          versao_token_autenticacao: { increment: 1 },
          token_redefinicao_senha_hash: null,
        }),
      }),
    );
    expect(socketAuth.disconnectUser).toHaveBeenCalledWith(user.id_usuario);
  });

  it('recuperação grava somente o hash do token opaco', async () => {
    const user = createUser(await passwordHasher.hash(validNewPassword));
    prisma.usuarios.findUnique.mockResolvedValue(user);
    prisma.usuarios.updateMany.mockResolvedValue({ count: 1 });
    mailService.sendPasswordResetEmail.mockResolvedValue(undefined);

    await service.forgotPassword({ login: user.login });

    const emailCall = mailService.sendPasswordResetEmail.mock.calls[0];
    const resetToken = emailCall[1] as string;
    const persistenceCall = prisma.usuarios.updateMany.mock.calls[0][0] as {
      data: { token_redefinicao_senha_hash: string };
    };
    expect(resetToken).toHaveLength(43);
    expect(persistenceCall.data.token_redefinicao_senha_hash).toBe(
      createHash('sha256').update(resetToken, 'utf8').digest('hex'),
    );
    expect(persistenceCall.data.token_redefinicao_senha_hash).not.toBe(
      resetToken,
    );
  });

  it('consome token de redefinição uma única vez e revoga sessões', async () => {
    const resetToken = 'a'.repeat(43);
    prisma.usuarios.updateManyAndReturn
      .mockResolvedValueOnce([{ id_usuario: 7 }])
      .mockResolvedValueOnce([]);
    const dto = {
      token: resetToken,
      senhaNova: validNewPassword,
      confirmarSenha: validNewPassword,
    };

    await expect(service.resetPassword(dto)).resolves.toMatchObject({
      message: expect.stringContaining('sucesso'),
    });
    await expect(service.resetPassword(dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const firstUpdate = prisma.usuarios.updateManyAndReturn.mock
      .calls[0][0] as {
      where: { token_redefinicao_senha_hash: string };
      data: Record<string, unknown>;
    };
    expect(firstUpdate.where.token_redefinicao_senha_hash).toBe(
      createHash('sha256').update(resetToken, 'utf8').digest('hex'),
    );
    expect(firstUpdate.data).toMatchObject({
      versao_token_autenticacao: { increment: 1 },
      token_redefinicao_senha_hash: null,
      token_redefinicao_senha_expira_em: null,
    });
    expect(socketAuth.disconnectUser).toHaveBeenCalledWith(7);
  });

  it('rejeita confirmação diferente antes de alterar a conta', async () => {
    await expect(
      service.resetPassword({
        token: 'a'.repeat(43),
        senhaNova: validNewPassword,
        confirmarSenha: `${validNewPassword}!`,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.usuarios.updateManyAndReturn).not.toHaveBeenCalled();
  });

  it('retorna usuario autenticado seguro quando existe no banco', async () => {
    prisma.usuarios.findUnique.mockResolvedValue({
      id_usuario: 7,
      nome: 'Técnico Teste',
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

    expect(result).toEqual({
      id_usuario: 7,
      nome: 'Técnico Teste',
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

describe('política e armazenamento de senha', () => {
  it('aceita frase de 15+ caracteres sem regra de composição', async () => {
    const dto = Object.assign(new FirstAcessDTO(), {
      senhaNova: 'somente letras minúsculas e espaços',
      confirmarSenha: 'somente letras minúsculas e espaços',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejeita senha menor que 15 caracteres', async () => {
    const dto = Object.assign(new ResetPasswordDTO(), {
      token: 'a'.repeat(43),
      senhaNova: 'curta demais',
      confirmarSenha: 'curta demais',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('verifica a senha completa mesmo acima de 72 bytes', async () => {
    const hasher = new PasswordHasherService();
    const prefix = 'á'.repeat(40);
    const original = `${prefix}final correto`;
    const different = `${prefix}final errado`;
    const hash = await hasher.hash(original);

    await expect(hasher.verify(original, hash)).resolves.toMatchObject({
      valid: true,
    });
    await expect(hasher.verify(different, hash)).resolves.toMatchObject({
      valid: false,
    });
  });
});

describe('limites das rotas de autenticação', () => {
  it.each([
    ['signin', 10, 60_000, 5 * 60_000],
    ['forgotPassword', 3, 15 * 60_000, 15 * 60_000],
    ['resetPassword', 5, 15 * 60_000, 15 * 60_000],
    ['firstAccess', 5, 15 * 60_000, 15 * 60_000],
  ] as const)(
    'configura rate limiting em %s',
    (methodName, limit, ttl, blockDuration) => {
      const method = AuthController.prototype[methodName];

      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', method)).toBe(limit);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', method)).toBe(ttl);
      expect(
        Reflect.getMetadata('THROTTLER:BLOCK_DURATIONdefault', method),
      ).toBe(blockDuration);
    },
  );
});

describe('JwtStrategy', () => {
  it('aceita somente a versão de token atual da conta', async () => {
    const prisma = {
      usuarios: {
        findUnique: jest.fn().mockResolvedValue({
          id_usuario: 7,
          id_nivel_acesso: 2,
          login: 'tecnico',
          nome: 'Técnico',
          email: 'tecnico@teste.com',
          primeiro_acesso: false,
          versao_token_autenticacao: 4,
          niveisacessos: { nome: nivelacesso.TECNICO },
        }),
      },
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue('segredo-de-teste'),
    };
    const strategy = new JwtStrategy(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );
    const payload = {
      sub: 7,
      login: 'tecnico',
      id_nivel_acesso: 2,
      token_version: 4,
    };

    await expect(strategy.validate(payload)).resolves.toMatchObject({
      id_usuario: 7,
      id_nivel_acesso: 2,
    });
    await expect(
      strategy.validate({ ...payload, token_version: 3 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
