import { describe, expect, it } from '@jest/globals';
import {
  motivoresolucaoalarme,
  statusalarme,
  statusprocesso,
} from '@prisma/client';
import {
  AlarmResolutionPolicyService,
  type AlarmResolutionPolicySubject,
} from '../services/alarm-resolution-policy.service';

function makeAlarm(
  overrides: Partial<AlarmResolutionPolicySubject> = {},
): AlarmResolutionPolicySubject {
  return {
    status_alarme: statusalarme.ATIVO,
    bloqueante: false,
    requer_intervencao: false,
    recuperacao_automatica: false,
    processos: {
      status_processo: statusprocesso.EM_EXECUCAO,
    },
    ...overrides,
  };
}

describe('AlarmResolutionPolicyService', () => {
  const service = new AlarmResolutionPolicyService();

  it('bloqueia ATIVO + EM_EXECUCAO', () => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.ATIVO,
        processos: { status_processo: statusprocesso.EM_EXECUCAO },
      }),
    );

    expect(result).toMatchObject({
      allowed: false,
      motivo_resolucao: null,
    });
  });

  it('bloqueia ATIVO + PAUSADO', () => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.ATIVO,
        processos: { status_processo: statusprocesso.PAUSADO },
      }),
    );

    expect(result).toMatchObject({
      allowed: false,
      motivo_resolucao: null,
    });
  });

  it('bloqueia ATIVO + CONFIGURADO', () => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.ATIVO,
        processos: { status_processo: statusprocesso.CONFIGURADO },
      }),
    );

    expect(result).toMatchObject({
      allowed: false,
      motivo_resolucao: null,
    });
  });

  it('permite NORMALIZADO + CONFIGURADO', () => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.NORMALIZADO,
        processos: { status_processo: statusprocesso.CONFIGURADO },
      }),
    );

    expect(result).toMatchObject({
      allowed: true,
      motivo_resolucao:
        motivoresolucaoalarme.NORMALIZADO_CONFIRMADO_PELO_USUARIO,
    });
  });

  it.each([
    statusprocesso.CONCLUIDO,
    statusprocesso.INTERROMPIDO,
    statusprocesso.FALHA,
  ])('permite ATIVO + %s como FECHAMENTO_POS_PROCESSO', (status) => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.ATIVO,
        processos: { status_processo: status },
      }),
    );

    expect(result).toMatchObject({
      allowed: true,
      motivo_resolucao: motivoresolucaoalarme.FECHAMENTO_POS_PROCESSO,
    });
  });

  it('bloqueia alarme sem processo + bloqueante + ATIVO', () => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.ATIVO,
        bloqueante: true,
        processos: null,
      }),
    );

    expect(result).toMatchObject({
      allowed: false,
      motivo_resolucao: null,
    });
  });

  it('bloqueia alarme sem processo + requer intervencao + ATIVO', () => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.ATIVO,
        requer_intervencao: true,
        processos: null,
      }),
    );

    expect(result).toMatchObject({
      allowed: false,
      motivo_resolucao: null,
    });
  });

  it('bloqueia alarme sem processo + recuperacao automatica + ATIVO', () => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.ATIVO,
        recuperacao_automatica: true,
        processos: null,
      }),
    );

    expect(result).toMatchObject({
      allowed: false,
      motivo_resolucao: null,
    });
  });

  it('permite alarme sem processo + NORMALIZADO', () => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.NORMALIZADO,
        bloqueante: true,
        requer_intervencao: true,
        recuperacao_automatica: true,
        processos: null,
      }),
    );

    expect(result).toMatchObject({
      allowed: true,
      motivo_resolucao:
        motivoresolucaoalarme.NORMALIZADO_CONFIRMADO_PELO_USUARIO,
    });
  });

  it('permite alarme sem processo + ATIVO informativo sem risco tecnico', () => {
    const result = service.decide(
      makeAlarm({
        status_alarme: statusalarme.ATIVO,
        processos: null,
      }),
    );

    expect(result).toMatchObject({
      allowed: true,
      motivo_resolucao: motivoresolucaoalarme.FECHAMENTO_POS_PROCESSO,
    });
  });
});
