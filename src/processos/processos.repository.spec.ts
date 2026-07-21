import { modooperacaoauxiliar, statusprocesso } from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service';
import { ProcessosRepository } from './processos.repository';

describe('ProcessosRepository - prioridade auxiliar por tanque', () => {
  const processostanquesCreate = jest.fn();
  const processostanquesAuxiliaresUpdateMany = jest.fn();

  const persistedProcess = {
    id_processo: 40,
    id_usuario: 7,
    status_processo: statusprocesso.CONFIGURADO,
    vacuo_alvo: -80,
    modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
    encerramento_automatico: true,
    encerramento_versao: 0,
    processosauxiliares: {},
    processostanques: [],
  };

  const tx = {
    configuracoessistema: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    tanques: {
      findMany: jest.fn().mockResolvedValue([
        { id_tanque: 1, vacuo_padrao: -80 },
        { id_tanque: 2, vacuo_padrao: -80 },
      ]),
    },
    processos: {
      create: jest.fn().mockResolvedValue(persistedProcess),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({
        status_processo: statusprocesso.EM_EXECUCAO,
      }),
      findUnique: jest.fn().mockResolvedValue(persistedProcess),
    },
    processosauxiliares: {
      create: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    processostanques: {
      create: processostanquesCreate,
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    processostanquessensores: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    processostanquesauxiliares: {
      updateMany: processostanquesAuxiliaresUpdateMany,
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  let repository: ProcessosRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    processostanquesCreate
      .mockResolvedValueOnce({ id_processo_tanque: 101 })
      .mockResolvedValueOnce({ id_processo_tanque: 102 });
    processostanquesAuxiliaresUpdateMany.mockResolvedValue({ count: 2 });
    repository = new ProcessosRepository(prisma as unknown as PrismaService);
  });

  it('persiste a prioridade informada no contrato auxiliar de cada tanque', async () => {
    await repository.createWithRelations({
      id_usuario: 7,
      dto: {
        tempo_maximo: 900,
        vacuo_alvo: -80,
        modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
        encerramento_automatico: true,
        tanques: [
          {
            id_tanque: 1,
            prioridade: 2,
            sensores: [{ id_sensor: 11 }],
          },
          {
            id_tanque: 2,
            prioridade: 1,
            sensores: [{ id_sensor: 12 }],
          },
        ],
      },
    });

    expect(processostanquesCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          id_tanque: 1,
          processostanquesauxiliares: { create: { prioridade: 2 } },
        }),
      }),
    );
    expect(processostanquesCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          id_tanque: 2,
          processostanquesauxiliares: { create: { prioridade: 1 } },
        }),
      }),
    );
  });

  it('preserva a prioridade configurada nas transicoes do lifecycle', async () => {
    await repository.applyLifecycleTransition({
      id_processo: 40,
      transition: {
        processo: {
          status_processo: statusprocesso.EM_EXECUCAO,
        },
      },
    });

    const update = processostanquesAuxiliaresUpdateMany.mock.calls.at(
      -1,
    )?.[0] as { data: Record<string, unknown> } | undefined;

    expect(update).toBeDefined();
    expect(update?.data).not.toHaveProperty('prioridade');
  });

  it('substitui os tanques configurados mantendo as novas prioridades', async () => {
    await repository.updateConfig({
      id_processo: 40,
      dto: {
        tanques: [
          {
            id_tanque: 1,
            prioridade: 1,
            sensores: [{ id_sensor: 11 }],
          },
          {
            id_tanque: 2,
            prioridade: 2,
            sensores: [{ id_sensor: 12 }],
          },
        ],
      },
    });

    expect(processostanquesCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          id_tanque: 1,
          processostanquesauxiliares: { create: { prioridade: 1 } },
        }),
      }),
    );
    expect(processostanquesCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          id_tanque: 2,
          processostanquesauxiliares: { create: { prioridade: 2 } },
        }),
      }),
    );
  });
});
