import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nivelacesso } from '@prisma/client';
import type { AuthenticatedUser } from '@/auth/types/authenticated-user.type';
import { USER_ROLES_KEY } from './decorators/user.decorator';
import { UserController } from './user.controller';
import { UserService } from './user.service';

type AsyncMock = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

describe('UserController', () => {
  let controller: UserController;
  let service: Record<
    | 'create'
    | 'listUsers'
    | 'findUser'
    | 'updateUser'
    | 'updateUserRole'
    | 'removeUser',
    AsyncMock
  >;

  const currentUser: AuthenticatedUser = {
    id_usuario: 1,
    login: 'administrador',
    nome: 'Administrador',
    email: 'admin@teste.com',
    id_nivel_acesso: 3,
    nivel_acesso: { nome: nivelacesso.ADMINISTRADOR },
    primeiro_acesso: false,
  };

  beforeEach(() => {
    service = {
      create: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      listUsers: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUser: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateUser: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateUserRole: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      removeUser: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    controller = new UserController(service as unknown as UserService);
  });

  it('delega as seis operacoes ao service sem alterar payloads', async () => {
    const createDto = {
      nome: 'Operador Teste',
      login: 'operador.teste',
      email: 'operador@teste.com',
      id_nivel_acesso: 1,
    };
    const updateDto = {
      nome: 'Operador Atualizado',
      login: 'operador.atualizado',
      email: 'operador.atualizado@teste.com',
    };
    const roleDto = { id_nivel_acesso: 2 };

    await controller.create(createDto);
    await controller.listUsers();
    await controller.findUser(7);
    await controller.updateUser(7, updateDto, currentUser);
    await controller.updateUserRole(7, roleDto, currentUser);
    await controller.removeUser(7, currentUser);

    expect(service.create).toHaveBeenCalledWith(createDto);
    expect(service.listUsers).toHaveBeenCalledWith();
    expect(service.findUser).toHaveBeenCalledWith(7);
    expect(service.updateUser).toHaveBeenCalledWith(7, updateDto, currentUser);
    expect(service.updateUserRole).toHaveBeenCalledWith(
      7,
      roleDto,
      currentUser,
    );
    expect(service.removeUser).toHaveBeenCalledWith(7, currentUser);
  });

  it.each([
    ['create', [nivelacesso.ADMINISTRADOR]],
    ['listUsers', [nivelacesso.ADMINISTRADOR, nivelacesso.TECNICO]],
    ['findUser', [nivelacesso.ADMINISTRADOR, nivelacesso.TECNICO]],
    ['updateUser', [nivelacesso.ADMINISTRADOR]],
    ['updateUserRole', [nivelacesso.ADMINISTRADOR]],
    ['removeUser', [nivelacesso.ADMINISTRADOR]],
  ] as const)('mantem as roles de %s', (methodName, expectedRoles) => {
    expect(
      Reflect.getMetadata(USER_ROLES_KEY, UserController.prototype[methodName]),
    ).toEqual(expectedRoles);
  });
});
