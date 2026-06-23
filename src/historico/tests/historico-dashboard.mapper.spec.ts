import { beforeEach, describe, expect, it } from '@jest/globals';
import { HistoricoDashboardMapper } from '../mappers';

type DashboardInput = Parameters<
  HistoricoDashboardMapper['toDashboardResponse']
>[0];

describe('HistoricoDashboardMapper', () => {
  let mapper: HistoricoDashboardMapper;

  beforeEach(() => {
    mapper = new HistoricoDashboardMapper();
  });

  it('monta dashboard response sem calcular KPI', () => {
    const kpis = makeKpis();
    const input = {
      kpis,
      processos_por_status: [{ status_processo: 'CONCLUIDO', total: 1 }],
      processos_por_periodo: [{ periodo: '2026-01-01', valor: 1 }],
      eficiencia_por_periodo: [{ periodo: '2026-01-01', eficiencia_media: 95 }],
      tempo_execucao_por_periodo: [
        { periodo: '2026-01-01', tempo_execucao_medio: 100 },
      ],
      alarmes_por_severidade: [{ severidade: 'CRITICO', total: 1 }],
      comparativo_tanques: [{ id_tanque: 2, nome_tanque: 'Tanque 2' }],
      processos_problematicos: [{ id_processo: 10 }],
    } as unknown as DashboardInput;

    const result = mapper.toDashboardResponse(input);

    expect(result.kpis).toBe(kpis);
    expect(result.processos_por_status).toBe(input.processos_por_status);
    expect(result.comparativo_tanques).toBe(input.comparativo_tanques);
  });

  it('garante arrays vazios quando input vier vazio', () => {
    const result = mapper.toDashboardResponse({
      kpis: makeKpis(),
    });

    expect(result.processos_por_status).toEqual([]);
    expect(result.processos_por_periodo).toEqual([]);
    expect(result.eficiencia_por_periodo).toEqual([]);
    expect(result.tempo_execucao_por_periodo).toEqual([]);
    expect(result.alarmes_por_severidade).toEqual([]);
    expect(result.comparativo_tanques).toEqual([]);
    expect(result.processos_problematicos).toEqual([]);
  });
});

function makeKpis() {
  return {
    total_processos: 1,
    total_concluidos: 1,
    total_interrompidos: 0,
    total_falhas: 0,
    taxa_sucesso_percentual: 100,
    eficiencia_media: 95,
    tempo_execucao_medio: 100,
    tempo_execucao_total: 100,
    vacuo_medio_geral: 11,
    vacuo_final_medio: 12,
    processos_com_parada_emergencia: 0,
    total_alarmes: 1,
    total_alarmes_criticos: 0,
    media_alarmes_por_processo: 1,
  };
}
