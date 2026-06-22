import { GRAFICO_VACUO_MAX_LIMIT } from '../constants';
import type { LeituraChartPoint } from '../interfaces';
import { GraficoVacuoMapper } from '../mappers';
import { beforeEach, describe, expect, it } from '@jest/globals';

type GraficoVacuoLeituraRaw = Parameters<GraficoVacuoMapper['toChartPoint']>[0];
type GraficoVacuoResponseInput = Parameters<
  GraficoVacuoMapper['toChartResponse']
>[0];

describe('GraficoVacuoMapper', () => {
  let mapper: GraficoVacuoMapper;

  beforeEach(() => {
    mapper = new GraficoVacuoMapper();
  });

  it('deve estar definido', () => {
    expect(mapper).toBeDefined();
  });

  it('deve mapear leitura para ponto do grafico', () => {
    const leitura: GraficoVacuoLeituraRaw = {
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: '9.5',
      leitura_em: new Date('2026-01-01T10:00:00Z'),
    };

    expect(mapper.toChartPoint(leitura)).toEqual({
      timestamp: leitura.leitura_em,
      valor_vacuo: 9.5,
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
    });
  });

  it('deve montar resposta do grafico', () => {
    const leitura: GraficoVacuoLeituraRaw = {
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: { toNumber: () => 8.25 },
      leitura_em: new Date('2026-01-01T10:00:00Z'),
    };
    const input: GraficoVacuoResponseInput = {
      id_processo: 3,
      id_processo_tanque_sensor: 2,
      vacuo_alvo: '12',
      leituras: [leitura],
      intervalo: 'RAW',
      limit: 10,
    };

    const response = mapper.toChartResponse(input);

    expect(response.id_processo).toBe(3);
    expect(response.id_processo_tanque_sensor).toBe(2);
    expect(response.vacuo_alvo).toBe(12);
    expect(response.pontos).toHaveLength(1);
    expect(response.total_pontos).toBe(1);
    expect(response.intervalo).toBe('RAW');
    expect(response.generated_at).toBeInstanceOf(Date);
  });

  it('deve limitar pontos sem mutar array original', () => {
    const pontos: LeituraChartPoint[] = [
      {
        timestamp: new Date('2026-01-01T10:00:00Z'),
        valor_vacuo: 1,
        id_leitura_sensor: 1,
        id_processo_tanque_sensor: 2,
      },
      {
        timestamp: new Date('2026-01-01T10:01:00Z'),
        valor_vacuo: 2,
        id_leitura_sensor: 2,
        id_processo_tanque_sensor: 2,
      },
    ];
    const original = [...pontos];

    expect(mapper.limitChartPoints(pontos, 1)).toHaveLength(1);
    expect(mapper.limitChartPoints(pontos, 0)).toEqual(pontos);
    expect(
      mapper.limitChartPoints(pontos, GRAFICO_VACUO_MAX_LIMIT + 1),
    ).toEqual(pontos);
    expect(pontos).toEqual(original);
  });
});
