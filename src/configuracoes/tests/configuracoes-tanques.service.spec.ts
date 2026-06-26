import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { statustanque } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesTanquesService } from '../tanques/configuracoes-tanques.service';
import { asyncMock, makeTanqueRecord } from './configuracoes-test-helpers';

type PrismaMock = {
  $transaction: ReturnType<typeof asyncMock>;
  tanques: {
    findMany: ReturnType<typeof asyncMock>;
    count: ReturnType<typeof asyncMock>;
    findUnique: ReturnType<typeof asyncMock>;
    create: ReturnType<typeof asyncMock>;
    update: ReturnType<typeof asyncMock>;
  };
};

describe('ConfiguracoesTanquesService', () => {
  let prisma: PrismaMock;
  let service: ConfiguracoesTanquesService;

  beforeEach(() => {
    prisma = {
      $transaction: asyncMock(),
      tanques: {
        findMany: asyncMock(),
        count: asyncMock(),
        findUnique: asyncMock(),
        create: asyncMock(),
        update: asyncMock(),
      },
    };
    service = new ConfiguracoesTanquesService(
      prisma as unknown as PrismaService,
    );
  });

  it('findAll retorna lista paginada', async () => {
    prisma.$transaction.mockResolvedValue([[makeTanqueRecord()], 1]);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      total_pages: 1,
    });
  });

  it('findOne lanca NotFoundException quando tanque nao existe', async () => {
    prisma.tanques.findUnique.mockResolvedValue(null);

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rejeita duplicidade de nome', async () => {
    prisma.tanques.findUnique.mockResolvedValue({ id_tanque: 1 });

    await expect(
      service.create({
        nome: 'Tanque 01',
        volume: 1000,
        unidade_volume: 'L',
        vacuo_padrao: -80,
        status_tanque: statustanque.ATIVO,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update rejeita PATCH vazio', async () => {
    prisma.tanques.findUnique.mockResolvedValue(makeTanqueRecord());

    await expect(service.update(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('ativar e desativar atualizam status_tanque', async () => {
    prisma.tanques.findUnique.mockResolvedValue(makeTanqueRecord());
    prisma.tanques.update.mockResolvedValue(makeTanqueRecord());

    await service.ativar(1);
    await service.desativar(1);

    expect(prisma.tanques.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status_tanque: statustanque.ATIVO }),
      }),
    );
    expect(prisma.tanques.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ status_tanque: statustanque.INATIVO }),
      }),
    );
  });
});
