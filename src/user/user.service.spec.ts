import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nivelacesso } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthenticatedUser } from '@/auth/types/authenticated-user.type';
import { UserService } from './user.service';

type AccessLevelRecord = {
  id_nivel_acesso: number;
  nome: nivelacesso;
  descricao: string | null;
  prioridade: number | null;
};

type UserRecord = {
  id_usuario: number;
  nome: string;
  login: string;
  email: string;
  primeiro_acesso: boolean;
  ultimo_acesso: Date | null;
  criado_em: Date;
  atualizado_em: Date;
  niveisacessos: AccessLevelRecord;
};

type AsyncMock<TResult> = Mock<(...args: unknown[]) => Promise<TResult>>;

const asyncMock = <TResult>(): AsyncMock<TResult> =>
  jest.fn<(...args: unknown[]) => Promise<TResult>>();

type PrismaMock = {
  usuarios: {
    findUnique: AsyncMock<UserRecord | null>;
    findMany: AsyncMock<UserRecord[]>;
    update: AsyncMock<UserRecord>;
    delete: AsyncMock<UserRecord>;
  };
  niveisacessos: {
    findUnique: AsyncMock<AccessLevelRecord | null>;
  };
};

function createAccessLevel(nome: nivelacesso): AccessLevelRecord {
  const idByRole: Record<nivelacesso, number> = {
    OPERADOR: 1,
    TECNICO: 2,
    ADMINISTRADOR: 3,
  };

  return {
    id_nivel_acesso: idByRole[nome],
    nome,
    descricao: null,
    prioridade: null,
  };
}

function createUser(
  id_usuario: number,
  nome: string,
  role: nivelacesso,
): UserRecord {
  return {
    id_usuario,
    nome,
    login: nome.toLowerCase().replace(/\s+/g, '.'),
    email: `${nome.toLowerCase().replace(/\s+/g, '.')}@tsea.local`,
    primeiro_acesso: false,
    ultimo_acesso: null,
    criado_em: new Date('2026-06-27T00:00:00.000Z'),
    atualizado_em: new Date('2026-06-27T00:00:00.000Z'),
    niveisacessos: createAccessLevel(role),
  };
}

function createAuthenticatedUser(
  id_usuario: number,
  role: nivelacesso,
): AuthenticatedUser {
  return {
    id_usuario,
    nome: `Usuario ${id_usuario}`,
    login: `usuario.${id_usuario}`,
    email: `usuario.${id_usuario}@tsea.local`,
    id_nivel_acesso: createAccessLevel(role).id_nivel_acesso,
    nivel_acesso: {
      nome: role,
    },
    primeiro_acesso: false,
  };
}

function createPrismaMock(): PrismaMock {
  return {
    usuarios: {
      findUnique: asyncMock<UserRecord | null>(),
      findMany: asyncMock<UserRecord[]>(),
      update: asyncMock<UserRecord>(),
      delete: asyncMock<UserRecord>(),
    },
    niveisacessos: {
      findUnique: asyncMock<AccessLevelRecord | null>(),
    },
  };
}

describe('UserService', () => {
  let prisma: PrismaMock;
  let service: UserService;

  const adminUser = createAuthenticatedUser(1, nivelacesso.ADMINISTRADOR);
  const otherAdmin = createUser(2, 'Outro Admin', nivelacesso.ADMINISTRADOR);
  const operator = createUser(3, 'Operador Teste', nivelacesso.OPERADOR);

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new UserService(prisma as unknown as PrismaService);
  });

  it('permite listar e visualizar outro administrador', async () => {
    prisma.usuarios.findMany.mockResolvedValue([otherAdmin]);
    prisma.usuarios.findUnique.mockResolvedValue(otherAdmin);

    await expect(service.listUsers()).resolves.toEqual([otherAdmin]);
    await expect(service.findUser(otherAdmin.id_usuario)).resolves.toEqual(
      otherAdmin,
    );
  });

  it('bloqueia ADMINISTRADOR alterando cadastro de outro ADMINISTRADOR', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(otherAdmin);

    await expect(
      service.updateUser(
        otherAdmin.id_usuario,
        {
          nome: 'Admin Editado',
          login: otherAdmin.login,
          email: otherAdmin.email,
        },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuarios.update).not.toHaveBeenCalled();
  });

  it('bloqueia ADMINISTRADOR alterando nivel de outro ADMINISTRADOR', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(otherAdmin);

    await expect(
      service.updateUserRole(
        otherAdmin.id_usuario,
        { id_nivel_acesso: 2 },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuarios.update).not.toHaveBeenCalled();
    expect(prisma.niveisacessos.findUnique).not.toHaveBeenCalled();
  });

  it('bloqueia ADMINISTRADOR removendo outro ADMINISTRADOR', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(otherAdmin);

    await expect(
      service.removeUser(otherAdmin.id_usuario, adminUser),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuarios.delete).not.toHaveBeenCalled();
  });

  it('permite ADMINISTRADOR modificar usuario OPERADOR', async () => {
    const updatedOperator = { ...operator, nome: 'Operador Atualizado' };
    prisma.usuarios.findUnique.mockResolvedValue(operator);
    prisma.usuarios.update.mockResolvedValue(updatedOperator);

    await expect(
      service.updateUser(
        operator.id_usuario,
        {
          nome: updatedOperator.nome,
          login: operator.login,
          email: operator.email,
        },
        adminUser,
      ),
    ).resolves.toEqual(updatedOperator);
    expect(prisma.usuarios.update).toHaveBeenCalled();
  });

  it('permite ADMINISTRADOR modificar o proprio cadastro', async () => {
    const ownAdmin = createUser(1, 'Admin Atual', nivelacesso.ADMINISTRADOR);
    const updatedAdmin = { ...ownAdmin, nome: 'Admin Atualizado' };
    prisma.usuarios.findUnique.mockResolvedValue(ownAdmin);
    prisma.usuarios.update.mockResolvedValue(updatedAdmin);

    await expect(
      service.updateUser(
        ownAdmin.id_usuario,
        {
          nome: updatedAdmin.nome,
          login: ownAdmin.login,
          email: ownAdmin.email,
        },
        adminUser,
      ),
    ).resolves.toEqual(updatedAdmin);
    expect(prisma.usuarios.update).toHaveBeenCalled();
  });
});
