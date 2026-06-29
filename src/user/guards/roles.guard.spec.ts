import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nivelacesso } from '@prisma/client';
import type { Mock } from 'jest-mock';
import type { AuthenticatedUser } from '@/auth/types/authenticated-user.type';
import { RolesGuard } from './roles.guard';

type SyncMock<TResult> = Mock<(...args: unknown[]) => TResult>;

const syncMock = <TResult>(): SyncMock<TResult> =>
  jest.fn<(...args: unknown[]) => TResult>();

function createAuthenticatedUser(role: nivelacesso): AuthenticatedUser {
  return {
    id_usuario: 1,
    nome: 'Usuario Teste',
    login: 'usuario.teste',
    email: 'usuario.teste@tsea.local',
    id_nivel_acesso: role === nivelacesso.ADMINISTRADOR ? 3 : 1,
    nivel_acesso: {
      nome: role,
    },
    primeiro_acesso: false,
  };
}

function createExecutionContext(user: AuthenticatedUser): ExecutionContext {
  const handler = (): void => undefined;
  const controller = class TestController {};

  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        user,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: {
    getAllAndOverride: SyncMock<nivelacesso[] | undefined>;
  };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: syncMock<nivelacesso[] | undefined>(),
    };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('permite ADMINISTRADOR em rota restrita a ADMINISTRADOR', () => {
    reflector.getAllAndOverride.mockReturnValue([nivelacesso.ADMINISTRADOR]);

    expect(
      guard.canActivate(
        createExecutionContext(
          createAuthenticatedUser(nivelacesso.ADMINISTRADOR),
        ),
      ),
    ).toBe(true);
  });

  it('bloqueia TECNICO em rota restrita a ADMINISTRADOR', () => {
    reflector.getAllAndOverride.mockReturnValue([nivelacesso.ADMINISTRADOR]);

    expect(() =>
      guard.canActivate(
        createExecutionContext(createAuthenticatedUser(nivelacesso.TECNICO)),
      ),
    ).toThrow(ForbiddenException);
  });

  it('bloqueia OPERADOR em rota restrita a ADMINISTRADOR', () => {
    reflector.getAllAndOverride.mockReturnValue([nivelacesso.ADMINISTRADOR]);

    expect(() =>
      guard.canActivate(
        createExecutionContext(createAuthenticatedUser(nivelacesso.OPERADOR)),
      ),
    ).toThrow(ForbiddenException);
  });
});
