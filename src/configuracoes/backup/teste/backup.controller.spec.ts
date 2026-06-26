import { PATH_METADATA } from '@nestjs/common/constants';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { origembackup, statusbackup, tipobackup } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../auth/types/authenticated-user.type';
import { BackupController } from '../backup.controller';
import { BackupService } from '../backup.service';

type AsyncMock<T = unknown> = Mock<(...args: unknown[]) => Promise<T>>;

type BackupServiceMock = {
  create: AsyncMock;
  findAll: AsyncMock;
  findOne: AsyncMock;
  restore: AsyncMock;
};

const asyncMock = <T = unknown>(): AsyncMock<T> =>
  jest.fn<(...args: unknown[]) => Promise<T>>();

describe('BackupController', () => {
  let controller: BackupController;
  let service: BackupServiceMock;

  beforeEach(() => {
    service = {
      create: asyncMock(),
      findAll: asyncMock(),
      findOne: asyncMock(),
      restore: asyncMock(),
    };
    controller = new BackupController(service as unknown as BackupService);
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('create delega para BackupService.create', async () => {
    const dto = {
      tipo_backup: tipobackup.SISTEMA,
      origem_backup: origembackup.MANUAL,
    };
    const currentUser = makeCurrentUser();
    const response = { id_backup: 1 };
    service.create.mockResolvedValue(response);

    await expect(controller.create(dto, currentUser)).resolves.toBe(response);

    expect(service.create).toHaveBeenCalledWith(dto, currentUser);
  });

  it('findAll delega para BackupService.findAll', async () => {
    const query = {
      tipo_backup: tipobackup.MQTT,
      status_backup: statusbackup.GERADO,
      page: 1,
      limit: 20,
    };
    const response = { data: [], meta: { total: 0 } };
    service.findAll.mockResolvedValue(response);

    await expect(controller.findAll(query)).resolves.toBe(response);

    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it('findOne delega para BackupService.findOne', async () => {
    const response = { id_backup: 10 };
    service.findOne.mockResolvedValue(response);

    await expect(controller.findOne(10)).resolves.toBe(response);

    expect(service.findOne).toHaveBeenCalledWith(10);
  });

  it('restore delega para BackupService.restore', async () => {
    const dto = {
      confirmar_restauracao: true,
      nova_senha_mqtt: '123456',
    };
    const currentUser = makeCurrentUser();
    const response = { id_backup: 10, status_backup: statusbackup.RESTAURADO };
    service.restore.mockResolvedValue(response);

    await expect(controller.restore(10, dto, currentUser)).resolves.toBe(
      response,
    );

    expect(service.restore).toHaveBeenCalledWith(10, dto, currentUser);
  });

  it('mantem rota base e role ADMINISTRADOR no controller real', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BackupController)).toBe(
      'configuracoes/backup',
    );
    expect(Reflect.getMetadata(ROLES_KEY, BackupController)).toEqual([
      'ADMINISTRADOR',
    ]);
  });
});

function makeCurrentUser(): AuthenticatedUser {
  return {
    id_usuario: 1,
    login: 'admin',
    nome: 'Administrador',
    email: 'admin@local',
    nivel_acesso: {
      nome: 'ADMINISTRADOR',
    },
    primeiro_acesso: false,
  };
}
