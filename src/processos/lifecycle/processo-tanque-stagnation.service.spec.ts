import { describe, expect, it } from '@jest/globals';
import {
  statusestagnacao,
  statustanqueprocesso,
  tipoeventoprocesso,
} from '@prisma/client';
import {
  ProcessoTanqueStagnationInput,
  ProcessoTanqueStagnationService,
} from './processo-tanque-stagnation.service';

describe('ProcessoTanqueStagnationService', () => {
  const service = new ProcessoTanqueStagnationService();

  it('mantem NORMAL quando a janela apresenta progresso suficiente', () => {
    const transition = service.evaluate(
      makeInput({
        amostras: makeSamples([-20, -21, -22, -28, -29, -30]),
      }),
    );

    expect(transition).toMatchObject({
      status_atual: statusestagnacao.NORMAL,
      status_mudou: false,
      avaliado: true,
      tipo_evento: null,
      variacao_vacuo: 9,
    });
  });

  it('marca SUSPEITA na primeira janela sem progresso', () => {
    const transition = service.evaluate(
      makeInput({
        amostras: makeSamples([-40, -40.1, -40.2, -40.3, -40.4, -40.5]),
      }),
    );

    expect(transition).toMatchObject({
      status_anterior: statusestagnacao.NORMAL,
      status_atual: statusestagnacao.SUSPEITA,
      status_mudou: true,
      avaliado: true,
      tipo_evento: tipoeventoprocesso.ESTAGNACAO_SUSPEITA,
      data: {
        estagnacao_janelas_sem_progresso: 1,
      },
    });
  });

  it('confirma DETECTADA apos janelas consecutivas sem progresso', () => {
    const transition = service.evaluate(
      makeInput({
        status_atual: statusestagnacao.SUSPEITA,
        iniciada_em: new Date('2026-07-16T11:59:00.000Z'),
        ultima_avaliacao_em: new Date('2026-07-16T12:00:00.000Z'),
        janelas_sem_progresso: 1,
        avaliado_em: new Date('2026-07-16T12:01:00.000Z'),
        amostras: makeSamples(
          [-50, -50.1, -50.2, -50.3, -50.4, -50.5],
          '2026-07-16T12:00:00.000Z',
        ),
      }),
    );

    expect(transition).toMatchObject({
      status_anterior: statusestagnacao.SUSPEITA,
      status_atual: statusestagnacao.DETECTADA,
      status_mudou: true,
      tipo_evento: tipoeventoprocesso.ESTAGNACAO_DETECTADA,
      data: {
        estagnacao_janelas_sem_progresso: 2,
        estagnacao_detectada_em: new Date('2026-07-16T12:01:00.000Z'),
      },
    });
  });

  it('nao avalia antes de cobrir a janela e quantidade minima', () => {
    const transition = service.evaluate(
      makeInput({
        amostras: makeSamples([-40, -40.1, -40.2]),
      }),
    );

    expect(transition).toMatchObject({
      status_atual: statusestagnacao.NORMAL,
      avaliado: false,
      tipo_evento: null,
    });
  });

  it('normaliza quando o tanque atinge o alvo ou estabiliza', () => {
    const transition = service.evaluate(
      makeInput({
        status_tanque_processo: statustanqueprocesso.VACUO_ATINGIDO,
        status_atual: statusestagnacao.DETECTADA,
        iniciada_em: new Date('2026-07-16T11:58:00.000Z'),
        detectada_em: new Date('2026-07-16T11:59:00.000Z'),
        ultima_avaliacao_em: new Date('2026-07-16T12:00:00.000Z'),
        janelas_sem_progresso: 2,
      }),
    );

    expect(transition).toMatchObject({
      status_atual: statusestagnacao.NORMAL,
      status_mudou: true,
      tipo_evento: tipoeventoprocesso.ESTAGNACAO_NORMALIZADA,
      data: {
        estagnacao_iniciada_em: null,
        estagnacao_detectada_em: null,
        estagnacao_janelas_sem_progresso: 0,
      },
    });
  });

  it('descarta estado de uma execucao anterior apos retomada', () => {
    const transition = service.evaluate(
      makeInput({
        status_atual: statusestagnacao.SUSPEITA,
        iniciada_em: new Date('2026-07-16T11:58:00.000Z'),
        ultima_avaliacao_em: new Date('2026-07-16T11:59:00.000Z'),
        execucao_iniciada_em: new Date('2026-07-16T12:00:00.000Z'),
      }),
    );

    expect(transition).toMatchObject({
      status_atual: statusestagnacao.NORMAL,
      tipo_evento: tipoeventoprocesso.ESTAGNACAO_NORMALIZADA,
      avaliado: false,
    });
  });

  it('reduz o progresso esperado para tanque maior, tres tanques ativos e proximidade do alvo', () => {
    const transition = service.evaluate(
      makeInput({
        variacao_minima: 2,
        volume_tanque: 40,
        volume_medio_tanques_ativos: 20,
        tanques_ativos: 3,
        vacuo_alvo: -80,
        vacuo_atual: -78,
        fator_minimo_proximidade_alvo: 0.35,
        tempo_bomba_principal_segundos: 120,
        tempo_minimo_bomba_principal_segundos: 30,
        amostras: makeSamples([-77.4, -77.5, -77.6, -77.9, -78, -78.1]),
      }),
    );

    expect(transition.data.estagnacao_variacao_minima_ajustada).toBeLessThan(1);
    expect(transition.data).toMatchObject({
      estagnacao_tanques_ativos: 3,
      estagnacao_fator_volume: 0.5,
      estagnacao_tempo_bomba_principal_segundos: 120,
    });
    expect(transition.data.estagnacao_motivo_decisao).toContain('adaptativo');
  });

  it('nao avalia antes do tempo minimo da bomba principal', () => {
    const transition = service.evaluate(
      makeInput({
        tempo_bomba_principal_segundos: 10,
        tempo_minimo_bomba_principal_segundos: 30,
        amostras: makeSamples([-40, -40.1, -40.2, -40.3, -40.4, -40.5]),
      }),
    );

    expect(transition.avaliado).toBe(false);
    expect(transition.motivo).toContain('tempo minimo');
  });

  it('ignora janela quando a integridade da leitura nao e valida', () => {
    const transition = service.evaluate(
      makeInput({
        leitura_valida: false,
        amostras: makeSamples([-40, -40.1, -40.2, -40.3, -40.4, -40.5]),
      }),
    );

    expect(transition.avaliado).toBe(false);
    expect(transition.motivo).toContain('sensor');
  });

  function makeInput(
    overrides: Partial<ProcessoTanqueStagnationInput> = {},
  ): ProcessoTanqueStagnationInput {
    return {
      status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
      status_atual: statusestagnacao.NORMAL,
      iniciada_em: null,
      detectada_em: null,
      ultima_avaliacao_em: null,
      variacao_vacuo: null,
      leituras_janela: 0,
      janelas_sem_progresso: 0,
      janela_segundos: 60,
      variacao_minima: 2,
      leituras_minimas: 5,
      janelas_consecutivas: 2,
      execucao_iniciada_em: new Date('2026-07-16T11:59:00.000Z'),
      avaliado_em: new Date('2026-07-16T12:00:00.000Z'),
      amostras: [],
      ...overrides,
    };
  }

  function makeSamples(values: number[], start = '2026-07-16T11:59:00.000Z') {
    const startTime = new Date(start).getTime();
    const interval = values.length > 1 ? 60_000 / (values.length - 1) : 0;

    return values.map((valor_vacuo, index) => ({
      valor_vacuo,
      recebido_em: new Date(startTime + interval * index),
    }));
  }
});
