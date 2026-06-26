import { describe, expect, it, jest } from '@jest/globals';
import { protocolosensor, statussensor } from '@prisma/client';
import { ConfiguracoesSensoresController } from '../sensores/configuracoes-sensores.controller';
import { ConfiguracoesSensoresService } from '../sensores/configuracoes-sensores.service';
import { expectConfiguracoesControllerSecurity } from './controller-metadata.helpers';

describe('ConfiguracoesSensoresController', () => {
  it('aplica JwtAuthGuard, RolesGuard e roles corretas', () => {
    expectConfiguracoesControllerSecurity(ConfiguracoesSensoresController, [
      'findAll',
      'findOne',
      'create',
      'update',
      'ativar',
      'desativar',
      'findSensoresByTanque',
    ]);
  });

  it('encaminha chamadas para o service', async () => {
    const service = {
      findAll: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({}),
      findOne: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({}),
      create: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({}),
      update: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({}),
      ativar: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({}),
      desativar: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({}),
      findSensoresByTanque: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({}),
    };
    const controller = new ConfiguracoesSensoresController(
      service as unknown as ConfiguracoesSensoresService,
    );

    await controller.findAll({ page: 1, limit: 10 });
    await controller.findOne(1);
    await controller.create({
      nome: 'Sensor Vacuo 01',
      modelo: 'MPX5700',
      protocolo: protocolosensor.I2C,
      unidade_medida: 'kPa',
      status_sensor: statussensor.ATIVO,
    });
    await controller.update(1, { status_sensor: statussensor.INATIVO });
    await controller.ativar(1);
    await controller.desativar(1);
    await controller.findSensoresByTanque(5, {});

    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(service.findOne).toHaveBeenCalledWith(1);
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.update).toHaveBeenCalledWith(1, {
      status_sensor: statussensor.INATIVO,
    });
    expect(service.ativar).toHaveBeenCalledWith(1);
    expect(service.desativar).toHaveBeenCalledWith(1);
    expect(service.findSensoresByTanque).toHaveBeenCalledWith(5, {});
  });
});
