import { beforeEach, describe, expect, it } from '@jest/globals';
import { statusprocesso } from '@prisma/client';
import {
  HistoricoAnalyticsService,
  type HistoricoProcessAnalyticsInput,
} from '../analytics';

describe('HistoricoAnalyticsService', () => {
  let service: HistoricoAnalyticsService;

  beforeEach(() => {
    service = new HistoricoAnalyticsService();
  });

  it('calculateSuccessRate retorna 0 sem total e calcula percentual com 2 casas', () => {
    expect(service.calculateSuccessRate(0, 1)).toBe(0);
    expect(service.calculateSuccessRate(3, 2)).toBe(66.67);
  });

  it('calculateAverage ignora valores invalidos e retorna null sem valores validos', () => {
    expect(
      service.calculateAverage([
        10,
        null,
        undefined,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        20,
      ]),
    ).toBe(15);
    expect(service.calculateAverage([null, undefined, Number.NaN])).toBeNull();
  });

  it('calculateSum soma valores validos', () => {
    expect(service.calculateSum([1, null, 2, Number.NaN, 3])).toBe(6);
  });

  it('calculateAlarmAverage retorna null sem processos', () => {
    expect(service.calculateAlarmAverage(5, 0)).toBeNull();
    expect(service.calculateAlarmAverage(5, 2)).toBe(2.5);
  });

  it('calculateVacuumDeviation retorna diferenca absoluta', () => {
    expect(service.calculateVacuumDeviation(12, 10.5)).toBe(1.5);
    expect(service.calculateVacuumDeviation(null, 10)).toBeNull();
  });

  it('classifyProcessResult classifica FALHA, parada emergencial e alarme critico como CRITICO', () => {
    expect(
      service.classifyProcessResult(
        makeProcess({ status_processo: statusprocesso.FALHA }),
      ).classificacao_resultado,
    ).toBe('CRITICO');
    expect(
      service.classifyProcessResult(makeProcess({ parada_emergencia: true }))
        .classificacao_resultado,
    ).toBe('CRITICO');
    expect(
      service.classifyProcessResult(makeProcess({ total_alarmes_criticos: 1 }))
        .classificacao_resultado,
    ).toBe('CRITICO');
  });

  it('classifyProcessResult retorna ATENCAO para INTERROMPIDO e NORMAL para concluido sem problema', () => {
    expect(
      service.classifyProcessResult(
        makeProcess({ status_processo: statusprocesso.INTERROMPIDO }),
      ).classificacao_resultado,
    ).toBe('ATENCAO');
    expect(
      service.classifyProcessResult(makeProcess()).classificacao_resultado,
    ).toBe('NORMAL');
  });

  it('calculateProblemScore pontua problemas', () => {
    expect(
      service.calculateProblemScore(
        makeProcess({
          status_processo: statusprocesso.FALHA,
          parada_emergencia: true,
          total_alarmes_criticos: 2,
          eficiencia: 40,
        }),
      ),
    ).toBeGreaterThan(100);
  });

  it('getProblematicProcesses ordena por score, aplica limit e nao muta array original', () => {
    const processes = [
      makeProcess({ id_processo: 1 }),
      makeProcess({ id_processo: 2, total_alarmes_criticos: 1 }),
      makeProcess({ id_processo: 3, status_processo: statusprocesso.FALHA }),
    ];
    const originalIds = processes.map((process) => process.id_processo);

    const result = service.getProblematicProcesses(processes, 1);

    expect(result).toHaveLength(1);
    expect(result[0].processo.id_processo).toBe(3);
    expect(processes.map((process) => process.id_processo)).toEqual(
      originalIds,
    );
  });
});

function makeProcess(
  overrides: Partial<HistoricoProcessAnalyticsInput> = {},
): HistoricoProcessAnalyticsInput {
  return {
    id_processo: 10,
    nome_processo: 'Processo',
    status_processo: statusprocesso.CONCLUIDO,
    vacuo_alvo: 12,
    vacuo_inicial: 0,
    vacuo_final: 12,
    vacuo_medio: 11,
    eficiencia: 95,
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
