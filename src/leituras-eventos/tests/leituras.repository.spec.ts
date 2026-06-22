import { tipoleiturasensor } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GRAFICO_VACUO_DEFAULT_LIMIT } from '../constants';
import { LeiturasRepository } from '../repositories';
import type { LeituraListRecord } from '../repositories';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
  afterEach,
} from '@jest/globals';

type PrismaLeiturasMock = {
  leiturasensores: {
    findMany: jest.Mock<(args?: unknown) => Promise<unknown>>;
    count: jest.Mock<(args?: unknown) => Promise<unknown>>;
    findUnique: jest.Mock<(args?: unknown) => Promise<unknown>>;
  };
};

describe('LeiturasRepository', () => {
  let repository: LeiturasRepository;
  let prisma: PrismaLeiturasMock;

  beforeEach(() => {
    prisma = {
      leiturasensores: {
        findMany: jest
          .fn<(args?: unknown) => Promise<unknown>>()
          .mockResolvedValue([buildLeituraRecord()]),
        count: jest
          .fn<(args?: unknown) => Promise<unknown>>()
          .mockResolvedValue(1),
        findUnique: jest
          .fn<(args?: unknown) => Promise<unknown>>()
          .mockResolvedValue(buildLeituraRecord()),
      },
    };
    repository = new LeiturasRepository(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve estar definido', () => {
    expect(repository).toBeDefined();
  });

  it('deve listar com paginacao e ordenacao default', async () => {
    await repository.list({ page: 2, limit: 10 });

    expect(prisma.leiturasensores.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: { leitura_em: 'desc' },
        where: expect.objectContaining({
          tipo_leitura: tipoleiturasensor.VACUO,
        }),
      }),
    );
  });

  it('deve filtrar por processo via relacionamento aninhado', async () => {
    await repository.list({ id_processo: 9 });

    const call = firstCallArg(prisma.leiturasensores.findMany);
    expect(call.where).toEqual(
      expect.objectContaining({
        processostanquessensores: {
          processostanques: {
            id_processo: 9,
          },
        },
      }),
    );
    expect(call.where).not.toHaveProperty('id_processo');
  });

  it('deve filtrar por processo_tanque via relacionamento aninhado', async () => {
    await repository.list({ id_processo_tanque: 4 });

    const call = firstCallArg(prisma.leiturasensores.findMany);
    expect(call.where).toEqual(
      expect.objectContaining({
        processostanquessensores: {
          processostanques: {
            id_processo_tanque: 4,
          },
        },
      }),
    );
  });

  it('deve filtrar por processo_tanque_sensor direto', async () => {
    await repository.list({ id_processo_tanque_sensor: 7 });

    const call = firstCallArg(prisma.leiturasensores.findMany);
    expect(call.where).toEqual(
      expect.objectContaining({
        id_processo_tanque_sensor: 7,
      }),
    );
  });

  it('deve filtrar por periodo de leitura', async () => {
    const leitura_de = new Date('2026-01-01T10:00:00Z');
    const leitura_ate = new Date('2026-01-01T11:00:00Z');

    await repository.list({ leitura_de, leitura_ate });

    const call = firstCallArg(prisma.leiturasensores.findMany);
    expect(call.where).toEqual(
      expect.objectContaining({
        leitura_em: { gte: leitura_de, lte: leitura_ate },
      }),
    );
  });

  it('deve filtrar por periodo de recebimento', async () => {
    const recebido_de = new Date('2026-01-01T10:00:00Z');
    const recebido_ate = new Date('2026-01-01T11:00:00Z');

    await repository.list({ recebido_de, recebido_ate });

    const call = firstCallArg(prisma.leiturasensores.findMany);
    expect(call.where).toEqual(
      expect.objectContaining({
        recebido_em: { gte: recebido_de, lte: recebido_ate },
      }),
    );
  });

  it('deve filtrar por range de valor de vacuo', async () => {
    await repository.list({ valor_minimo: 5, valor_maximo: 12 });

    const call = firstCallArg(prisma.leiturasensores.findMany);
    expect(call.where).toEqual(
      expect.objectContaining({
        valor_vacuo: { gte: 5, lte: 12 },
      }),
    );
  });

  it('deve contar com mesmo where', async () => {
    await repository.count({ id_processo_tanque_sensor: 7 });

    expect(prisma.leiturasensores.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tipo_leitura: tipoleiturasensor.VACUO,
        id_processo_tanque_sensor: 7,
      }),
    });
  });

  it('deve listar e contar', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([buildLeituraRecord()]);
    const countSpy = jest.spyOn(repository, 'count').mockResolvedValue(2);

    const result = await repository.listAndCount({ page: 2, limit: 10 });

    expect(listSpy).toHaveBeenCalledWith({ page: 2, limit: 10 });
    expect(countSpy).toHaveBeenCalledWith({ page: 2, limit: 10 });
    expect(result).toEqual({
      data: [buildLeituraRecord()],
      total: 2,
      page: 2,
      limit: 10,
    });
  });

  it('deve buscar por id e permitir null', async () => {
    await repository.findById(1);
    expect(prisma.leiturasensores.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_leitura_sensor: 1 },
      }),
    );

    prisma.leiturasensores.findUnique.mockResolvedValueOnce(null);
    await expect(repository.findById(99)).resolves.toBeNull();
  });

  it('deve buscar detalhes com relacoes resumidas e sem dados sensiveis', async () => {
    await repository.findDetailsById(1);

    const call = firstCallArg(prisma.leiturasensores.findUnique);
    const selected = JSON.stringify(call.select);
    expect(call.where).toEqual({ id_leitura_sensor: 1 });
    expect(selected).toContain('processostanquessensores');
    expect(selected).not.toContain('senha');
    expect(selected).not.toContain('token');
  });

  it('deve delegar findByProcess para list', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([buildLeituraRecord()]);

    await repository.findByProcess(9, { limit: 5 });

    expect(listSpy).toHaveBeenCalledWith({ limit: 5, id_processo: 9 });
  });

  it('deve delegar findByProcessTanqueSensor para list', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([buildLeituraRecord()]);

    await repository.findByProcessTanqueSensor(7, { limit: 5 });

    expect(listSpy).toHaveBeenCalledWith({
      limit: 5,
      id_processo_tanque_sensor: 7,
    });
  });

  it('deve buscar dados de grafico por processo', async () => {
    await repository.findChartDataByProcess(9, { limit: 50 });

    expect(prisma.leiturasensores.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          processostanquessensores: {
            processostanques: {
              id_processo: 9,
            },
          },
        }),
        orderBy: { leitura_em: 'asc' },
        take: 50,
      }),
    );
  });

  it('deve buscar dados de grafico por processo_tanque_sensor', async () => {
    await repository.findChartDataByProcessTanqueSensor(7, {});

    expect(prisma.leiturasensores.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id_processo_tanque_sensor: 7,
        }),
        orderBy: { leitura_em: 'asc' },
        take: GRAFICO_VACUO_DEFAULT_LIMIT,
      }),
    );
  });

  it('deve buscar campos minimos para analytics', async () => {
    await repository.getStatsByProcess(9);

    const call = firstCallArg(prisma.leiturasensores.findMany);
    expect(call.where).toEqual(
      expect.objectContaining({
        processostanquessensores: {
          processostanques: {
            id_processo: 9,
          },
        },
      }),
    );
    expect(JSON.stringify(call.select)).toContain('valor_vacuo');
    expect(JSON.stringify(call.select)).not.toContain('avg');
  });
});

function firstCallArg(mock: jest.Mock): Record<string, unknown> {
  return mock.mock.calls[0][0] as Record<string, unknown>;
}

function buildLeituraRecord(): LeituraListRecord {
  return {
    id_leitura_sensor: 1,
    id_processo_tanque_sensor: 2,
    valor_vacuo: 10,
    leitura_em: new Date('2026-01-01T10:00:00Z'),
    recebido_em: new Date('2026-01-01T10:00:02Z'),
    unidade_medida: 'kPa',
    processostanquessensores: {
      id_processo_tanque_sensor: 2,
      id_sensor: 3,
      sensores: {
        id_sensor: 3,
        nome: 'Sensor 3',
        modelo: 'VX',
        unidade_medida: 'kPa',
        status_sensor: 'ATIVO',
      },
      processostanques: {
        id_processo_tanque: 4,
        id_tanque: 5,
        status_tanque_processo: 'EM_EXECUCAO',
        processos: {
          id_processo: 9,
          nome_processo: 'Processo 9',
          status_processo: 'EM_EXECUCAO',
        },
        tanques: {
          id_tanque: 5,
          nome: 'Tanque 5',
        },
      },
    },
  } as unknown as LeituraListRecord;
}
