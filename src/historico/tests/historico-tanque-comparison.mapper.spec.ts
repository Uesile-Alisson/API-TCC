import { beforeEach, describe, expect, it } from '@jest/globals';
import { HistoricoTanqueComparisonMapper } from '../mappers';

type RankingRaw = Parameters<
  HistoricoTanqueComparisonMapper['toRankingItem']
>[0];

describe('HistoricoTanqueComparisonMapper', () => {
  let mapper: HistoricoTanqueComparisonMapper;

  beforeEach(() => {
    mapper = new HistoricoTanqueComparisonMapper();
  });

  it('converte ranking por tanque e medias decimal-like', () => {
    const result = mapper.toRankingItem(
      makeRankingRaw({
        eficiencia_media: { toString: () => '95.5' },
        tempo_execucao_medio: '100.25',
        vacuo_medio: 11.75,
      }),
    );

    expect(result).toMatchObject({
      id_tanque: 2,
      nome_tanque: 'Tanque 2',
      total_processos: 3,
      total_concluidos: 2,
      total_falhas: 1,
      eficiencia_media: 95.5,
      tempo_execucao_medio: 100.25,
      vacuo_medio: 11.75,
    });
  });

  it('retorna response com array data', () => {
    expect(mapper.toResponse([makeRankingRaw()])).toEqual({
      data: [mapper.toRankingItem(makeRankingRaw())],
    });
  });
});

function makeRankingRaw(overrides: Record<string, unknown> = {}): RankingRaw {
  return {
    id_tanque: 2,
    nome_tanque: 'Tanque 2',
    total_processos: 3,
    total_concluidos: 2,
    total_falhas: 1,
    eficiencia_media: '95',
    tempo_execucao_medio: '100',
    vacuo_medio: '11',
    total_alarmes: 4,
    total_alarmes_criticos: 1,
    ...overrides,
  };
}
