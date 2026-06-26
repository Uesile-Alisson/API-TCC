import { describe, expect, it, jest } from '@jest/globals';
import { statustanque } from '@prisma/client';
import { ConfiguracoesTanquesController } from '../tanques/configuracoes-tanques.controller';
import { ConfiguracoesTanquesService } from '../tanques/configuracoes-tanques.service';
import { expectConfiguracoesControllerSecurity } from './controller-metadata.helpers';

describe('ConfiguracoesTanquesController', () => {
  it('aplica JwtAuthGuard, RolesGuard e roles corretas', () => {
    expectConfiguracoesControllerSecurity(ConfiguracoesTanquesController, [
      'findAll',
      'findOne',
      'create',
      'update',
      'ativar',
      'desativar',
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
    };
    const controller = new ConfiguracoesTanquesController(
      service as unknown as ConfiguracoesTanquesService,
    );

    await controller.findAll({ page: 1, limit: 10 });
    await controller.findOne(1);
    await controller.create({
      nome: 'Tanque 01',
      volume: 1000,
      unidade_volume: 'L',
      vacuo_padrao: -80,
      status_tanque: statustanque.ATIVO,
    });
    await controller.update(1, { status_tanque: statustanque.INATIVO });
    await controller.ativar(1);
    await controller.desativar(1);

    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(service.findOne).toHaveBeenCalledWith(1);
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.update).toHaveBeenCalledWith(1, {
      status_tanque: statustanque.INATIVO,
    });
    expect(service.ativar).toHaveBeenCalledWith(1);
    expect(service.desativar).toHaveBeenCalledWith(1);
  });
});
