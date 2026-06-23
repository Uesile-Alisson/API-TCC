import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  severidadealarme,
  severidadeevento,
  statusalarme,
  statusprocesso,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { HISTORICO_PROCESS_STATUS } from '../constants';
import { HistoricoDashboardRepository } from '../repositories';

type AsyncMock<T = unknown> = Mock<(...args: unknown[]) => Promise<T>>;

type PrismaMock = {
  processos: {
    findMany: AsyncMock;
  };
  processostanques: {
    findMany: AsyncMock;
  };
  alarmes: {
    findMany: AsyncMock;
  };
  eventos: {
    findMany: AsyncMock;
  };
};

type QueryArgs = {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  select?: Record<string, unknown>;
};

const asyncMock = <T = unknown>(): AsyncMock<T> =>
  jest.fn<(...args: unknown[]) => Promise<T>>();

describe('HistoricoDashboardRepository', () => {
  let repository: HistoricoDashboardRepository;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      processos: {
        findMany: asyncMock().mockResolvedValue([makeProcessRecord()]),
      },
      processostanques: {
        findMany: asyncMock().mockResolvedValue([makeTankRecord()]),
      },
      alarmes: {
        findMany: asyncMock().mockResolvedValue([]),
      },
      eventos: {
        findMany: asyncMock().mockResolvedValue([makeEventRecord()]),
      },
    };

    repository = new HistoricoDashboardRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('findProcessesForDashboard busca apenas processos historicos e aplica filtros', async () => {
    const dataInicio = new Date('2026-01-01T00:00:00Z');
    const dataFim = new Date('2026-01-31T23:59:59Z');

    await repository.findProcessesForDashboard({
      data_inicio: dataInicio,
      data_fim: dataFim,
      status_processo: statusprocesso.CONCLUIDO,
      campo_data: 'criado_em',
    });

    const args = firstProcessFindManyArg();
    expect(args.where).toMatchObject({
      status_processo: statusprocesso.CONCLUIDO,
      criado_em: {
        gte: dataInicio,
        lte: dataFim,
      },
    });
    const selected = JSON.stringify(args.select);
    expect(selected).not.toContain('login');
    expect(selected).not.toContain('email');
    expect(selected).not.toContain('senha_hash');
  });

  it('findProcessesForDashboard usa status historicos quando status nao e enviado', async () => {
    await repository.findProcessesForDashboard({});

    expect(firstProcessFindManyArg().where).toMatchObject({
      status_processo: { in: [...HISTORICO_PROCESS_STATUS] },
    });
  });

  it('findTanksForDashboard busca tanques de processos historicos e aplica id_tanque', async () => {
    await repository.findTanksForDashboard({ id_tanque: 2 });

    const args = firstTankFindManyArg();
    expect(args.where).toMatchObject({
      id_tanque: 2,
      processos: {
        status_processo: { in: [...HISTORICO_PROCESS_STATUS] },
      },
    });
  });

  it('findAlarmsForDashboard busca alarmes vinculados a processos historicos sem payload MQTT', async () => {
    await repository.findAlarmsForDashboard({
      id_tanque: 2,
      data_inicio: new Date('2026-01-01T00:00:00Z'),
    });

    const args = firstAlarmFindManyArg();
    expect(args.where).toMatchObject({
      excluido_em: null,
      OR: expect.arrayContaining([
        expect.objectContaining({
          processos: expect.objectContaining({
            status_processo: { in: [...HISTORICO_PROCESS_STATUS] },
          }),
        }),
      ]),
    });
    expect(JSON.stringify(args.select)).not.toContain('payload');
    expect(JSON.stringify(args.select)).not.toContain('mqtt');
  });

  it('findEventsForDashboard busca eventos de processos historicos', async () => {
    await repository.findEventsForDashboard({ id_tanque: 2 });

    const args = firstEventFindManyArg();
    expect(args.where).toMatchObject({
      processos: {
        status_processo: { in: [...HISTORICO_PROCESS_STATUS] },
      },
      processostanquessensores: {
        processostanques: {
          id_tanque: 2,
        },
      },
    });
  });

  it('getDashboardDataset retorna processos, tanques, alarmes e eventos', async () => {
    const processSpy = jest
      .spyOn(repository, 'findProcessesForDashboard')
      .mockResolvedValue([makeMappedProcess()]);
    const tankSpy = jest
      .spyOn(repository, 'findTanksForDashboard')
      .mockResolvedValue([makeMappedTank()]);
    const alarmSpy = jest
      .spyOn(repository, 'findAlarmsForDashboard')
      .mockResolvedValue([makeAlarmRecord()]);
    const eventSpy = jest
      .spyOn(repository, 'findEventsForDashboard')
      .mockResolvedValue([makeMappedEvent()]);
    const query = { status_processo: statusprocesso.CONCLUIDO };

    await expect(repository.getDashboardDataset(query)).resolves.toEqual({
      processos: [makeMappedProcess()],
      tanques: [makeMappedTank()],
      alarmes: [makeAlarmRecord()],
      eventos: [makeMappedEvent()],
    });
    expect(processSpy).toHaveBeenCalledWith(query);
    expect(tankSpy).toHaveBeenCalledWith(query);
    expect(alarmSpy).toHaveBeenCalledWith(query);
    expect(eventSpy).toHaveBeenCalledWith(query);
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
    finalizado_em: new Date('2026-01-01T10:10:00Z'),
    criado_em: new Date('2026-01-01T09:50:00Z'),
    parada_emergencia: false,
    _count: {
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
    status_tanque_processo: 'CONCLUIDO',
    vacuo_alvo: '12',
    vacuo_inicial: '0',
    vacuo_final: '11',
    vacuo_medio: '10',
    eficiencia: '95',
    iniciado_em: new Date('2026-01-01T10:00:00Z'),
    finalizado_em: new Date('2026-01-01T10:10:00Z'),
    tanques: { id_tanque: 2, nome: 'Tanque 2' },
    processos: {
      id_processo: 10,
      status_processo: statusprocesso.CONCLUIDO,
      tempo_execucao: 100,
    },
    _count: { alarmes: 0 },
    ...overrides,
  };
}

function makeEventRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_evento_processo: 30,
    severidade_evento: 'INFO',
    ocorrido_em: new Date('2026-01-01T10:10:00Z'),
    id_processo: 10,
    processos: {
      id_processo: 10,
      status_processo: statusprocesso.CONCLUIDO,
    },
    ...overrides,
  };
}

function makeAlarmRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_alarme: 40,
    severidade: severidadealarme.CRITICO,
    status_alarme: statusalarme.ATIVO,
    ocorrido_em: new Date('2026-01-01T10:05:00Z'),
    resolvido_em: null,
    ...overrides,
  };
}

function makeMappedProcess() {
  return {
    ...makeProcessRecord(),
    total_alarmes: 1,
    total_alarmes_criticos: 0,
    total_eventos: 1,
    possui_relatorio: false,
  };
}

function makeMappedTank() {
  return {
    id_processo_tanque: 20,
    id_tanque: 2,
    nome_tanque: 'Tanque 2',
    status_tanque_processo: 'CONCLUIDO',
    vacuo_alvo: '12',
    vacuo_inicial: '0',
    vacuo_final: '11',
    vacuo_medio: '10',
    eficiencia: '95',
    tempo_execucao: 100,
    total_alarmes: 0,
    total_alarmes_criticos: 0,
  };
}

function makeMappedEvent() {
  return {
    id_evento_processo: 30,
    severidade_evento: severidadeevento.INFO,
    ocorrido_em: new Date('2026-01-01T10:10:00Z'),
  };
}
