import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { origemalarme, severidadealarme } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { AlarmesController } from '../alarmes.controller';
import { AlarmesService } from '../alarmes.service';

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

type AlarmesServiceMock = {
  list: AsyncMock;
  getDashboard: AsyncMock;
  findActive: AsyncMock;
  findCritical: AsyncMock;
  findByProcess: AsyncMock;
  findActiveByProcess: AsyncMock;
  findCriticalByProcess: AsyncMock;
  findDetailsById: AsyncMock;
  resolve: AsyncMock;
};

describe('AlarmesController', () => {
  let controller: AlarmesController;
  let service: AlarmesServiceMock;

  beforeEach(() => {
    service = {
      list: asyncMock(),
      getDashboard: asyncMock(),
      findActive: asyncMock(),
      findCritical: asyncMock(),
      findByProcess: asyncMock(),
      findActiveByProcess: asyncMock(),
      findCriticalByProcess: asyncMock(),
      findDetailsById: asyncMock(),
      resolve: asyncMock(),
    };
    controller = new AlarmesController(service as unknown as AlarmesService);
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('list delega para service.list', async () => {
    const query = { page: 1, limit: 20 };
    const response = { data: [], meta: { total: 0 } };
    service.list.mockResolvedValue(response);

    await expect(controller.list(query)).resolves.toBe(response);

    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('getDashboard delega para service.getDashboard', async () => {
    const query = { severidade: severidadealarme.CRITICO };
    const response = { total: 0 };
    service.getDashboard.mockResolvedValue(response);

    await expect(controller.getDashboard(query)).resolves.toBe(response);

    expect(service.getDashboard).toHaveBeenCalledWith(query);
  });

  it('findActive delega para service.findActive', async () => {
    const query = { origem_alarme: origemalarme.BACKEND };

    await controller.findActive(query);

    expect(service.findActive).toHaveBeenCalledWith(query);
  });

  it('findCritical delega para service.findCritical', async () => {
    const query = { page: 2 };

    await controller.findCritical(query);

    expect(service.findCritical).toHaveBeenCalledWith(query);
  });

  it('findByProcess delega para service.findByProcess', async () => {
    const query = { limit: 5 };

    await controller.findByProcess(20, query);

    expect(service.findByProcess).toHaveBeenCalledWith(20, query);
  });

  it('findActiveByProcess delega para service.findActiveByProcess', async () => {
    const query = { limit: 5 };

    await controller.findActiveByProcess(20, query);

    expect(service.findActiveByProcess).toHaveBeenCalledWith(20, query);
  });

  it('findCriticalByProcess delega para service.findCriticalByProcess', async () => {
    const query = { limit: 5 };

    await controller.findCriticalByProcess(20, query);

    expect(service.findCriticalByProcess).toHaveBeenCalledWith(20, query);
  });

  it('findById delega para service.findDetailsById', async () => {
    await controller.findById(10);

    expect(service.findDetailsById).toHaveBeenCalledWith(10);
  });

  it('resolve delega para service.resolve', async () => {
    const dto = { observacao: 'Verificado em campo.' };
    const currentUser = {
      id_usuario: 7,
      login: 'tecnico',
      nivel_acesso: 'TECNICO',
    };

    await controller.resolve(10, dto, currentUser);

    expect(service.resolve).toHaveBeenCalledWith(10, dto, currentUser);
  });
});
