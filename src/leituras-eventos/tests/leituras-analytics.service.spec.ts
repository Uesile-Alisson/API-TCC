import { LeiturasAnalyticsService } from '../analytics';
import type { LeituraAnalyticsInput } from '../analytics';
import { beforeEach, describe, expect, it } from '@jest/globals';

describe('LeiturasAnalyticsService', () => {
  let service: LeiturasAnalyticsService;

  beforeEach(() => {
    service = new LeiturasAnalyticsService();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('deve normalizar leitura', () => {
    const normalized = service.normalizeLeitura({
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: '10.5',
      leitura_em: new Date('2026-01-01T10:00:00Z'),
    });

    expect(normalized.valor_vacuo).toBe(10.5);
    expect(normalized.recebido_em).toBeNull();
  });

  it('deve normalizar lista vazia e preenchida', () => {
    const leituras = buildLeituras();

    expect(service.normalizeLeituras([])).toEqual([]);
    expect(service.normalizeLeituras(leituras)).toHaveLength(3);
  });

  it('deve calcular totais de leituras validas e invalidas', () => {
    const leituras = buildLeituras();

    expect(service.calculateTotalLeituras(leituras)).toBe(3);
    expect(service.calculateTotalLeiturasValidas(leituras)).toBe(2);
    expect(service.calculateTotalLeiturasInvalidas(leituras)).toBe(1);
  });

  it('deve calcular minimo, maximo e media de vacuo', () => {
    const leituras = buildLeituras();

    expect(service.calculateVacuoMinimo(leituras)).toBe(10);
    expect(service.calculateVacuoMaximo(leituras)).toBe(14);
    expect(service.calculateVacuoMedio(leituras)).toBe(12);
    expect(service.calculateVacuoMinimo([])).toBeNull();
    expect(service.calculateVacuoMaximo([])).toBeNull();
    expect(service.calculateVacuoMedio([])).toBeNull();
  });

  it('deve calcular primeira e ultima leitura sem mutar array', () => {
    const leituras = buildLeituras();
    const originalIds = leituras.map((leitura) => leitura.id_leitura_sensor);

    expect(service.calculatePrimeiraLeitura(leituras)?.id_leitura_sensor).toBe(
      2,
    );
    expect(service.calculateUltimaLeitura(leituras)?.id_leitura_sensor).toBe(3);
    expect(leituras.map((leitura) => leitura.id_leitura_sensor)).toEqual(
      originalIds,
    );
  });

  it('deve calcular variacao de vacuo cronologica', () => {
    expect(service.calculateVariacaoVacuo(buildLeituras())).toBe(4);
    expect(service.calculateVariacaoVacuo([buildLeituras()[0]])).toBe(0);
    expect(
      service.calculateVariacaoVacuo([
        {
          id_leitura_sensor: 1,
          id_processo_tanque_sensor: 2,
          valor_vacuo: 'invalido',
          leitura_em: new Date('2026-01-01T10:00:00Z'),
        },
      ]),
    ).toBeNull();
  });

  it('deve calcular periodo de analise', () => {
    const periodo = service.calculatePeriodoAnalise(buildLeituras());

    expect(periodo.inicio).toEqual(new Date('2026-01-01T09:00:00Z'));
    expect(periodo.fim).toEqual(new Date('2026-01-01T11:00:00Z'));
    expect(periodo.duracao_ms).toBe(7200000);
    expect(periodo.duracao_segundos).toBe(7200);
    expect(periodo.duracao_minutos).toBe(120);
    expect(service.calculatePeriodoAnalise([])).toEqual({
      inicio: null,
      fim: null,
      duracao_ms: null,
      duracao_segundos: null,
      duracao_minutos: null,
    });
  });

  it('deve calcular stats e analytics completos', () => {
    const stats = service.calculateStats(buildLeituras());
    const analytics = service.calculateAnalytics(buildLeituras());

    expect(stats.total_leituras).toBe(3);
    expect(stats.vacuo_medio).toBe(12);
    expect(analytics.stats).toEqual(stats);
    expect(analytics.periodo.inicio).toEqual(new Date('2026-01-01T09:00:00Z'));
    expect(analytics.generated_at).toBeInstanceOf(Date);
  });

  it('deve arredondar metricas e rejeitar valores invalidos', () => {
    expect(service.roundMetric(1.2345, 2)).toBe(1.23);
    expect(service.roundMetric(1.987, 0)).toBe(2);
    expect(service.roundMetric(1.1234567, 10)).toBe(1.123457);
    expect(service.roundMetric(null)).toBeNull();
    expect(service.roundMetric(undefined)).toBeNull();
    expect(service.roundMetric(Number.NaN)).toBeNull();
    expect(service.roundMetric(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('deve converter valores numericos', () => {
    expect(service.toNumberOrNull(1)).toBe(1);
    expect(service.toNumberOrNull('2.5')).toBe(2.5);
    expect(service.toNumberOrNull({ toNumber: () => 3.5 })).toBe(3.5);
    expect(service.toNumberOrNull({ toString: () => '4.5' })).toBe(4.5);
    expect(service.toNumberOrNull('')).toBeNull();
    expect(service.toNumberOrNull('x')).toBeNull();
  });
});

function buildLeituras(): LeituraAnalyticsInput[] {
  return [
    {
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: 10,
      leitura_em: new Date('2026-01-01T10:00:00Z'),
      recebido_em: new Date('2026-01-01T10:00:01Z'),
    },
    {
      id_leitura_sensor: 2,
      id_processo_tanque_sensor: 2,
      valor_vacuo: 'invalido',
      leitura_em: new Date('2026-01-01T09:00:00Z'),
    },
    {
      id_leitura_sensor: 3,
      id_processo_tanque_sensor: 3,
      valor_vacuo: 14,
      leitura_em: new Date('2026-01-01T11:00:00Z'),
    },
  ];
}
