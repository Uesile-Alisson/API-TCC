import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nivelacesso } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthenticatedUser } from '@/auth/types/authenticated-user.type';
import { PasswordHasherService } from '@/auth/password-hasher.service';
import { SocketAuthService } from '@/auth/socket-auth.service';
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
    create: AsyncMock<UserRecord>;
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
      create: asyncMock<UserRecord>(),
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
  let passwordHasher: PasswordHasherService;
  let socketAuth: {
    disconnectUser: Mock<(userId: number) => number>;
  };

  const adminUser = createAuthenticatedUser(1, nivelacesso.ADMINISTRADOR);
  const otherAdmin = createUser(2, 'Outro Admin', nivelacesso.ADMINISTRADOR);
  const operator = createUser(3, 'Operador Teste', nivelacesso.OPERADOR);

  beforeEach(() => {
    prisma = createPrismaMock();
    passwordHasher = new PasswordHasherService();
    socketAuth = {
      disconnectUser: jest.fn<(userId: number) => number>().mockReturnValue(0),
    };
    service = new UserService(
      prisma as unknown as PrismaService,
      passwordHasher,
      socketAuth as unknown as SocketAuthService,
    );
  });

  it('cria senhas temporarias criptograficamente aleatorias com 24 caracteres', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(null);
    prisma.niveisacessos.findUnique.mockResolvedValue(
      createAccessLevel(nivelacesso.OPERADOR),
    );
    prisma.usuarios.create.mockResolvedValue(operator);
    const dto = {
      nome: 'Operador Teste',
      login: 'operador.teste',
      email: 'operador.teste@tsea.local',
      id_nivel_acesso: 1,
    };

    const first = await service.create(dto);
    const second = await service.create({
      ...dto,
      login: 'operador.dois',
      email: 'operador.dois@tsea.local',
    });

    expect(first.temporaryPassword).toHaveLength(24);
    expect(first.temporaryPassword).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(second.temporaryPassword).not.toBe(first.temporaryPassword);

    const firstCreate = prisma.usuarios.create.mock.calls[0][0] as {
      data: { senha_hash: string };
    };
    expect(firstCreate.data.senha_hash).toMatch(/^scrypt\$/);
    await expect(
      passwordHasher.verify(
        first.temporaryPassword,
        firstCreate.data.senha_hash,
      ),
    ).resolves.toMatchObject({ valid: true });
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
    expect(prisma.usuarios.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_usuario: operator.id_usuario },
        data: expect.objectContaining({
          versao_token_autenticacao: { increment: 1 },
          atualizado_em: expect.any(Date),
        }),
      }),
    );
    expect(socketAuth.disconnectUser).toHaveBeenCalledWith(operator.id_usuario);
    expect(prisma.usuarios.update.mock.invocationCallOrder[0]).toBeLessThan(
      socketAuth.disconnectUser.mock.invocationCallOrder[0],
    );
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
    expect(socketAuth.disconnectUser).toHaveBeenCalledWith(ownAdmin.id_usuario);
  });

  it('recusa PATCH de perfil vazio sem revogar a sessao', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(operator);

    await expect(
      service.updateUser(operator.id_usuario, {} as never, adminUser),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.usuarios.update).not.toHaveBeenCalled();
    expect(socketAuth.disconnectUser).not.toHaveBeenCalled();
  });

  it('incrementa a versao e desconecta sockets depois de alterar o nivel', async () => {
    const technician = createUser(
      operator.id_usuario,
      'Operador Teste',
      nivelacesso.TECNICO,
    );
    prisma.usuarios.findUnique.mockResolvedValue(operator);
    prisma.niveisacessos.findUnique.mockResolvedValue(
      createAccessLevel(nivelacesso.TECNICO),
    );
    prisma.usuarios.update.mockResolvedValue(technician);

    await expect(
      service.updateUserRole(
        operator.id_usuario,
        { id_nivel_acesso: 2 },
        adminUser,
      ),
    ).resolves.toEqual(technician);

    expect(prisma.usuarios.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id_nivel_acesso: 2,
          versao_token_autenticacao: { increment: 1 },
          atualizado_em: expect.any(Date),
        }),
      }),
    );
    expect(socketAuth.disconnectUser).toHaveBeenCalledWith(operator.id_usuario);
    expect(prisma.usuarios.update.mock.invocationCallOrder[0]).toBeLessThan(
      socketAuth.disconnectUser.mock.invocationCallOrder[0],
    );
  });

  it('trata alteracao para o mesmo nivel como no-op sem derrubar a sessao', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(operator);

    await expect(
      service.updateUserRole(
        operator.id_usuario,
        { id_nivel_acesso: 1 },
        adminUser,
      ),
    ).resolves.toEqual(operator);

    expect(prisma.niveisacessos.findUnique).not.toHaveBeenCalled();
    expect(prisma.usuarios.update).not.toHaveBeenCalled();
    expect(socketAuth.disconnectUser).not.toHaveBeenCalled();
  });

  it('bloqueia auto-rebaixamento do administrador', async () => {
    const ownAdmin = createUser(1, 'Admin Atual', nivelacesso.ADMINISTRADOR);
    prisma.usuarios.findUnique.mockResolvedValue(ownAdmin);

    await expect(
      service.updateUserRole(
        ownAdmin.id_usuario,
        { id_nivel_acesso: 2 },
        adminUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.usuarios.update).not.toHaveBeenCalled();
    expect(socketAuth.disconnectUser).not.toHaveBeenCalled();
  });

  it('bloqueia autoexclusao e preserva inclusive o ultimo administrador', async () => {
    const ownAdmin = createUser(1, 'Admin Atual', nivelacesso.ADMINISTRADOR);
    prisma.usuarios.findUnique.mockResolvedValue(ownAdmin);

    await expect(
      service.removeUser(ownAdmin.id_usuario, adminUser),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.usuarios.delete).not.toHaveBeenCalled();
    expect(socketAuth.disconnectUser).not.toHaveBeenCalled();
  });

  it('desconecta o usuario somente depois da exclusao confirmada', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(operator);
    prisma.usuarios.delete.mockResolvedValue(operator);

    await expect(
      service.removeUser(operator.id_usuario, adminUser),
    ).resolves.toEqual({ message: 'Usuário excluído com sucesso.' });

    expect(prisma.usuarios.delete).toHaveBeenCalledWith({
      where: { id_usuario: operator.id_usuario },
    });
    expect(socketAuth.disconnectUser).toHaveBeenCalledWith(operator.id_usuario);
    expect(prisma.usuarios.delete.mock.invocationCallOrder[0]).toBeLessThan(
      socketAuth.disconnectUser.mock.invocationCallOrder[0],
    );
  });

  it('nao desconecta sockets quando a atualizacao do banco falha', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(operator);
    prisma.usuarios.update.mockRejectedValue(new Error('Falha no banco'));

    await expect(
      service.updateUser(
        operator.id_usuario,
        { nome: 'Novo nome' } as never,
        adminUser,
      ),
    ).rejects.toThrow('Falha no banco');

    expect(socketAuth.disconnectUser).not.toHaveBeenCalled();
  });

  it('nao desconecta sockets quando a exclusao falha', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(operator);
    prisma.usuarios.delete.mockRejectedValue(new Error('Falha no banco'));

    await expect(
      service.removeUser(operator.id_usuario, adminUser),
    ).rejects.toThrow('Falha no banco');

    expect(socketAuth.disconnectUser).not.toHaveBeenCalled();
  });
});
