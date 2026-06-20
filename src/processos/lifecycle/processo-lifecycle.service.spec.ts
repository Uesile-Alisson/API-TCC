import { statusprocesso, statustanqueprocesso } from '@prisma/client';
import { ProcessoLifecycleService } from './processo-lifecycle.service';
import { beforeEach, describe, expect, it } from '@jest/globals';

describe('ProcessoLifecycleService', () => {
  const now = new Date('2026-06-20T12:00:00.000Z');
  let service: ProcessoLifecycleService;

  beforeEach(() => {
    service = new ProcessoLifecycleService();
  });

  it('buildStartTransition monta início do processo de vácuo', () => {
    const transition = service.buildStartTransition({ now });

    expect(transition).toEqual({
      processo: {
        status_processo: statusprocesso.EM_EXECUCAO,
        iniciado_em: now,
        pausado_em: null,
        retomado_em: null,
        finalizado_em: null,
        parada_emergencia: false,
      },
      tanques: {
        status_tanque_processo: statustanqueprocesso.EM_EXECUCAO,
        iniciado_em: now,
        finalizado_em: null,
      },
    });
  });

  it('buildPauseTransition pausa apenas o status geral do processo', () => {
    expect(service.buildPauseTransition({ now })).toEqual({
      processo: {
        status_processo: statusprocesso.PAUSADO,
        pausado_em: now,
      },
    });
  });

  it('buildResumeTransition retoma processo e tanques em execução', () => {
    expect(service.buildResumeTransition({ now })).toEqual({
      processo: {
        status_processo: statusprocesso.EM_EXECUCAO,
        retomado_em: now,
        pausado_em: null,
      },
      tanques: {
        status_tanque_processo: statustanqueprocesso.EM_EXECUCAO,
      },
    });
  });

  it('buildFinishTransition conclui processo e tanques', () => {
    expect(service.buildFinishTransition({ now, tempo_execucao: 120 })).toEqual(
      {
        processo: {
          status_processo: statusprocesso.CONCLUIDO,
          finalizado_em: now,
          tempo_execucao: 120,
        },
        tanques: {
          status_tanque_processo: statustanqueprocesso.CONCLUIDO,
          finalizado_em: now,
        },
      },
    );
  });

  it('buildInterruptTransition interrompe sem parada de emergência', () => {
    expect(
      service.buildInterruptTransition({ now, tempo_execucao: 90 }),
    ).toEqual({
      processo: {
        status_processo: statusprocesso.INTERROMPIDO,
        finalizado_em: now,
        tempo_execucao: 90,
        parada_emergencia: false,
      },
      tanques: {
        status_tanque_processo: statustanqueprocesso.INTERROMPIDO,
        finalizado_em: now,
      },
    });
  });

  it('buildEmergencyStopTransition interrompe com parada de emergência', () => {
    const transition = service.buildEmergencyStopTransition({
      now,
      tempo_execucao: 80,
    });

    expect(transition.processo.parada_emergencia).toBe(true);
    expect(transition.processo.status_processo).toBe(
      statusprocesso.INTERROMPIDO,
    );
    expect(transition.tanques?.status_tanque_processo).toBe(
      statustanqueprocesso.INTERROMPIDO,
    );
  });

  it('buildFailureTransition marca processo e tanques com falha', () => {
    expect(service.buildFailureTransition({ now, tempo_execucao: 70 })).toEqual(
      {
        processo: {
          status_processo: statusprocesso.FALHA,
          finalizado_em: now,
          tempo_execucao: 70,
        },
        tanques: {
          status_tanque_processo: statustanqueprocesso.FALHA,
          finalizado_em: now,
        },
      },
    );
  });
});
