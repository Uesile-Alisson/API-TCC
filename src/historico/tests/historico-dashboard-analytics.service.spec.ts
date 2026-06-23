import { beforeEach, describe, expect, it } from '@jest/globals';
import { severidadealarme, statusalarme, statusprocesso } from '@prisma/client';
import {
  HistoricoAnalyticsService,
  HistoricoDashboardAnalyticsService,
  type HistoricoDashboardAnalyticsInput,
  type HistoricoProcessAnalyticsInput,
  type HistoricoTankAnalyticsInput,
} from '../analytics';

describe('HistoricoDashboardAnalyticsService', () => {
  let service: HistoricoDashboardAnalyticsService;

  beforeEach(() => {
    service = new HistoricoDashboardAnalyticsService(
      new HistoricoAnalyticsService(),
    );
  });

  it('calculateKpis calcula totais, taxa de sucesso e medias', () => {
    const kpis = service.calculateKpis(makeDashboardInput());

    expect(kpis.total_processos).toBe(3);
    expect(kpis.total_concluidos).toBe(1);
    expect(kpis.total_interrompidos).toBe(1);
    expect(kpis.total_falhas).toBe(1);
    expect(kpis.taxa_sucesso_percentual).toBe(33.33);
    expect(kpis.eficiencia_media).toBe(80);
    expect(kpis.tempo_execucao_medio).toBe(100);
  });

  it('buildProcessStatusChart sempre retorna CONCLUIDO, INTERROMPIDO e FALHA', () => {
    expect(service.buildProcessStatusChart([])).toEqual([
      { status_processo: statusprocesso.CONCLUIDO, total: 0 },
      { status_processo: statusprocesso.INTERROMPIDO, total: 0 },
      { status_processo: statusprocesso.FALHA, total: 0 },
    ]);
  });

  it('buildAlarmSeverityChart sempre retorna INFO, MEDIO e CRITICO', () => {
    expect(service.buildAlarmSeverityChart([])).toEqual([
      { severidade: severidadealarme.INFO, total: 0 },
      { severidade: severidadealarme.MEDIO, total: 0 },
      { severidade: severidadealarme.CRITICO, total: 0 },
    ]);
  });

  it('buildProcessPeriodSeries agrupa por DIA e MES', () => {
    const processos = [
      makeProcess({ criado_em: new Date('2026-01-01T10:00:00Z') }),
      makeProcess({
        id_processo: 2,
        criado_em: new Date('2026-01-01T11:00:00Z'),
      }),
      makeProcess({
        id_processo: 3,
        criado_em: new Date('2026-02-01T10:00:00Z'),
      }),
    ];

    expect(
      service.buildProcessPeriodSeries({
        processos,
        agrupamento: 'DIA',
        campo_data: 'criado_em',
      }),
    ).toEqual([
      { periodo: '2026-01-01', valor: 2 },
      { periodo: '2026-02-01', valor: 1 },
    ]);
    expect(
      service.buildProcessPeriodSeries({
        processos,
        agrupamento: 'MES',
        campo_data: 'criado_em',
      }),
    ).toEqual([
      { periodo: '2026-01', valor: 2 },
      { periodo: '2026-02', valor: 1 },
    ]);
  });

  it('series de eficiencia e tempo calculam medias por periodo', () => {
    const processos = [
      makeProcess({
        criado_em: new Date('2026-01-01T10:00:00Z'),
        eficiencia: 80,
        tempo_execucao: 100,
      }),
      makeProcess({
        id_processo: 2,
        criado_em: new Date('2026-01-01T11:00:00Z'),
        eficiencia: 100,
        tempo_execucao: 200,
      }),
    ];

    expect(
      service.buildEfficiencyPeriodSeries({
        processos,
        agrupamento: 'DIA',
        campo_data: 'criado_em',
      }),
    ).toEqual([{ periodo: '2026-01-01', eficiencia_media: 90 }]);
    expect(
      service.buildExecutionTimePeriodSeries({
        processos,
        agrupamento: 'DIA',
        campo_data: 'criado_em',
      }),
    ).toEqual([{ periodo: '2026-01-01', tempo_execucao_medio: 150 }]);
  });

  it('buildTankComparison agrupa por tanque', () => {
    const result = service.buildTankComparison([
      makeTank({ id_tanque: 2, eficiencia: 80, total_alarmes: 1 }),
      makeTank({ id_tanque: 2, eficiencia: 100, total_alarmes: 2 }),
      makeTank({ id_tanque: 3, nome_tanque: 'Tanque 3' }),
    ]);

    expect(result[0]).toMatchObject({
      id_tanque: 2,
      total_processos: 2,
      eficiencia_media: 90,
      total_alarmes: 3,
    });
  });

  it('buildDashboardAnalytics retorna todos os blocos esperados sem acessar repository', () => {
    const result = service.buildDashboardAnalytics({
      input: makeDashboardInput(),
      agrupamento: 'DIA',
      campo_data: 'criado_em',
      ranking_limit: 2,
    });

    expect(result.kpis.total_processos).toBe(3);
    expect(result.processos_por_status).toHaveLength(3);
    expect(result.processos_por_periodo.length).toBeGreaterThan(0);
    expect(result.eficiencia_por_periodo.length).toBeGreaterThan(0);
    expect(result.tempo_execucao_por_periodo.length).toBeGreaterThan(0);
    expect(result.alarmes_por_severidade).toHaveLength(3);
    expect(result.comparativo_tanques.length).toBeGreaterThan(0);
    expect(result.processos_problematicos.length).toBeLessThanOrEqual(2);
  });
});

function makeDashboardInput(): HistoricoDashboardAnalyticsInput {
  return {
    processos: [
      makeProcess({
        status_processo: statusprocesso.CONCLUIDO,
        eficiencia: 90,
      }),
      makeProcess({
        id_processo: 2,
        status_processo: statusprocesso.INTERROMPIDO,
        eficiencia: 75,
      }),
      makeProcess({
        id_processo: 3,
        status_processo: statusprocesso.FALHA,
        eficiencia: 75,
        total_alarmes_criticos: 1,
      }),
    ],
    tanques: [makeTank()],
    alarmes: [
      {
        id_alarme: 1,
        severidade: severidadealarme.CRITICO,
        status_alarme: statusalarme.ATIVO,
        ocorrido_em: new Date('2026-01-01T10:00:00Z'),
        resolvido_em: null,
      },
    ],
    eventos: [],
  };
}

function makeProcess(
  overrides: Partial<HistoricoProcessAnalyticsInput> = {},
): HistoricoProcessAnalyticsInput {
  return {
    id_processo: 1,
    nome_processo: 'Processo',
    status_processo: statusprocesso.CONCLUIDO,
    vacuo_alvo: 12,
    vacuo_inicial: 0,
    vacuo_final: 11,
    vacuo_medio: 10,
    eficiencia: 90,
    tempo_maximo: 120,
    tempo_execucao: 100,
    iniciado_em: new Date('2026-01-01T10:00:00Z'),
    finalizado_em: new Date('2026-01-01T10:10:00Z'),
    criado_em: new Date('2026-01-01T09:50:00Z'),
    parada_emergencia: false,
    total_alarmes: 0,
    total_alarmes_criticos: 0,
    total_eventos: 0,
    possui_relatorio: false,
    ...overrides,
  };
}

function makeTank(
  overrides: Partial<HistoricoTankAnalyticsInput> = {},
): HistoricoTankAnalyticsInput {
  return {
    id_tanque: 2,
    nome_tanque: 'Tanque 2',
    vacuo_alvo: 12,
    vacuo_inicial: 0,
    vacuo_final: 11,
    vacuo_medio: 10,
    eficiencia: 90,
    tempo_execucao: 100,
    total_alarmes: 0,
    total_alarmes_criticos: 0,
    quantidade_leituras: 5,
    ...overrides,
  };
}
