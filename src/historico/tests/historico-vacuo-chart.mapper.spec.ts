import { beforeEach, describe, expect, it } from '@jest/globals';
import { HistoricoVacuoChartMapper } from '../mappers';

type ChartPointRaw = Parameters<HistoricoVacuoChartMapper['toPoint']>[0];

describe('HistoricoVacuoChartMapper', () => {
  let mapper: HistoricoVacuoChartMapper;

  beforeEach(() => {
    mapper = new HistoricoVacuoChartMapper();
  });

  it('converte ponto de vacuo e total_pontos', () => {
    const response = mapper.toResponse({
      id_processo: 10,
      vacuo_alvo: '12.5',
      data: [makePointRaw({ valor_vacuo: '11.8' })],
    });

    expect(response.id_processo).toBe(10);
    expect(response.vacuo_alvo).toBe(12.5);
    expect(response.total_pontos).toBe(1);
    expect(response.data[0]).toMatchObject({
      valor_vacuo: 11.8,
      nome_sensor: 'Sensor 3',
      nome_tanque: 'Tanque 2',
    });
  });

  it('usa fallback para sensor e tanque nao identificados', () => {
    const point = mapper.toPoint(
      makePointRaw({ processostanquessensores: null }),
    );

    expect(point.id_tanque).toBe(0);
    expect(point.nome_tanque).toContain('identificado');
    expect(point.id_sensor).toBe(0);
    expect(point.nome_sensor).toContain('identificado');
  });

  it('nao adiciona vazao, nivel, volume ou oleo', () => {
    const point = mapper.toPoint(makePointRaw());

    expect(point).not.toHaveProperty('vazao');
    expect(point).not.toHaveProperty('nivel');
    expect(point).not.toHaveProperty('volume');
    expect(point).not.toHaveProperty('oleo');
  });
});

function makePointRaw(overrides: Record<string, unknown> = {}): ChartPointRaw {
  return {
    id_leitura_sensor: 1,
    id_processo_tanque_sensor: 2,
    valor_vacuo: '10.5',
    leitura_em: new Date('2026-01-01T10:00:00Z'),
    recebido_em: new Date('2026-01-01T10:00:01Z'),
    processostanquessensores: {
      id_sensor: 3,
      sensores: {
        id_sensor: 3,
        nome: 'Sensor 3',
      },
      processostanques: {
        id_tanque: 2,
        tanques: {
          id_tanque: 2,
          nome: 'Tanque 2',
        },
      },
    },
    ...overrides,
  };
}
