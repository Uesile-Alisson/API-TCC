import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { statusgeralsistema } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesSistemaService } from '../sistema/configuracoes-sistema.service';
import { asyncMock, makeSistemaRecord } from './configuracoes-test-helpers';

type PrismaMock = {
  configuracoessistema: {
    findFirst: ReturnType<typeof asyncMock>;
    update: ReturnType<typeof asyncMock>;
  };
};

describe('ConfiguracoesSistemaService', () => {
  let prisma: PrismaMock;
  let service: ConfiguracoesSistemaService;

  beforeEach(() => {
    prisma = {
      configuracoessistema: {
        findFirst: asyncMock(),
        update: asyncMock(),
      },
    };
    service = new ConfiguracoesSistemaService(
      prisma as unknown as PrismaService,
    );
  });

  it('findCurrent retorna configuracao mapeada', async () => {
    prisma.configuracoessistema.findFirst.mockResolvedValue(
      makeSistemaRecord(),
    );

    const result = await service.findCurrent();

    expect(result.vacuo_padrao).toBe(-80.5);
    expect(result.limite_seguranca_vacuo).toBe(-95);
    expect(result.status_geral_sistema).toBe(statusgeralsistema.OPERACIONAL);
  });

  it('findCurrent lanca NotFoundException quando nao existe', async () => {
    prisma.configuracoessistema.findFirst.mockResolvedValue(null);

    await expect(service.findCurrent()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updateCurrent rejeita PATCH vazio sem consultar banco', async () => {
    await expect(
      service.updateCurrent({}, { id_usuario: 7 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.configuracoessistema.findFirst).not.toHaveBeenCalled();
  });

  it('updateCurrent atualiza campos permitidos e usa usuario autenticado', async () => {
    prisma.configuracoessistema.findFirst.mockResolvedValue(
      makeSistemaRecord(),
    );
    prisma.configuracoessistema.update.mockResolvedValue(
      makeSistemaRecord({
        id_usuario_alteracao: 7,
        tolerancia_vacuo_percentual: { toNumber: () => 12.5 },
      }),
    );

    const result = await service.updateCurrent(
      {
        tolerancia_vacuo_percentual: 12.5,
        status_geral_sistema: statusgeralsistema.ALERTA,
      },
      { id_usuario: 7 },
    );

    expect(prisma.configuracoessistema.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tolerancia_vacuo_percentual: 12.5,
          status_geral_sistema: statusgeralsistema.ALERTA,
          id_usuario_alteracao: 7,
        }),
      }),
    );
    expect(result.id_usuario_alteracao).toBe(7);
  });
});
