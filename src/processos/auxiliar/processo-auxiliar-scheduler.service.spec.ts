import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  modooperacaoauxiliar,
  statusauxiliotanque,
  statusestagnacao,
  statusprocesso,
  statussubsistemaauxiliar,
  statustanqueprocesso,
  StatusValvula,
} from '@prisma/client';
import { ProcessoAuxiliarSafetyAction } from '../interfaces';
import { ProcessoLogService } from '../logs';
import { ProcessosService } from '../processos.service';
import { ProcessoAuxiliarCommandService } from './processo-auxiliar-command.service';
import {
  ProcessoAuxiliarRepository,
  ProcessoAuxiliarSchedulerContext,
  ProcessoAuxiliarSchedulerTank,
} from './processo-auxiliar.repository';
import { ProcessoAuxiliarSchedulerService } from './processo-auxiliar-scheduler.service';

describe('ProcessoAuxiliarSchedulerService', () => {
  const repository = {
    clearExpiredLeases: jest.fn(),
    findSchedulerContexts: jest.fn(),
    synchronizeCandidates: jest.fn(),
    updateIdleSchedulerDecision: jest.fn(),
    blockTank: jest.fn(),
    markSchedulerFailure: jest.fn(),
    refreshAssistanceEvidence: jest.fn(),
  };
  const commands = { executeAutomaticCommand: jest.fn() };
  const logs = { registerSystemAction: jest.fn() };
  const processos = { notifyAuxiliaryStateUpdated: jest.fn() };
  let service: ProcessoAuxiliarSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.clearExpiredLeases.mockResolvedValue(0);
    repository.synchronizeCandidates.mockResolvedValue(0);
    repository.updateIdleSchedulerDecision.mockResolvedValue(true);
    repository.blockTank.mockResolvedValue(undefined);
    repository.markSchedulerFailure.mockResolvedValue(undefined);
    repository.refreshAssistanceEvidence.mockResolvedValue({
      changed: false,
      evidence: {},
    });
    commands.executeAutomaticCommand.mockResolvedValue({ success: true });
    logs.registerSystemAction.mockResolvedValue({
      created: true,
      id_log_operacional: 1,
    });
    processos.notifyAuxiliaryStateUpdated.mockResolvedValue({});

    service = new ProcessoAuxiliarSchedulerService(
      repository as unknown as ProcessoAuxiliarRepository,
      commands as unknown as ProcessoAuxiliarCommandService,
      logs as unknown as ProcessoLogService,
      processos as unknown as ProcessosService,
    );
  });

  it('no modo MANUAL recomenda o auxilio sem acionar hardware', async () => {
    const context = makeContext({
      mode: modooperacaoauxiliar.MANUAL,
      tanks: [makeTank({ status_auxilio: statusauxiliotanque.ELEGIVEL })],
    });
    repository.findSchedulerContexts.mockResolvedValue([context]);

    await service.runOnce(new Date('2026-07-16T12:00:00.000Z'));

    expect(repository.updateIdleSchedulerDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        status: statussubsistemaauxiliar.AGUARDANDO,
        reason: expect.stringContaining('Modo MANUAL'),
      }),
    );
    expect(commands.executeAutomaticCommand).not.toHaveBeenCalled();
    expect(processos.notifyAuxiliaryStateUpdated).toHaveBeenCalledWith(10);
  });

  it('seleciona primeiro a maior prioridade e abre somente sua valvula', async () => {
    const lowerPriority = makeTank({
      id_processo_tanque: 20,
      id_tanque: 1,
      prioridade: 1,
    });
    const higherPriority = makeTank({
      id_processo_tanque: 21,
      id_tanque: 2,
      prioridade: 5,
      versao: 8,
    });
    repository.findSchedulerContexts.mockResolvedValue([
      makeContext({ tanks: [lowerPriority, higherPriority] }),
    ]);

    await service.runOnce();

    expect(commands.executeAutomaticCommand).toHaveBeenCalledTimes(1);
    expect(commands.executeAutomaticCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
        id_processo_tanque: 21,
        expected_tank_version: 8,
      }),
    );
  });

  it('no ASSISTIDO desliga a bomba para ceder a um lease humano', async () => {
    const tank = makeTank({
      status_auxilio: statusauxiliotanque.EM_ATENDIMENTO,
      iniciado_em: new Date('2026-07-16T11:59:30.000Z'),
    });
    repository.findSchedulerContexts.mockResolvedValue([
      makeContext({
        mode: modooperacaoauxiliar.ASSISTIDO,
        current_tank_id: tank.id_processo_tanque,
        subsystem_status: statussubsistemaauxiliar.OPERANDO,
        pump_running: true,
        active_pump_lease: true,
        has_active_human_lease: true,
        tanks: [tank],
      }),
    ]);

    await service.runOnce(new Date('2026-07-16T12:00:00.000Z'));

    expect(commands.executeAutomaticCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
        id_processo_tanque: undefined,
        motivo: expect.stringContaining('cedido'),
      }),
    );
  });

  it('liga a bomba somente depois que a valvula selecionada esta aberta', async () => {
    const tank = makeTank({
      status_auxilio: statusauxiliotanque.AGUARDANDO,
      valve_status: StatusValvula.ABERTA,
    });
    repository.findSchedulerContexts.mockResolvedValue([
      makeContext({
        current_tank_id: tank.id_processo_tanque,
        subsystem_status: statussubsistemaauxiliar.PREPARANDO,
        pump_running: false,
        tanks: [tank],
      }),
    ]);

    await service.runOnce(new Date('2026-07-16T12:00:00.000Z'));

    expect(commands.executeAutomaticCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
        id_processo_tanque: tank.id_processo_tanque,
      }),
    );
  });

  it('encerra ao normalizar a estagnacao', async () => {
    const tank = makeTank({
      status_auxilio: statusauxiliotanque.EM_ATENDIMENTO,
      status_estagnacao: statusestagnacao.NORMAL,
      iniciado_em: new Date('2026-07-16T11:59:30.000Z'),
    });
    repository.findSchedulerContexts.mockResolvedValue([
      makeContext({
        current_tank_id: tank.id_processo_tanque,
        subsystem_status: statussubsistemaauxiliar.OPERANDO,
        pump_running: true,
        tanks: [tank],
      }),
    ]);

    await service.runOnce(new Date('2026-07-16T12:00:00.000Z'));

    expect(commands.executeAutomaticCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
        motivo: expect.stringContaining('progresso'),
      }),
    );
  });

  it('encerra quando a melhoria minima do auxilio foi comprovada', async () => {
    const tank = makeTank({
      status_auxilio: statusauxiliotanque.EM_ATENDIMENTO,
      iniciado_em: new Date('2026-07-16T11:59:00.000Z'),
    });
    repository.refreshAssistanceEvidence.mockResolvedValueOnce({
      changed: true,
      evidence: {
        eficacia_confirmada: true,
        melhoria_observada: 2.5,
        melhoria_minima_esperada: 1,
        motivo_avaliacao: 'Melhoria minima atingida.',
      },
    });
    repository.findSchedulerContexts.mockResolvedValue([
      makeContext({
        current_tank_id: tank.id_processo_tanque,
        subsystem_status: statussubsistemaauxiliar.OPERANDO,
        pump_running: true,
        tanks: [tank],
      }),
    ]);

    await service.runOnce(new Date('2026-07-16T12:00:00.000Z'));

    expect(commands.executeAutomaticCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
        motivo: 'Melhoria minima atingida.',
      }),
    );
  });

  it('fecha a valvula e bloqueia nova tentativa ao atingir o timeout', async () => {
    const tank = makeTank({
      status_auxilio: statusauxiliotanque.EM_ATENDIMENTO,
      valve_status: StatusValvula.ABERTA,
      iniciado_em: new Date('2026-07-16T11:57:00.000Z'),
    });
    repository.findSchedulerContexts.mockResolvedValue([
      makeContext({
        current_tank_id: tank.id_processo_tanque,
        subsystem_status: statussubsistemaauxiliar.TROCANDO_TANQUE,
        pump_running: false,
        assistance_timeout_seconds: 120,
        tanks: [tank],
      }),
    ]);

    await service.runOnce(new Date('2026-07-16T12:00:00.000Z'));

    expect(commands.executeAutomaticCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
      }),
    );
    expect(repository.blockTank).toHaveBeenCalledWith(
      expect.objectContaining({
        id_processo_tanque: tank.id_processo_tanque,
        reason: expect.stringContaining('Tempo maximo'),
      }),
    );
  });

  it('libera o bloqueio global para atender o proximo tanque da fila', async () => {
    repository.findSchedulerContexts.mockResolvedValue([
      makeContext({
        subsystem_status: statussubsistemaauxiliar.BLOQUEADO,
        subsystem_reason: 'Tanque 1 excedeu timeout.',
        tanks: [
          makeTank({
            id_processo_tanque: 20,
            status_auxilio: statusauxiliotanque.BLOQUEADO,
            motivo_bloqueio: 'Timeout.',
          }),
          makeTank({
            id_processo_tanque: 21,
            id_tanque: 2,
            status_auxilio: statusauxiliotanque.AGUARDANDO,
          }),
        ],
      }),
    ]);

    await service.runOnce();

    expect(repository.updateIdleSchedulerDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        status: statussubsistemaauxiliar.AGUARDANDO,
      }),
    );
    expect(commands.executeAutomaticCommand).not.toHaveBeenCalled();
  });

  function makeContext(
    overrides: Partial<ProcessoAuxiliarSchedulerContext> = {},
  ): ProcessoAuxiliarSchedulerContext {
    return {
      id_processo: 10,
      status_processo: statusprocesso.EM_EXECUCAO,
      mode: modooperacaoauxiliar.AUTOMATICO,
      subsystem_status: statussubsistemaauxiliar.DISPONIVEL,
      subsystem_version: 5,
      current_tank_id: null,
      subsystem_updated_at: new Date('2026-07-16T11:59:30.000Z'),
      subsystem_reason: null,
      pump_running: false,
      pump_status_at: new Date('2026-07-16T12:00:00.000Z'),
      active_pump_lease: false,
      has_active_human_lease: false,
      assistance_timeout_seconds: 120,
      assistance_evaluation_window_seconds: 30,
      assistance_minimum_improvement: 1,
      tanks: [makeTank()],
      ...overrides,
    };
  }

  function makeTank(
    overrides: Partial<ProcessoAuxiliarSchedulerTank> = {},
  ): ProcessoAuxiliarSchedulerTank {
    return {
      id_processo_tanque: 20,
      id_tanque: 1,
      status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
      status_estagnacao: statusestagnacao.DETECTADA,
      estagnacao_detectada_em: new Date('2026-07-16T11:58:00.000Z'),
      status_auxilio: statusauxiliotanque.AGUARDANDO,
      prioridade: 0,
      solicitado_em: new Date('2026-07-16T11:58:00.000Z'),
      iniciado_em: null,
      versao: 3,
      motivo_bloqueio: null,
      valve_status: StatusValvula.FECHADA,
      active_valve_lease: false,
      avaliacao_iniciada_em: null,
      avaliacao_finalizada_em: null,
      vacuo_antes_auxilio: null,
      tendencia_antes_auxilio: null,
      vacuo_durante_auxilio: null,
      tendencia_durante_auxilio: null,
      vacuo_apos_auxilio: null,
      tendencia_apos_auxilio: null,
      melhoria_observada: null,
      melhoria_minima_esperada: null,
      eficacia_confirmada: null,
      motivo_avaliacao: null,
      sensor_operational: true,
      coupling_ok: true,
      ...overrides,
    };
  }
});
