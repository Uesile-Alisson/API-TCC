import {
  etapaencerramentotanque,
  statusprocesso,
  statusestagnacao,
  statusencerramentotanque,
  statustanqueprocesso,
  tipoeventoprocesso,
} from '@prisma/client';
import { ProcessoLifecycleService } from './processo-lifecycle.service';
import { beforeEach, describe, expect, it } from '@jest/globals';

describe('ProcessoLifecycleService', () => {
  const now = new Date('2026-06-20T12:00:00.000Z');
  const stagnationReset = {
    status_estagnacao: statusestagnacao.NORMAL,
    estagnacao_iniciada_em: null,
    estagnacao_detectada_em: null,
    estagnacao_ultima_avaliacao_em: null,
    estagnacao_variacao_vacuo: null,
    estagnacao_leituras_janela: 0,
    estagnacao_janelas_sem_progresso: 0,
  };
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
        status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
        iniciado_em: now,
        finalizado_em: null,
        vacuo_inicial: null,
        vacuo_final: null,
        vacuo_medio: null,
        vacuo_atingido: false,
        vacuo_estabilizado: false,
        status_encerramento: statusencerramentotanque.MONITORANDO,
        encerramento_iniciado_em: now,
        isolado_em: null,
        retencao_iniciada_em: null,
        retencao_finalizada_em: null,
        vacuo_isolamento: null,
        perda_vacuo_retencao: null,
        motivo_bloqueio_encerramento: null,
        etapa_encerramento: etapaencerramentotanque.NENHUMA,
        encerramento_tentativa: 0,
        encerramento_comando_tentativas: 0,
        encerramento_proxima_tentativa_em: null,
        estabilizacao_leituras_esperadas: 0,
        estabilizacao_leituras_observadas: 0,
        estabilizacao_cobertura_percentual: 0,
        estabilizacao_maior_intervalo_ms: 0,
        ...stagnationReset,
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

  it('buildResumeTransition preserva o lifecycle individual dos tanques', () => {
    expect(service.buildResumeTransition({ now })).toEqual({
      processo: {
        status_processo: statusprocesso.EM_EXECUCAO,
        retomado_em: now,
        pausado_em: null,
      },
    });
  });

  it('mantém GERANDO_VACUO enquanto a leitura está fora da tolerância', () => {
    const transition = service.buildTankReadingTransition({
      status_atual: statustanqueprocesso.GERANDO_VACUO,
      vacuo_atual: -60,
      vacuo_inicial: -5,
      vacuo_medio: -30,
      vacuo_alvo: -80,
      tolerancia_percentual: 10,
      alvo_atingido_em: null,
      leituras_desde_alvo: 0,
      now,
    });

    expect(transition).toMatchObject({
      status_atual: statustanqueprocesso.GERANDO_VACUO,
      status_mudou: false,
      dentro_tolerancia: false,
      tipo_evento: null,
      data: {
        vacuo_inicial: -5,
        vacuo_final: -60,
        vacuo_medio: -30,
        vacuo_atingido: false,
        vacuo_estabilizado: false,
      },
    });
  });

  it('marca VACUO_ATINGIDO ao entrar na tolerância', () => {
    const transition = service.buildTankReadingTransition({
      status_atual: statustanqueprocesso.GERANDO_VACUO,
      vacuo_atual: -76,
      vacuo_inicial: -5,
      vacuo_medio: -45,
      vacuo_alvo: -80,
      tolerancia_percentual: 10,
      alvo_atingido_em: null,
      leituras_desde_alvo: 0,
      now,
    });

    expect(transition.status_atual).toBe(statustanqueprocesso.VACUO_ATINGIDO);
    expect(transition.tipo_evento).toBe(tipoeventoprocesso.VACUO_ALVO_ATINGIDO);
    expect(transition.data.vacuo_atingido).toBe(true);
  });

  it('estabiliza somente após tempo e quantidade mínima de leituras', () => {
    const transition = service.buildTankReadingTransition({
      status_atual: statustanqueprocesso.VACUO_ATINGIDO,
      vacuo_atual: -81,
      vacuo_inicial: -5,
      vacuo_medio: -70,
      vacuo_alvo: -80,
      tolerancia_percentual: 10,
      alvo_atingido_em: new Date(now.getTime() - 31_000),
      leituras_desde_alvo: 3,
      now,
    });

    expect(transition.status_atual).toBe(
      statustanqueprocesso.VACUO_ESTABILIZADO,
    );
    expect(transition.tipo_evento).toBe(tipoeventoprocesso.TANQUE_ESTABILIZADO);
    expect(transition.data.vacuo_estabilizado).toBe(true);
    expect(transition.encerramento_status_atual).toBe(
      statusencerramentotanque.PRONTO_PARA_ENCERRAR,
    );
  });

  it('nao estabiliza sem cobertura minima de leituras', () => {
    const transition = service.buildTankReadingTransition({
      status_atual: statustanqueprocesso.VACUO_ATINGIDO,
      status_encerramento_atual:
        statusencerramentotanque.AGUARDANDO_ESTABILIZACAO,
      vacuo_atual: -80,
      vacuo_inicial: -5,
      vacuo_medio: -70,
      vacuo_alvo: -80,
      tolerancia_percentual: 10,
      alvo_atingido_em: new Date(now.getTime() - 31_000),
      leituras_desde_alvo: 20,
      leituras_esperadas: 30,
      cobertura_minima_percentual: 80,
      maior_intervalo_leitura_ms: 1000,
      timeout_leitura_sensor_ms: 2500,
      now,
    });

    expect(transition.status_atual).toBe(statustanqueprocesso.VACUO_ATINGIDO);
    expect(transition.estabilizacao.cobertura_percentual).toBe(66.67);
  });

  it('nao estabiliza quando existe lacuna maior que o timeout', () => {
    const transition = service.buildTankReadingTransition({
      status_atual: statustanqueprocesso.VACUO_ATINGIDO,
      vacuo_atual: -80,
      vacuo_inicial: -5,
      vacuo_medio: -70,
      vacuo_alvo: -80,
      tolerancia_percentual: 10,
      alvo_atingido_em: new Date(now.getTime() - 31_000),
      leituras_desde_alvo: 30,
      leituras_esperadas: 30,
      maior_intervalo_leitura_ms: 3000,
      timeout_leitura_sensor_ms: 2500,
      now,
    });

    expect(transition.status_atual).toBe(statustanqueprocesso.VACUO_ATINGIDO);
    expect(transition.estabilizacao.continuidade_aprovada).toBe(false);
  });

  it('aguarda acao humana quando o encerramento automatico esta desativado', () => {
    const transition = service.buildTankReadingTransition({
      status_atual: statustanqueprocesso.VACUO_ATINGIDO,
      vacuo_atual: -80,
      vacuo_inicial: -5,
      vacuo_medio: -70,
      vacuo_alvo: -80,
      tolerancia_percentual: 10,
      alvo_atingido_em: new Date(now.getTime() - 31_000),
      leituras_desde_alvo: 30,
      leituras_esperadas: 30,
      encerramento_automatico: false,
      now,
    });

    expect(transition.encerramento_status_atual).toBe(
      statusencerramentotanque.AGUARDANDO_ACAO_MANUAL,
    );
  });

  it('marca falha de encerramento ao exceder o limite de seguranca', () => {
    const transition = service.buildTankReadingTransition({
      status_atual: statustanqueprocesso.GERANDO_VACUO,
      vacuo_atual: -96,
      vacuo_inicial: -5,
      vacuo_medio: -80,
      vacuo_alvo: -80,
      tolerancia_percentual: 10,
      alvo_atingido_em: null,
      leituras_desde_alvo: 0,
      limite_seguranca_vacuo: -95,
      now,
    });

    expect(transition.limite_seguranca_excedido).toBe(true);
    expect(transition.encerramento_status_atual).toBe(
      statusencerramentotanque.FALHA,
    );
  });

  it('retorna a GERANDO_VACUO se perder a faixa antes da conclusão', () => {
    const transition = service.buildTankReadingTransition({
      status_atual: statustanqueprocesso.VACUO_ESTABILIZADO,
      vacuo_atual: -60,
      vacuo_inicial: -5,
      vacuo_medio: -70,
      vacuo_alvo: -80,
      tolerancia_percentual: 10,
      alvo_atingido_em: new Date(now.getTime() - 60_000),
      leituras_desde_alvo: 10,
      now,
    });

    expect(transition.status_atual).toBe(statustanqueprocesso.GERANDO_VACUO);
    expect(transition.data.vacuo_atingido).toBe(false);
    expect(transition.data.vacuo_estabilizado).toBe(false);
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
          status_encerramento: statusencerramentotanque.CONCLUIDO,
          etapa_encerramento: etapaencerramentotanque.CONCLUIDA,
          encerramento_proxima_tentativa_em: null,
          ...stagnationReset,
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
        status_encerramento: statusencerramentotanque.BLOQUEADO,
        etapa_encerramento: etapaencerramentotanque.NENHUMA,
        encerramento_proxima_tentativa_em: null,
        ...stagnationReset,
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
          status_encerramento: statusencerramentotanque.FALHA,
          etapa_encerramento: etapaencerramentotanque.FALHA,
          encerramento_proxima_tentativa_em: null,
          ...stagnationReset,
        },
      },
    );
  });
});
