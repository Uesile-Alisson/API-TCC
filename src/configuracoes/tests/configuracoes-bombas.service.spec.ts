import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { statusbomba, tipobomba } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesBombasService } from '../bombas/configuracoes-bombas.service';
import { asyncMock, makeBombaRecord } from './configuracoes-test-helpers';

type PrismaMock = {
  $transaction: ReturnType<typeof asyncMock>;
  bombas: {
    findMany: ReturnType<typeof asyncMock>;
    count: ReturnType<typeof asyncMock>;
    findUnique: ReturnType<typeof asyncMock>;
    create: ReturnType<typeof asyncMock>;
    update: ReturnType<typeof asyncMock>;
  };
  configuracoessistema: {
    findFirst: ReturnType<typeof asyncMock>;
  };
};

describe('ConfiguracoesBombasService', () => {
  let prisma: PrismaMock;
  let service: ConfiguracoesBombasService;

  beforeEach(() => {
    prisma = {
      $transaction: asyncMock(),
      bombas: {
        findMany: asyncMock(),
        count: asyncMock(),
        findUnique: asyncMock(),
        create: asyncMock(),
        update: asyncMock(),
      },
      configuracoessistema: {
        findFirst: asyncMock(),
      },
    };
    service = new ConfiguracoesBombasService(
      prisma as unknown as PrismaService,
    );
  });

  it('findAll retorna lista paginada', async () => {
    prisma.$transaction.mockResolvedValue([[makeBombaRecord()], 1]);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('findOne lanca NotFoundException quando bomba nao existe', async () => {
    prisma.bombas.findUnique.mockResolvedValue(null);

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rejeita duplicidade de nome', async () => {
    prisma.bombas.findUnique.mockResolvedValue({ id_bomba: 1 });

    await expect(
      service.create(
        {
          nome: 'Bomba Principal',
          tipo_bomba: tipobomba.PRINCIPAL,
          status_padrao: statusbomba.ATIVA,
        },
        { id_usuario: 7 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update rejeita PATCH vazio', async () => {
    prisma.bombas.findUnique.mockResolvedValue(makeBombaRecord());

    await expect(
      service.update(1, {}, { id_usuario: 7 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ativar e desativar atualizam status_padrao', async () => {
    prisma.bombas.findUnique.mockResolvedValue(makeBombaRecord());
    prisma.bombas.update.mockResolvedValue(makeBombaRecord());

    await service.ativar(1, { id_usuario: 7 });
    await service.desativar(1, { id_usuario: 7 });

    expect(prisma.bombas.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status_padrao: statusbomba.ATIVA,
          id_usuario_alteracao: 7,
        }),
      }),
    );
    expect(prisma.bombas.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status_padrao: statusbomba.INATIVA,
          id_usuario_alteracao: 7,
        }),
      }),
    );
  });
});
