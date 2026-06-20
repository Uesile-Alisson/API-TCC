import { ProcessoMetricsService } from './processo-metrics.service';
import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  ProcessoMetricReading,
  ProcessoMetricTanque,
} from './processo-metrics.types';

describe('ProcessoMetricsService', () => {
  let service: ProcessoMetricsService;

  beforeEach(() => {
    service = new ProcessoMetricsService();
  });

  const makeReading = (
    valor_vacuo: number | null,
    leitura_em: Date,
    overrides: Partial<ProcessoMetricReading> = {},
  ): ProcessoMetricReading => ({
    id_leitura_sensor: 1,
    id_processo_tanque_sensor: 1,
    id_processo_tanque: 10,
    id_tanque: 20,
    valor_vacuo,
    leitura_em,
    ...overrides,
  });

  describe('calculateVacuoInicial', () => {
    it('retorna a primeira leitura valida por data', () => {
      const result = service.calculateVacuoInicial([
        makeReading(-30, new Date('2026-01-01T00:03:00Z')),
        makeReading(-10, new Date('2026-01-01T00:01:00Z')),
        makeReading(-20, new Date('2026-01-01T00:02:00Z')),
      ]);

      expect(result).toBe(-10);
    });

    it('ignora leitura nula', () => {
      const result = service.calculateVacuoInicial([
        makeReading(null, new Date('2026-01-01T00:01:00Z')),
        makeReading(-20, new Date('2026-01-01T00:02:00Z')),
      ]);

      expect(result).toBe(-20);
    });
  });

  describe('calculateVacuoFinal', () => {
    it('retorna a ultima leitura valida por data', () => {
      const result = service.calculateVacuoFinal([
        makeReading(-30, new Date('2026-01-01T00:03:00Z')),
        makeReading(-10, new Date('2026-01-01T00:01:00Z')),
        makeReading(-20, new Date('2026-01-01T00:02:00Z')),
      ]);

      expect(result).toBe(-30);
    });
  });

  describe('calculateVacuoMedio', () => {
    it('calcula media simples das leituras validas', () => {
      const result = service.calculateVacuoMedio([
        makeReading(-10, new Date('2026-01-01T00:01:00Z')),
        makeReading(-20, new Date('2026-01-01T00:02:00Z')),
        makeReading(-30, new Date('2026-01-01T00:03:00Z')),
      ]);

      expect(result).toBe(-20);
    });

    it('retorna null sem leituras validas', () => {
      const result = service.calculateVacuoMedio([
        makeReading(null, new Date('2026-01-01T00:01:00Z')),
      ]);

      expect(result).toBeNull();
    });
  });

  describe('calculateEficiencia', () => {
    it('calcula eficiencia usando valores absolutos', () => {
      const result = service.calculateEficiencia({
        vacuo_alvo: -80,
        vacuo_final: -72,
      });

      expect(result).toBe(90);
    });

    it('retorna null se vacuo final for null', () => {
      const result = service.calculateEficiencia({
        vacuo_alvo: -80,
        vacuo_final: null,
      });

      expect(result).toBeNull();
    });

    it('retorna null se vacuo alvo for zero', () => {
      const result = service.calculateEficiencia({
        vacuo_alvo: 0,
        vacuo_final: -72,
      });

      expect(result).toBeNull();
    });
  });

  describe('calculateTempoExecucao', () => {
    it('retorna tempo_execucao quando ja estiver preenchido', () => {
      const result = service.calculateTempoExecucao({
        iniciado_em: new Date('2026-01-01T00:00:00Z'),
        finalizado_em: new Date('2026-01-01T00:10:00Z'),
        tempo_execucao: 123,
      });

      expect(result).toBe(123);
    });

    it('calcula diferenca entre datas em segundos', () => {
      const result = service.calculateTempoExecucao({
        iniciado_em: new Date('2026-01-01T00:00:00Z'),
        finalizado_em: new Date('2026-01-01T00:10:00Z'),
        tempo_execucao: null,
      });

      expect(result).toBe(600);
    });

    it('retorna null se datas forem invalidas ou incompletas', () => {
      const missingDateResult = service.calculateTempoExecucao({
        iniciado_em: null,
        finalizado_em: new Date('2026-01-01T00:10:00Z'),
        tempo_execucao: null,
      });
      const invalidDateResult = service.calculateTempoExecucao({
        iniciado_em: new Date('invalid'),
        finalizado_em: new Date('2026-01-01T00:10:00Z'),
        tempo_execucao: null,
      });

      expect(missingDateResult).toBeNull();
      expect(invalidDateResult).toBeNull();
    });
  });

  describe('calculateTanqueMetrics', () => {
    it('calcula metricas do tanque corretamente', () => {
      const tanque = makeTanque([
        makeReading(-10, new Date('2026-01-01T00:01:00Z')),
        makeReading(-30, new Date('2026-01-01T00:03:00Z')),
        makeReading(-20, new Date('2026-01-01T00:02:00Z')),
        makeReading(null, new Date('2026-01-01T00:04:00Z')),
      ]);

      const result = service.calculateTanqueMetrics(tanque);

      expect(result).toEqual({
        id_processo_tanque: 10,
        id_tanque: 20,
        nome_tanque: 'Tanque A',
        vacuo_alvo: -80,
        vacuo_inicial: -10,
        vacuo_final: -30,
        vacuo_medio: -20,
        eficiencia: 37.5,
        total_leituras: 3,
      });
    });
  });

  describe('calculateProcessMetrics', () => {
    it('calcula metricas gerais com multiplos tanques', () => {
      const tanqueA = makeTanque([
        makeReading(-10, new Date('2026-01-01T00:01:00Z')),
        makeReading(-30, new Date('2026-01-01T00:03:00Z')),
      ]);
      const tanqueB = makeTanque(
        [
          makeReading(-20, new Date('2026-01-01T00:01:00Z'), {
            id_processo_tanque_sensor: 2,
          }),
          makeReading(-70, new Date('2026-01-01T00:03:00Z'), {
            id_processo_tanque_sensor: 2,
          }),
        ],
        {
          id_processo_tanque: 11,
          id_tanque: 21,
          nome_tanque: 'Tanque B',
          vacuo_alvo: -100,
        },
      );

      const result = service.calculateProcessMetrics({
        id_processo: 1,
        iniciado_em: new Date('2026-01-01T00:00:00Z'),
        finalizado_em: new Date('2026-01-01T00:05:00Z'),
        tempo_execucao: null,
        tanques: [tanqueA, tanqueB],
        total_alarmes: 2,
        total_eventos: 3,
      });

      expect(result.id_processo).toBe(1);
      expect(result.vacuo_alvo).toBe(-90);
      expect(result.vacuo_inicial).toBe(-15);
      expect(result.vacuo_final).toBe(-50);
      expect(result.vacuo_medio).toBe(-32.5);
      expect(result.eficiencia).toBe(53.75);
      expect(result.tempo_execucao).toBe(300);
      expect(result.total_tanques).toBe(2);
      expect(result.total_sensores).toBe(2);
      expect(result.total_leituras).toBe(4);
      expect(result.total_alarmes).toBe(2);
      expect(result.total_eventos).toBe(3);
      expect(result.tanques).toHaveLength(2);
    });
  });

  const makeTanque = (
    leituras: ProcessoMetricReading[],
    overrides: Partial<ProcessoMetricTanque> = {},
  ): ProcessoMetricTanque => ({
    id_processo_tanque: 10,
    id_tanque: 20,
    nome_tanque: 'Tanque A',
    vacuo_alvo: -80,
    leituras,
    ...overrides,
  });
});
