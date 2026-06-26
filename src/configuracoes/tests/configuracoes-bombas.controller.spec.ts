import { describe, expect, it, jest } from '@jest/globals';
import { statusbomba, tipobomba } from '@prisma/client';
import { ConfiguracoesBombasController } from '../bombas/configuracoes-bombas.controller';
import { ConfiguracoesBombasService } from '../bombas/configuracoes-bombas.service';
import { expectConfiguracoesControllerSecurity } from './controller-metadata.helpers';

const currentUser = {
  id_usuario: 7,
  login: 'tecnico',
  nome: 'Tecnico',
  email: 'tecnico@teste.com',
  nivel_acesso: { nome: 'TECNICO' as const },
  primeiro_acesso: false,
};

describe('ConfiguracoesBombasController', () => {
  it('aplica JwtAuthGuard, RolesGuard e roles corretas', () => {
    expectConfiguracoesControllerSecurity(ConfiguracoesBombasController, [
      'findAll',
      'findOne',
      'create',
      'update',
      'ativar',
      'desativar',
    ]);
  });

  it('encaminha chamadas para o service com usuario autenticado', async () => {
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
    const controller = new ConfiguracoesBombasController(
      service as unknown as ConfiguracoesBombasService,
    );
    await controller.findAll({ page: 1, limit: 10 });
    await controller.findOne(1);
    await controller.create(
      {
        nome: 'Bomba Principal',
        tipo_bomba: tipobomba.PRINCIPAL,
        status_padrao: statusbomba.ATIVA,
      },
      currentUser,
    );
    await controller.update(
      1,
      { status_padrao: statusbomba.INATIVA },
      currentUser,
    );
    await controller.ativar(1, currentUser);
    await controller.desativar(1, currentUser);

    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    expect(service.findOne).toHaveBeenCalledWith(1);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Bomba Principal' }),
      { id_usuario: 7 },
    );
    expect(service.update).toHaveBeenCalledWith(
      1,
      { status_padrao: statusbomba.INATIVA },
      { id_usuario: 7 },
    );
    expect(service.ativar).toHaveBeenCalledWith(1, { id_usuario: 7 });
    expect(service.desativar).toHaveBeenCalledWith(1, { id_usuario: 7 });
  });
});
