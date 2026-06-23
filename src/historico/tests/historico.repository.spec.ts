import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { statusprocesso, statustanqueprocesso } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { HISTORICO_PROCESS_STATUS } from '../constants';
import { HistoricoRepository } from '../repositories';

type AsyncMock<T = unknown> = Mock<(...args: unknown[]) => Promise<T>>;
type TransactionOperation = Promise<unknown>;
type TransactionMock = Mock<
  (operations: TransactionOperation[]) => Promise<unknown[]>
>;

type PrismaMock = {
  processos: {
    findMany: AsyncMock;
    count: AsyncMock;
    findFirst: AsyncMock;
  };
  processostanques: {
    findMany: AsyncMock;
  };
  alarmes: {
    findMany: AsyncMock;
    count: AsyncMock;
  };
  eventos: {
    findMany: AsyncMock;
    count: AsyncMock;
  };
  relatorios: {
    findMany: AsyncMock;
  };
  leiturasensores: {
    findMany: AsyncMock;
  };
  $transaction: TransactionMock;
};

type QueryArgs = {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  skip?: number;
  take?: number;
  select?: Record<string, unknown>;
};

const asyncMock = <T = unknown>(): AsyncMock<T> =>
  jest.fn<(...args: unknown[]) => Promise<T>>();

describe('HistoricoRepository', () => {
  let repository: HistoricoRepository;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      processos: {
        findMany: asyncMock().mockResolvedValue([makeProcessRecord()]),
        count: asyncMock().mockResolvedValue(1),
        findFirst: asyncMock().mockResolvedValue(makeProcessRecord()),
      },
      processostanques: {
        findMany: asyncMock().mockResolvedValue([makeTankRecord()]),
      },
      alarmes: {
        findMany: asyncMock().mockResolvedValue([]),
        count: asyncMock().mockResolvedValue(1),
      },
      eventos: {
        findMany: asyncMock().mockResolvedValue([makeEventRecord()]),
        count: asyncMock().mockResolvedValue(1),
      },
      relatorios: {
        findMany: asyncMock().mockResolvedValue([makeReportRecord()]),
      },
      leiturasensores: {
        findMany: asyncMock().mockResolvedValue([]),
      },
      $transaction: jest.fn((operations: TransactionOperation[]) =>
        Promise.all(operations),
      ),
    };

    repository = new HistoricoRepository(prisma as unknown as PrismaService);
  });

  it('findHistoricalProcesses monta filtros historicos, paginacao e select seguro', async () => {
    await repository.findHistoricalProcesses({ page: 2, limit: 5 });

    expect(prisma.processos.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.processos.count).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const args = firstProcessFindManyArg();
    expect(args.where).toEqual({
      status_processo: { in: [...HISTORICO_PROCESS_STATUS] },
    });
    expect(args.skip).toBe(5);
    expect(args.take).toBe(5);
    expect(args.orderBy).toEqual({ finalizado_em: 'desc' });
    const selected = JSON.stringify(args.select);
    expect(selected).toContain('usuarios');
    expect(selected).toContain('id_usuario');
    expect(selected).toContain('nome');
    expect(selected).not.toContain('login');
    expect(selected).not.toContain('email');
    expect(selected).not.toContain('senha_hash');
  });

  it('findHistoricalProcesses aplica filtro por id_tanque via processostanques', async () => {
    await repository.findHistoricalProcesses({ id_tanque: 3 });

    expect(firstProcessFindManyArg().where).toMatchObject({
      processostanques: {
        some: {
          id_tanque: 3,
        },
      },
    });
  });

  it('findHistoricalProcesses aplica filtro por id_sensor via processostanquessensores', async () => {
    await repository.findHistoricalProcesses({ id_sensor: 8 });

    expect(firstProcessFindManyArg().where).toMatchObject({
      processostanques: {
        some: {
          processostanquessensores: {
            some: {
              id_sensor: 8,
            },
          },
        },
      },
    });
  });

  it('findHistoricalProcessById busca somente processo historico e permite null', async () => {
    await repository.findHistoricalProcessById(10);

    expect(prisma.processos.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_processo: 10,
          status_processo: { in: [...HISTORICO_PROCESS_STATUS] },
        },
      }),
    );

    prisma.processos.findFirst.mockResolvedValueOnce(null);
    await expect(repository.findHistoricalProcessById(99)).resolves.toBeNull();
  });

  it('findProcessTanks seleciona tanque seguro sem sensores ou leituras crus', async () => {
    prisma.leiturasensores.findMany.mockResolvedValueOnce([]);
    prisma.alarmes.findMany.mockResolvedValueOnce([]);

    await repository.findProcessTanks(10);

    const args = firstTankFindManyArg();
    expect(args.where).toEqual({ id_processo: 10 });
    const selected = JSON.stringify(args.select);
    expect(selected).toContain('tanques');
    expect(selected).not.toContain('"sensores":');
    expect(selected).not.toContain('"leiturasensores":');
  });

  it('findProcessAlarms monta OR por processo, tanque e sensor sem payload MQTT', async () => {
    await repository.findProcessAlarms(10, { page: 1, limit: 10 });

    const args = firstAlarmFindManyArg();
    expect(args.where).toMatchObject({
      excluido_em: null,
      OR: [
        { id_processo: 10 },
        { processostanques: { id_processo: 10 } },
        {
          processostanquessensores: {
            processostanques: { id_processo: 10 },
          },
        },
      ],
    });
    expect(args.skip).toBe(0);
    expect(args.take).toBe(10);
    expect(JSON.stringify(args.select)).not.toContain('payload');
    expect(JSON.stringify(args.select)).not.toContain('mqtt');
  });

  it('findProcessEvents consulta eventos por id_processo', async () => {
    await repository.findProcessEvents(10, { page: 2, limit: 5 });

    const args = firstEventFindManyArg();
    expect(args.where).toEqual({ id_processo: 10 });
    expect(args.skip).toBe(5);
    expect(args.take).toBe(5);
  });

  it('findProcessReportsMetadata seleciona apenas metadados de relatorio', async () => {
    await repository.findProcessReportsMetadata(10);

    const args = firstReportFindManyArg();
    expect(args.where).toMatchObject({ id_processo: 10 });
    const selected = JSON.stringify(args.select);
    expect(selected).toContain('nome_arquivo');
    expect(selected).toContain('tamanho_bytes');
    expect(selected).not.toContain('hash_arquivo');
    expect(selected).not.toContain('download');
    expect(selected).not.toContain('preview');
    expect(selected).not.toContain('base64');
    expect(selected).not.toContain('buffer');
  });

  it('findVacuumReadingsByProcess filtra leituras pelo relacionamento e nao por id_processo direto', async () => {
    await repository.findVacuumReadingsByProcess(10, {
      id_tanque: 2,
      id_sensor: 3,
      limite_pontos: 50,
    });

    const args = firstReadingFindManyArg();
    expect(args.where).toEqual(
      expect.objectContaining({
        processostanquessensores: {
          id_sensor: 3,
          processostanques: {
            id_processo: 10,
            id_tanque: 2,
          },
        },
      }),
    );
    expect(args.where).not.toHaveProperty('id_processo');
    expect(args.take).toBe(50);
  });

  it('existsHistoricalProcess retorna boolean', async () => {
    prisma.processos.findFirst.mockResolvedValueOnce({ id_processo: 10 });
    await expect(repository.existsHistoricalProcess(10)).resolves.toBe(true);

    prisma.processos.findFirst.mockResolvedValueOnce(null);
    await expect(repository.existsHistoricalProcess(99)).resolves.toBe(false);
  });

  function firstProcessFindManyArg(): QueryArgs {
    return prisma.processos.findMany.mock.calls[0][0] as QueryArgs;
  }

  function firstTankFindManyArg(): QueryArgs {
    return prisma.processostanques.findMany.mock.calls[0][0] as QueryArgs;
  }

  function firstAlarmFindManyArg(): QueryArgs {
    return prisma.alarmes.findMany.mock.calls[0][0] as QueryArgs;
  }

  function firstEventFindManyArg(): QueryArgs {
    return prisma.eventos.findMany.mock.calls[0][0] as QueryArgs;
  }

  function firstReportFindManyArg(): QueryArgs {
    return prisma.relatorios.findMany.mock.calls[0][0] as QueryArgs;
  }

  function firstReadingFindManyArg(): QueryArgs {
    return prisma.leiturasensores.findMany.mock.calls[0][0] as QueryArgs;
  }
});

function makeProcessRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_processo: 10,
    nome_processo: 'Processo',
    status_processo: statusprocesso.CONCLUIDO,
    vacuo_alvo: '12',
    vacuo_inicial: '0',
    vacuo_final: '11',
    vacuo_medio: '10',
    eficiencia: '95',
    tempo_maximo: 120,
    tempo_execucao: 100,
    iniciado_em: new Date('2026-01-01T10:00:00Z'),
    pausado_em: null,
    retomado_em: null,
    finalizado_em: new Date('2026-01-01T10:10:00Z'),
    criado_em: new Date('2026-01-01T09:50:00Z'),
    parada_emergencia: false,
    usuarios: { id_usuario: 7, nome: 'Tecnico' },
    _count: {
      processostanques: 1,
      alarmes: 1,
      eventos: 1,
      relatorios: 0,
    },
    ...overrides,
  };
}

function makeTankRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_processo_tanque: 20,
    id_tanque: 2,
    status_tanque_processo: statustanqueprocesso.CONCLUIDO,
    vacuo_alvo: '12',
    vacuo_inicial: '0',
    vacuo_final: '11',
    vacuo_medio: '10',
    eficiencia: '95',
    iniciado_em: new Date('2026-01-01T10:00:00Z'),
    finalizado_em: new Date('2026-01-01T10:10:00Z'),
    tanques: {
      id_tanque: 2,
      nome: 'Tanque 2',
      volume: '100',
      unidade_volume: 'L',
    },
    _count: {
      processostanquessensores: 1,
      alarmes: 0,
    },
    ...overrides,
  };
}

function makeEventRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_evento_processo: 30,
    id_processo: 10,
    id_processo_tanque_sensor: null,
    tipo_evento: 'PROCESSO_CONCLUIDO',
    origem_evento: 'SISTEMA',
    severidade_evento: 'INFO',
    ocorrido_em: new Date('2026-01-01T10:10:00Z'),
    ...overrides,
  };
}

function makeReportRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_relatorio: 40,
    tipo_relatorio: 'PROCESSO',
    formato_relatorio: 'PDF',
    titulo: 'Relatorio',
    descricao: null,
    nome_arquivo: 'relatorio.pdf',
    tamanho_bytes: 1024,
    gerado_em: new Date('2026-01-01T10:20:00Z'),
    ...overrides,
  };
}
