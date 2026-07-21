import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  modooperacaoauxiliar,
  statusauxiliotanque,
  statusencerramentoprocesso,
  statusprocesso,
  statussubsistemaauxiliar,
  statustanqueprocesso,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProcessoAuxiliarSafetyAction,
  ProcessoAuxiliarSafetyOrigin,
} from '../interfaces';
import {
  ProcessoAuxiliarCommandReservation,
  ProcessoAuxiliarRepository,
} from './processo-auxiliar.repository';

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('ProcessoAuxiliarRepository', () => {
  const tx = {
    processos: { findUnique: asyncMock(), findMany: asyncMock() },
    processosauxiliares: {
      updateMany: asyncMock(),
      findUniqueOrThrow: asyncMock(),
    },
    processostanques: {
      findFirst: asyncMock(),
      findUnique: asyncMock(),
    },
    processostanquesauxiliares: {
      updateMany: asyncMock(),
      findUniqueOrThrow: asyncMock(),
    },
    bombas: { findFirst: asyncMock() },
    valvulas: { count: asyncMock() },
  };
  type TransactionCallback = (client: typeof tx) => Promise<unknown>;
  const prisma = {
    $transaction: asyncMock(),
    processos: { findMany: asyncMock() },
    configuracoessistema: { findFirst: asyncMock() },
    processosauxiliares: { updateMany: asyncMock() },
    processostanquesauxiliares: { updateMany: asyncMock() },
  };
  let repository: ProcessoAuxiliarRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (operation: unknown) => {
      if (typeof operation === 'function') {
        return (operation as TransactionCallback)(tx);
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
    repository = new ProcessoAuxiliarRepository(
      prisma as unknown as PrismaService,
    );
  });

  it('adquire o lease da bomba com OCC e incrementa a versao', async () => {
    tx.processos.findUnique.mockResolvedValue({
      status_processo: statusprocesso.EM_EXECUCAO,
      modo_operacao_auxiliar: modooperacaoauxiliar.ASSISTIDO,
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar.DISPONIVEL,
      },
    });
    tx.processosauxiliares.updateMany.mockResolvedValue({ count: 1 });
    tx.processosauxiliares.findUniqueOrThrow.mockResolvedValue({
      id_usuario_controle_bomba: 7,
      versao: 5,
      controle_bomba_assumido_em: new Date('2026-07-16T12:00:00.000Z'),
      controle_bomba_expira_em: new Date('2026-07-16T12:02:00.000Z'),
    });

    const result = await repository.acquirePumpControl({
      id_processo: 10,
      id_usuario: 7,
      expected_version: 4,
      duration_seconds: 120,
    });

    expect(tx.processosauxiliares.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id_processo: 10,
          versao: 4,
        }),
        data: expect.objectContaining({
          id_usuario_controle_bomba: 7,
          status_subsistema: statussubsistemaauxiliar.CONTROLE_MANUAL,
          versao: { increment: 1 },
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ id_usuario: 7, versao: 5 }),
    );
  });

  it('bloqueia lease humano quando o processo esta no modo automatico', async () => {
    tx.processos.findUnique.mockResolvedValue({
      status_processo: statusprocesso.EM_EXECUCAO,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar.DISPONIVEL,
      },
    });

    await expect(
      repository.acquirePumpControl({
        id_processo: 10,
        id_usuario: 7,
        expected_version: 4,
        duration_seconds: 120,
      }),
    ).rejects.toThrow('Modo AUTOMATICO');

    expect(tx.processosauxiliares.updateMany).not.toHaveBeenCalled();
  });

  it('bloqueia novo lease humano durante o encerramento geral', async () => {
    tx.processos.findUnique.mockResolvedValue({
      status_processo: statusprocesso.EM_EXECUCAO,
      status_encerramento_geral: statusencerramentoprocesso.ENCERRANDO,
      modo_operacao_auxiliar: modooperacaoauxiliar.ASSISTIDO,
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar.BLOQUEADO,
      },
    });

    await expect(
      repository.acquirePumpControl({
        id_processo: 10,
        id_usuario: 7,
        expected_version: 4,
        duration_seconds: 120,
      }),
    ).rejects.toThrow('encerramento geral');

    expect(tx.processosauxiliares.updateMany).not.toHaveBeenCalled();
  });

  it('reserva bomba e tanque atomicamente quando os leases pertencem ao usuario', async () => {
    const leaseExpiry = new Date(Date.now() + 60_000);
    tx.processos.findUnique.mockResolvedValue({
      modo_operacao_auxiliar: modooperacaoauxiliar.ASSISTIDO,
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar.CONTROLE_MANUAL,
        id_processo_tanque_atual: null,
        id_usuario_controle_bomba: 7,
        controle_bomba_expira_em: leaseExpiry,
      },
      processostanques: [],
    });
    tx.processostanques.findFirst.mockResolvedValue({
      processostanquesauxiliares: {
        status_auxilio: statusauxiliotanque.ELEGIVEL,
        id_usuario_controle_valvula: 7,
        controle_valvula_expira_em: leaseExpiry,
      },
    });
    tx.processosauxiliares.updateMany.mockResolvedValue({ count: 1 });
    tx.processostanquesauxiliares.updateMany.mockResolvedValue({ count: 1 });

    const result = await repository.reserveCommand({
      id_processo: 10,
      id_processo_tanque: 20,
      id_usuario: 7,
      origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
      action: ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
      expected_subsystem_version: 5,
      expected_tank_version: 3,
    });

    expect(tx.processosauxiliares.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_processo: 10, versao: 5 },
        data: expect.objectContaining({
          status_subsistema: statussubsistemaauxiliar.PREPARANDO,
          id_processo_tanque_atual: 20,
        }),
      }),
    );
    expect(tx.processostanquesauxiliares.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_processo_tanque: 20, versao: 3 },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        reserved_subsystem_version: 6,
        reserved_tank_version: 4,
      }),
    );
  });

  it('rejeita a reserva se o lease da bomba expirou', async () => {
    tx.processos.findUnique.mockResolvedValue({
      modo_operacao_auxiliar: modooperacaoauxiliar.MANUAL,
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar.CONTROLE_MANUAL,
        id_processo_tanque_atual: 20,
        id_usuario_controle_bomba: 7,
        controle_bomba_expira_em: new Date(Date.now() - 1_000),
      },
      processostanques: [],
    });

    await expect(
      repository.reserveCommand({
        id_processo: 10,
        id_usuario: 7,
        origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
        action: ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
        expected_subsystem_version: 5,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.processosauxiliares.updateMany).not.toHaveBeenCalled();
  });

  it('consolida o ACK com OCC e finaliza tanque quando o vacuo foi atingido', async () => {
    tx.processostanques.findUnique.mockResolvedValue({
      status_tanque_processo: statustanqueprocesso.VACUO_ATINGIDO,
    });
    tx.processosauxiliares.updateMany.mockResolvedValue({ count: 1 });
    tx.processostanquesauxiliares.updateMany.mockResolvedValue({ count: 1 });
    const reservation: ProcessoAuxiliarCommandReservation = {
      id_processo: 10,
      id_processo_tanque: 20,
      action: ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
      previous_subsystem_status: statussubsistemaauxiliar.TROCANDO_TANQUE,
      previous_current_tank_id: 20,
      previous_tank_status: statusauxiliotanque.EM_ATENDIMENTO,
      reserved_subsystem_version: 6,
      reserved_tank_version: 4,
    };

    const result = await repository.finalizeCommand(reservation);

    expect(tx.processosauxiliares.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_processo: 10, versao: 6 },
        data: expect.objectContaining({
          status_subsistema: statussubsistemaauxiliar.DISPONIVEL,
          id_processo_tanque_atual: null,
        }),
      }),
    );
    expect(tx.processostanquesauxiliares.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_processo_tanque: 20, versao: 4 },
        data: expect.objectContaining({
          status_auxilio: statusauxiliotanque.ATENDIDO,
          versao: { increment: 1 },
        }),
      }),
    );
    expect(result).toEqual({ subsystem_version: 7, tank_version: 5 });
  });

  it('permite reserva da automacao no ASSISTIDO quando nao existe lease humano', async () => {
    tx.processos.findUnique.mockResolvedValue({
      modo_operacao_auxiliar: modooperacaoauxiliar.ASSISTIDO,
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar.DISPONIVEL,
        id_processo_tanque_atual: null,
        id_usuario_controle_bomba: null,
        controle_bomba_expira_em: null,
      },
      processostanques: [
        {
          processostanquesauxiliares: {
            id_usuario_controle_valvula: null,
            controle_valvula_expira_em: null,
          },
        },
      ],
    });
    tx.processostanques.findFirst.mockResolvedValue({
      processostanquesauxiliares: {
        status_auxilio: statusauxiliotanque.AGUARDANDO,
        id_usuario_controle_valvula: null,
        controle_valvula_expira_em: null,
      },
    });
    tx.processosauxiliares.updateMany.mockResolvedValue({ count: 1 });
    tx.processostanquesauxiliares.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.reserveCommand({
        id_processo: 10,
        id_processo_tanque: 20,
        origin: ProcessoAuxiliarSafetyOrigin.AUTOMACAO,
        action: ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
        expected_subsystem_version: 5,
        expected_tank_version: 3,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ reserved_subsystem_version: 6 }),
    );
  });

  it('faz a automacao do ASSISTIDO ceder se qualquer valvula possui lease ativo', async () => {
    const leaseExpiry = new Date(Date.now() + 60_000);
    tx.processos.findUnique.mockResolvedValue({
      modo_operacao_auxiliar: modooperacaoauxiliar.ASSISTIDO,
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar.DISPONIVEL,
        id_processo_tanque_atual: null,
        id_usuario_controle_bomba: null,
        controle_bomba_expira_em: null,
      },
      processostanques: [
        {
          processostanquesauxiliares: {
            id_usuario_controle_valvula: 8,
            controle_valvula_expira_em: leaseExpiry,
          },
        },
      ],
    });
    tx.processostanques.findFirst.mockResolvedValue({
      processostanquesauxiliares: {
        status_auxilio: statusauxiliotanque.AGUARDANDO,
        id_usuario_controle_valvula: null,
        controle_valvula_expira_em: null,
      },
    });

    await expect(
      repository.reserveCommand({
        id_processo: 10,
        id_processo_tanque: 20,
        origin: ProcessoAuxiliarSafetyOrigin.AUTOMACAO,
        action: ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
        expected_subsystem_version: 5,
        expected_tank_version: 3,
      }),
    ).rejects.toThrow('lease humano');

    expect(tx.processosauxiliares.updateMany).not.toHaveBeenCalled();
  });

  it('permite comando humano de desligamento no AUTOMATICO sem exigir lease', async () => {
    tx.processos.findUnique.mockResolvedValue({
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar.OPERANDO,
        id_processo_tanque_atual: 20,
        id_usuario_controle_bomba: null,
        controle_bomba_expira_em: null,
      },
      processostanques: [],
    });
    tx.processosauxiliares.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.reserveCommand({
        id_processo: 10,
        id_usuario: 7,
        origin: ProcessoAuxiliarSafetyOrigin.USUARIO,
        action: ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
        expected_subsystem_version: 5,
      }),
    ).resolves.toEqual(
      expect.objectContaining({ reserved_subsystem_version: 6 }),
    );
  });

  it('deriva o timeout do escalonador e identifica leases ativos', async () => {
    const evaluatedAt = new Date('2026-07-16T12:00:00.000Z');
    prisma.configuracoessistema.findFirst.mockResolvedValue({
      estagnacao_janela_segundos: 60,
      estagnacao_janelas_consecutivas: 2,
    });
    prisma.processos.findMany.mockResolvedValue([
      {
        id_processo: 10,
        status_processo: statusprocesso.EM_EXECUCAO,
        modo_operacao_auxiliar: modooperacaoauxiliar.ASSISTIDO,
        tempo_maximo: 900,
        processosauxiliares: {
          status_subsistema: statussubsistemaauxiliar.DISPONIVEL,
          versao: 4,
          id_processo_tanque_atual: null,
          atualizado_em: evaluatedAt,
          motivo_bloqueio: null,
          id_usuario_controle_bomba: 7,
          controle_bomba_expira_em: new Date(evaluatedAt.getTime() + 60_000),
        },
        processostanques: [
          {
            id_processo_tanque: 20,
            id_tanque: 1,
            status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
            status_estagnacao: 'DETECTADA',
            estagnacao_detectada_em: evaluatedAt,
            processostanquesauxiliares: {
              status_auxilio: statusauxiliotanque.AGUARDANDO,
              prioridade: 2,
              solicitado_em: evaluatedAt,
              iniciado_em: null,
              versao: 3,
              motivo_bloqueio: null,
              id_usuario_controle_valvula: null,
              controle_valvula_expira_em: null,
            },
            tanques: {
              valvulas: [
                {
                  status_valvula: 'FECHADA',
                  bombas: {
                    ligada_hardware: false,
                    ultimo_status_hardware_em: evaluatedAt,
                  },
                },
              ],
            },
          },
        ],
      },
    ]);

    const [context] = await repository.findSchedulerContexts(evaluatedAt);

    expect(context).toEqual(
      expect.objectContaining({
        assistance_timeout_seconds: 120,
        active_pump_lease: true,
        has_active_human_lease: true,
        pump_running: false,
      }),
    );
  });
});
