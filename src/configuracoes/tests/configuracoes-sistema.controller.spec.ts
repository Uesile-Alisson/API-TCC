import { describe, expect, it, jest } from '@jest/globals';
import { statusgeralsistema } from '@prisma/client';
import { ConfiguracoesSistemaController } from '../sistema/configuracoes-sistema.controller';
import { ConfiguracoesSistemaService } from '../sistema/configuracoes-sistema.service';
import { expectConfiguracoesControllerSecurity } from './controller-metadata.helpers';

const currentUser = {
  id_usuario: 7,
  login: 'tecnico',
  nome: 'Tecnico',
  email: 'tecnico@teste.com',
  nivel_acesso: { nome: 'TECNICO' as const },
  primeiro_acesso: false,
};

describe('ConfiguracoesSistemaController', () => {
  it('aplica JwtAuthGuard, RolesGuard e roles corretas', () => {
    expectConfiguracoesControllerSecurity(ConfiguracoesSistemaController, [
      'findCurrent',
      'updateCurrent',
    ]);
  });

  it('GET chama service.findCurrent', async () => {
    const service = {
      findCurrent: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({}),
      updateCurrent: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    };
    const controller = new ConfiguracoesSistemaController(
      service as unknown as ConfiguracoesSistemaService,
    );

    await controller.findCurrent();

    expect(service.findCurrent).toHaveBeenCalledTimes(1);
  });

  it('PATCH chama service.updateCurrent com usuario autenticado', async () => {
    const service = {
      findCurrent: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateCurrent: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({}),
    };
    const controller = new ConfiguracoesSistemaController(
      service as unknown as ConfiguracoesSistemaService,
    );

    await controller.updateCurrent(
      { status_geral_sistema: statusgeralsistema.ALERTA },
      currentUser,
    );

    expect(service.updateCurrent).toHaveBeenCalledWith(
      { status_geral_sistema: statusgeralsistema.ALERTA },
      { id_usuario: 7 },
    );
  });
});
