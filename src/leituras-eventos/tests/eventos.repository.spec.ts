import {
  origemevento,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EventosRepository } from '../repositories';
import type { EventoListRecord } from '../repositories';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
  afterEach,
} from '@jest/globals';

type PrismaEventosMock = {
  eventos: {
    findMany: jest.Mock<(args?: unknown) => Promise<unknown>>;
    count: jest.Mock<(args?: unknown) => Promise<unknown>>;
    findUnique: jest.Mock<(args?: unknown) => Promise<unknown>>;
    findFirst: jest.Mock<(args?: unknown) => Promise<unknown>>;
  };
};

describe('EventosRepository', () => {
  let repository: EventosRepository;
  let prisma: PrismaEventosMock;

  beforeEach(() => {
    prisma = {
      eventos: {
        findMany: jest
          .fn<(args?: unknown) => Promise<unknown>>()
          .mockResolvedValue([buildEventoRecord()]),
        count: jest
          .fn<(args?: unknown) => Promise<unknown>>()
          .mockResolvedValue(1),
        findUnique: jest
          .fn<(args?: unknown) => Promise<unknown>>()
          .mockResolvedValue(buildEventoRecord()),
        findFirst: jest
          .fn<(args?: unknown) => Promise<unknown>>()
          .mockResolvedValue({ ocorrido_em: new Date('2026-01-01T10:00:00Z') }),
      },
    };
    repository = new EventosRepository(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deve estar definido', () => {
    expect(repository).toBeDefined();
  });

  it('deve listar com paginacao e ordenacao default', async () => {
    await repository.list({ page: 2, limit: 10 });

    expect(prisma.eventos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: { ocorrido_em: 'desc' },
      }),
    );
  });

  it('deve filtrar por id_processo', async () => {
    await repository.list({ id_processo: 9 });

    expect(firstCallArg(prisma.eventos.findMany).where).toEqual(
      expect.objectContaining({ id_processo: 9 }),
    );
  });

  it('deve filtrar por id_processo_tanque_sensor', async () => {
    await repository.list({ id_processo_tanque_sensor: 7 });

    expect(firstCallArg(prisma.eventos.findMany).where).toEqual(
      expect.objectContaining({ id_processo_tanque_sensor: 7 }),
    );
  });

  it('deve filtrar por tipo, origem e severidade', async () => {
    await repository.list({
      tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
      origem_evento: origemevento.SISTEMA,
      severidade_evento: severidadeevento.CRITICO,
    });

    expect(firstCallArg(prisma.eventos.findMany).where).toEqual(
      expect.objectContaining({
        tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
        origem_evento: origemevento.SISTEMA,
        severidade_evento: severidadeevento.CRITICO,
      }),
    );
  });

  it('deve filtrar por periodo de ocorrencia', async () => {
    const ocorrido_de = new Date('2026-01-01T10:00:00Z');
    const ocorrido_ate = new Date('2026-01-01T11:00:00Z');

    await repository.list({ ocorrido_de, ocorrido_ate });

    expect(firstCallArg(prisma.eventos.findMany).where).toEqual(
      expect.objectContaining({
        ocorrido_em: { gte: ocorrido_de, lte: ocorrido_ate },
      }),
    );
  });

  it('deve contar com mesmo where', async () => {
    await repository.count({ id_processo: 9 });

    expect(prisma.eventos.count).toHaveBeenCalledWith({
      where: { id_processo: 9 },
    });
  });

  it('deve listar e contar', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([buildEventoRecord()]);
    const countSpy = jest.spyOn(repository, 'count').mockResolvedValue(2);

    const result = await repository.listAndCount({ page: 2, limit: 10 });

    expect(listSpy).toHaveBeenCalledWith({ page: 2, limit: 10 });
    expect(countSpy).toHaveBeenCalledWith({ page: 2, limit: 10 });
    expect(result).toEqual({
      data: [buildEventoRecord()],
      total: 2,
      page: 2,
      limit: 10,
    });
  });

  it('deve buscar por id e permitir null', async () => {
    await repository.findById(1);

    expect(prisma.eventos.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_evento_processo: 1 },
      }),
    );

    prisma.eventos.findUnique.mockResolvedValueOnce(null);
    await expect(repository.findById(99)).resolves.toBeNull();
  });

  it('deve buscar detalhes com relacoes resumidas e sem dados sensiveis', async () => {
    await repository.findDetailsById(1);

    const call = firstCallArg(prisma.eventos.findUnique);
    const selected = JSON.stringify(call.select);
    expect(call.where).toEqual({ id_evento_processo: 1 });
    expect(selected).toContain('processostanquessensores');
    expect(selected).not.toContain('senha');
    expect(selected).not.toContain('token');
  });

  it('deve delegar findByProcess para list', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([buildEventoRecord()]);

    await repository.findByProcess(9, { limit: 5 });

    expect(listSpy).toHaveBeenCalledWith({ limit: 5, id_processo: 9 });
  });

  it('deve delegar findByProcessTanqueSensor para list', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([buildEventoRecord()]);

    await repository.findByProcessTanqueSensor(7, { limit: 5 });

    expect(listSpy).toHaveBeenCalledWith({
      limit: 5,
      id_processo_tanque_sensor: 7,
    });
  });

  it('deve calcular estatisticas de eventos por processo', async () => {
    prisma.eventos.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5);
    prisma.eventos.findFirst
      .mockResolvedValueOnce({ ocorrido_em: new Date('2026-01-01T09:00:00Z') })
      .mockResolvedValueOnce({ ocorrido_em: new Date('2026-01-01T11:00:00Z') });

    const result = await repository.getEventStatsByProcess(9);

    expect(result).toEqual({
      total_eventos: 10,
      eventos_criticos: 2,
      eventos_medios: 3,
      eventos_info: 5,
      primeiro_evento_em: new Date('2026-01-01T09:00:00Z'),
      ultimo_evento_em: new Date('2026-01-01T11:00:00Z'),
    });
    expect(prisma.eventos.count).toHaveBeenNthCalledWith(2, {
      where: {
        id_processo: 9,
        severidade_evento: severidadeevento.CRITICO,
      },
    });
    expect(prisma.eventos.count).toHaveBeenNthCalledWith(3, {
      where: {
        id_processo: 9,
        severidade_evento: severidadeevento.AVISO,
      },
    });
  });

  it('deve buscar eventos minimos para timeline', async () => {
    await repository.findTimelineEventsByProcess(9, { limit: 5 });

    expect(prisma.eventos.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_processo: 9 },
        orderBy: { ocorrido_em: 'asc' },
        take: 5,
      }),
    );
    expect(
      JSON.stringify(firstCallArg(prisma.eventos.findMany).select),
    ).toContain('ocorrido_em');
  });
});

function firstCallArg(mock: jest.Mock): Record<string, unknown> {
  return mock.mock.calls[0][0] as Record<string, unknown>;
}

function buildEventoRecord(): EventoListRecord {
  return {
    id_evento_processo: 1,
    id_processo: 9,
    id_processo_tanque_sensor: 2,
    tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
    origem_evento: origemevento.SISTEMA,
    severidade_evento: severidadeevento.INFO,
    ocorrido_em: new Date('2026-01-01T10:00:00Z'),
    processos: {
      id_processo: 9,
      nome_processo: 'Processo 9',
      status_processo: 'EM_EXECUCAO',
    },
    processostanquessensores: {
      id_processo_tanque_sensor: 2,
      id_processo_tanque: 4,
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
        tanques: {
          id_tanque: 5,
          nome: 'Tanque 5',
        },
      },
    },
  } as unknown as EventoListRecord;
}
