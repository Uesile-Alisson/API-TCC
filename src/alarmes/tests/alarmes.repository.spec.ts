import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { AlarmeListRecord, AlarmesRepository } from '../repositories';

type AsyncMock<T = unknown> = Mock<(...args: unknown[]) => Promise<T>>;
type TransactionOperation = Promise<unknown>;
type TransactionMock = Mock<
  (operations: TransactionOperation[]) => Promise<unknown[]>
>;

type PrismaAlarmesMock = {
  findMany: AsyncMock;
  count: AsyncMock;
  findFirst: AsyncMock;
  updateMany: AsyncMock;
  groupBy: AsyncMock;
};

type PrismaMock = {
  alarmes: PrismaAlarmesMock;
  $transaction: TransactionMock;
};

type QueryArgs = {
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  skip?: number;
  take?: number;
  select?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

const asyncMock = <T = unknown>(): AsyncMock<T> =>
  jest.fn<(...args: unknown[]) => Promise<T>>();

describe('AlarmesRepository', () => {
  let repository: AlarmesRepository;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      alarmes: {
        findMany: asyncMock(),
        count: asyncMock(),
        findFirst: asyncMock(),
        updateMany: asyncMock(),
        groupBy: asyncMock(),
      },
      $transaction: jest.fn((operations: TransactionOperation[]) =>
        Promise.all(operations),
      ),
    };

    repository = new AlarmesRepository(prisma as unknown as PrismaService);
  });

  it('deve estar definido', () => {
    expect(repository).toBeDefined();
  });

  it('list chama findMany com where base, paginacao e ordenacao default', async () => {
    prisma.alarmes.findMany.mockResolvedValue([makeAlarmeRecord()]);

    await repository.list({ page: 2, limit: 5 });

    expect(prisma.alarmes.findMany).toHaveBeenCalledTimes(1);
    expect(getFindManyArg()).toMatchObject({
      where: { excluido_em: null },
      orderBy: { ocorrido_em: 'desc' },
      skip: 5,
      take: 5,
    });
  });

  it('list aplica filtros de severidade, status, tipo, origem, ids, periodo e busca', async () => {
    const ocorridoDe = new Date('2026-06-01T00:00:00Z');
    const ocorridoAte = new Date('2026-06-21T23:59:59Z');
    prisma.alarmes.findMany.mockResolvedValue([]);

    await repository.list({
      severidade: severidadealarme.CRITICO,
      status_alarme: statusalarme.ATIVO,
      tipo_alarme: tipoalarme.PROCESSO,
      origem_alarme: origemalarme.BACKEND,
      id_processo: 10,
      id_processo_tanque: 20,
      id_processo_tanque_sensor: 30,
      id_mqtt_mensagem: 40,
      ocorrido_de: ocorridoDe,
      ocorrido_ate: ocorridoAte,
      busca: ' pressao ',
      order_by: 'severidade',
      order_direction: 'asc',
    });

    const args = getFindManyArg();
    expect(args.where).toMatchObject({
      excluido_em: null,
      severidade: severidadealarme.CRITICO,
      tipo_alarme: tipoalarme.PROCESSO,
      origem_alarme: origemalarme.BACKEND,
      id_processo: 10,
      id_processo_tanque: 20,
      id_processo_tanque_sensor: 30,
      id_mqtt_mensagem: 40,
      ocorrido_em: {
        gte: ocorridoDe,
        lte: ocorridoAte,
      },
      OR: [
        { titulo: { contains: 'pressao', mode: 'insensitive' } },
        { descricao: { contains: 'pressao', mode: 'insensitive' } },
      ],
    });
    expect(args.where?.AND).toEqual([
      {
        status_alarme: statusalarme.ATIVO,
        resolvido_em: null,
      },
    ]);
    expect(args.orderBy).toEqual({ severidade: 'asc' });
  });

  it('list com apenas_ativos forca status ATIVO', async () => {
    prisma.alarmes.findMany.mockResolvedValue([]);

    await repository.list({
      status_alarme: statusalarme.RESOLVIDO,
      apenas_ativos: true,
    });

    expect(getFindManyArg().where).toMatchObject({
      excluido_em: null,
      AND: [
        {
          status_alarme: statusalarme.ATIVO,
          resolvido_em: null,
        },
      ],
    });
  });

  it('list com apenas_criticos forca severidade CRITICO', async () => {
    prisma.alarmes.findMany.mockResolvedValue([]);

    await repository.list({
      severidade: severidadealarme.INFO,
      apenas_criticos: true,
    });

    expect(getFindManyArg().where).toMatchObject({
      severidade: severidadealarme.CRITICO,
      excluido_em: null,
    });
  });

  it('count chama prisma.alarmes.count com buildWhere', async () => {
    prisma.alarmes.count.mockResolvedValue(3);

    await expect(repository.count({ id_processo: 10 })).resolves.toBe(3);

    expect(prisma.alarmes.count).toHaveBeenCalledWith({
      where: {
        excluido_em: null,
        id_processo: 10,
      },
    });
  });

  it('listAndCount retorna data, total, page e limit normalizados', async () => {
    const record = makeAlarmeRecord();
    prisma.alarmes.findMany.mockResolvedValue([record]);
    prisma.alarmes.count.mockResolvedValue(1);

    await expect(
      repository.listAndCount({ page: 0, limit: 150 }),
    ).resolves.toEqual({
      data: [record],
      total: 1,
      page: 1,
      limit: 100,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(getFindManyArg()).toMatchObject({
      skip: 0,
      take: 100,
      orderBy: { ocorrido_em: 'desc' },
    });
  });

  it('findById busca por id_alarme e excluido_em null', async () => {
    const record = makeAlarmeRecord();
    prisma.alarmes.findFirst.mockResolvedValue(record);

    await expect(repository.findById(10)).resolves.toBe(record);

    expect(prisma.alarmes.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_alarme: 10,
          excluido_em: null,
        },
      }),
    );
  });

  it('findById retorna null quando nao encontra', async () => {
    prisma.alarmes.findFirst.mockResolvedValue(null);

    await expect(repository.findById(10)).resolves.toBeNull();
  });

  it('findDetailsById busca relacoes resumidas sem campos sensiveis', async () => {
    prisma.alarmes.findFirst.mockResolvedValue(makeAlarmeRecord());

    await repository.findDetailsById(10);

    const args = getFindFirstArg();
    expect(args.where).toEqual({
      id_alarme: 10,
      excluido_em: null,
    });
    expect(JSON.stringify(args.select)).not.toContain('senha_hash');
    expect(JSON.stringify(args.select)).not.toContain('login');
    expect(JSON.stringify(args.select)).not.toContain('email');
    expect(JSON.stringify(args.select)).not.toContain('payload');
  });

  it('findActive delega para list com apenas_ativos', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([makeAlarmeRecord() as unknown as AlarmeListRecord]);

    await repository.findActive({ page: 2 });

    expect(listSpy).toHaveBeenCalledWith({
      page: 2,
      apenas_ativos: true,
    });
  });

  it('findCritical delega para list com apenas_criticos', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([makeAlarmeRecord() as unknown as AlarmeListRecord]);

    await repository.findCritical({ page: 2 });

    expect(listSpy).toHaveBeenCalledWith({
      page: 2,
      apenas_criticos: true,
    });
  });

  it('findByProcess delega para list com id_processo', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([makeAlarmeRecord() as unknown as AlarmeListRecord]);

    await repository.findByProcess(10, { limit: 5 });

    expect(listSpy).toHaveBeenCalledWith({
      limit: 5,
      id_processo: 10,
    });
  });

  it('findActiveByProcess delega com id_processo e apenas_ativos', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([makeAlarmeRecord() as unknown as AlarmeListRecord]);

    await repository.findActiveByProcess(10, { limit: 5 });

    expect(listSpy).toHaveBeenCalledWith({
      limit: 5,
      id_processo: 10,
      apenas_ativos: true,
    });
  });

  it('findCriticalByProcess delega com id_processo e apenas_criticos', async () => {
    const listSpy = jest
      .spyOn(repository, 'list')
      .mockResolvedValue([makeAlarmeRecord() as unknown as AlarmeListRecord]);

    await repository.findCriticalByProcess(10, { limit: 5 });

    expect(listSpy).toHaveBeenCalledWith({
      limit: 5,
      id_processo: 10,
      apenas_criticos: true,
    });
  });

  it('findActiveCriticalByProcess busca alarmes ativos e criticos do processo', async () => {
    prisma.alarmes.findMany.mockResolvedValue([makeAlarmeRecord()]);

    await repository.findActiveCriticalByProcess(10);

    expect(getFindManyArg()).toMatchObject({
      where: {
        id_processo: 10,
        status_alarme: statusalarme.ATIVO,
        resolvido_em: null,
        severidade: severidadealarme.CRITICO,
        excluido_em: null,
      },
      orderBy: {
        ocorrido_em: 'desc',
      },
    });
  });

  it('getDashboard usa counts, groupBy e ultimos registros com excluido_em null', async () => {
    prisma.alarmes.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5);
    prisma.alarmes.groupBy
      .mockResolvedValueOnce([
        { severidade: severidadealarme.CRITICO, _count: { id_alarme: 3 } },
      ])
      .mockResolvedValueOnce([
        { tipo_alarme: tipoalarme.PROCESSO, _count: { id_alarme: 2 } },
      ])
      .mockResolvedValueOnce([
        { origem_alarme: origemalarme.BACKEND, _count: { id_alarme: 2 } },
      ]);
    prisma.alarmes.findMany
      .mockResolvedValueOnce([makeAlarmeRecord()])
      .mockResolvedValueOnce([makeAlarmeRecord({ id_alarme: 11 })]);

    const result = await repository.getDashboard({ id_processo: 10 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      total: 12,
      ativos: 5,
      resolvidos: 7,
      criticos: 3,
      medios: 4,
      infos: 5,
      por_severidade: [{ severidade: severidadealarme.CRITICO, total: 3 }],
      por_status: [
        { status_alarme: statusalarme.ATIVO, total: 5 },
        { status_alarme: statusalarme.NORMALIZADO, total: 2 },
        { status_alarme: statusalarme.RESOLVIDO, total: 7 },
      ],
      por_tipo: [{ tipo_alarme: tipoalarme.PROCESSO, total: 2 }],
      por_origem: [{ origem_alarme: origemalarme.BACKEND, total: 2 }],
    });
    const firstCountArg = prisma.alarmes.count.mock.calls[0][0] as QueryArgs;
    expect(firstCountArg.where).toMatchObject({
      excluido_em: null,
      id_processo: 10,
    });
    expect(getFindManyArg(0).where).toMatchObject({
      excluido_em: null,
      id_processo: 10,
      severidade: severidadealarme.CRITICO,
    });
    expect(getFindManyArg(1).where).toMatchObject({
      AND: [
        {
          excluido_em: null,
          id_processo: 10,
        },
        {
          status_alarme: statusalarme.ATIVO,
          resolvido_em: null,
        },
      ],
    });
  });

  it('resolve retorna null quando updateMany nao altera registros', async () => {
    prisma.alarmes.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.resolve(10, {
        id_usuario_responsavel: 7,
        resolvido_em: new Date('2026-06-21T10:00:00Z'),
      }),
    ).resolves.toBeNull();

    expect(prisma.alarmes.findFirst).not.toHaveBeenCalled();
  });

  it('resolve atualiza como RESOLVIDO e retorna findById quando altera registro', async () => {
    const resolvedAt = new Date('2026-06-21T10:00:00Z');
    const record = makeAlarmeRecord({
      status_alarme: statusalarme.RESOLVIDO,
      resolvido_em: resolvedAt,
      id_usuario_responsavel: 7,
    });
    prisma.alarmes.updateMany.mockResolvedValue({ count: 1 });
    prisma.alarmes.findFirst.mockResolvedValue(record);

    await expect(
      repository.resolve(10, {
        id_usuario_responsavel: 7,
        resolvido_em: resolvedAt,
      }),
    ).resolves.toBe(record);

    expect(prisma.alarmes.updateMany).toHaveBeenCalledWith({
      where: {
        id_alarme: 10,
        excluido_em: null,
      },
      data: {
        status_alarme: statusalarme.RESOLVIDO,
        resolvido_em: resolvedAt,
        id_usuario_responsavel: 7,
        motivo_resolucao: 'FECHAMENTO_POS_PROCESSO',
      },
    });
    expect(prisma.alarmes.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_alarme: 10,
          excluido_em: null,
        },
      }),
    );
  });

  function getFindManyArg(callIndex = 0): QueryArgs {
    return prisma.alarmes.findMany.mock.calls[callIndex][0] as QueryArgs;
  }

  function getFindFirstArg(): QueryArgs {
    return prisma.alarmes.findFirst.mock.calls[0][0] as QueryArgs;
  }
});

function makeAlarmeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_alarme: 10,
    id_mqtt_mensagem: 30,
    id_usuario_responsavel: null,
    titulo: 'Falha de pressao',
    descricao: 'Pressao fora do esperado.',
    tipo_alarme: tipoalarme.PROCESSO,
    severidade: severidadealarme.CRITICO,
    status_alarme: statusalarme.ATIVO,
    origem_alarme: origemalarme.BACKEND,
    valor_detectado: '-80',
    unidade: 'kPa',
    ocorrido_em: new Date('2026-06-21T09:00:00Z'),
    resolvido_em: null,
    excluido_em: null,
    id_processo: 20,
    id_processo_tanque: 21,
    id_processo_tanque_sensor: 22,
    ...overrides,
  };
}
