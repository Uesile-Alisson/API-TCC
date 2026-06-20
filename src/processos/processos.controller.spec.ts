import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { nivelacesso } from '@prisma/client';
import { ProcessosController } from './processos.controller';
import { ProcessosService } from './processos.service';

type ProcessosServiceMock = {
  create: jest.Mock;
  list: jest.Mock;
  findActive: jest.Mock;
  findById: jest.Mock;
  getDashboard: jest.Mock;
  updateConfig: jest.Mock;
  start: jest.Mock;
  pause: jest.Mock;
  resume: jest.Mock;
  finish: jest.Mock;
  interrupt: jest.Mock;
  emergencyStop: jest.Mock;
};

describe('ProcessosController', () => {
  let controller: ProcessosController;
  let service: ProcessosServiceMock;

  const user = {
    id_usuario: 7,
    login: 'tecnico',
    id_nivel_acesso: 2,
    nivel_acesso: {
      nome: nivelacesso.TECNICO,
    },
  };

  beforeEach(() => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      findActive: jest.fn(),
      findById: jest.fn(),
      getDashboard: jest.fn(),
      updateConfig: jest.fn(),
      start: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      finish: jest.fn(),
      interrupt: jest.fn(),
      emergencyStop: jest.fn(),
    };
    controller = new ProcessosController(
      service as unknown as ProcessosService,
    );
  });

  it('controller definido', () => {
    expect(controller).toBeDefined();
  });

  it('create chama service.create', async () => {
    const dto = {
      tempo_maximo: 60,
      vacuo_alvo: -80,
      tanques: [
        {
          id_tanque: 1,
          sensores: [{ id_sensor: 1 }],
        },
      ],
    };

    await controller.create(dto, user);

    expect(service.create).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({
        sub: 7,
        nivel_acesso: nivelacesso.TECNICO,
      }),
    );
  });

  it('list chama service.list', async () => {
    const query = { page: 1, limit: 10 };

    await controller.list(query);

    expect(service.list).toHaveBeenCalledWith(query);
  });

  it('findActive chama service.findActive', async () => {
    await controller.findActive();

    expect(service.findActive).toHaveBeenCalledWith();
  });

  it('findById chama service.findById', async () => {
    await controller.findById(10);

    expect(service.findById).toHaveBeenCalledWith(10);
  });

  it('getDashboard chama service.getDashboard', async () => {
    await controller.getDashboard(10);

    expect(service.getDashboard).toHaveBeenCalledWith(10);
  });

  it('updateConfig chama service.updateConfig', async () => {
    const dto = { tempo_maximo: 120 };

    await controller.updateConfig(10, dto, user);

    expect(service.updateConfig).toHaveBeenCalledWith(
      10,
      dto,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('start chama service.start', async () => {
    await controller.start(10, user);

    expect(service.start).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('pause chama service.pause', async () => {
    await controller.pause(10, user);

    expect(service.pause).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('resume chama service.resume', async () => {
    await controller.resume(10, user);

    expect(service.resume).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('finish chama service.finish', async () => {
    const dto = { observacao: 'Processo finalizado sem falhas.' };

    await controller.finish(10, dto, user);

    expect(service.finish).toHaveBeenCalledWith(
      10,
      dto,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('interrupt chama service.interrupt', async () => {
    const dto = { motivo: 'Interrupcao operacional.' };

    await controller.interrupt(10, dto, user);

    expect(service.interrupt).toHaveBeenCalledWith(
      10,
      dto,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });

  it('emergencyStop chama service.emergencyStop', async () => {
    const dto = { motivo: 'Falha critica' };

    await controller.emergencyStop(10, dto, user);

    expect(service.emergencyStop).toHaveBeenCalledWith(
      10,
      dto,
      expect.objectContaining({
        sub: 7,
      }),
    );
  });
});
