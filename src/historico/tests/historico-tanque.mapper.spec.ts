import { beforeEach, describe, expect, it } from '@jest/globals';
import { statustanqueprocesso } from '@prisma/client';
import { HistoricoTanqueMapper } from '../mappers';

type TanqueRaw = Parameters<HistoricoTanqueMapper['toSummary']>[0];

describe('HistoricoTanqueMapper', () => {
  let mapper: HistoricoTanqueMapper;

  beforeEach(() => {
    mapper = new HistoricoTanqueMapper();
  });

  it('converte dados de tanque, vacuo e eficiencia', () => {
    const result = mapper.toSummary(
      makeTanqueRaw({
        tanques: {
          id_tanque: 2,
          nome: 'Tanque 2',
        },
        vacuo_alvo: '12.5',
        vacuo_inicial: 1,
        vacuo_final: { toString: () => '11.8' },
        vacuo_medio: null,
        eficiencia: undefined,
      }),
    );

    expect(result.nome_tanque).toBe('Tanque 2');
    expect(result.vacuo_alvo).toBe(12.5);
    expect(result.vacuo_inicial).toBe(1);
    expect(result.vacuo_final).toBe(11.8);
    expect(result.vacuo_medio).toBeNull();
    expect(result.eficiencia).toBeNull();
  });

  it('aplica fallback de nome e contadores seguros', () => {
    const result = mapper.toSummary(
      makeTanqueRaw({
        tanques: null,
        quantidade_leituras: undefined,
        total_alarmes: -3,
        total_alarmes_criticos: undefined,
        _count: {},
      }),
    );

    expect(result.nome_tanque).toContain('identificado');
    expect(result.quantidade_sensores).toBe(0);
    expect(result.quantidade_leituras).toBe(0);
    expect(result.total_alarmes).toBe(0);
    expect(result.total_alarmes_criticos).toBe(0);
  });

  it('toSummaryList converte lista', () => {
    expect(mapper.toSummaryList([makeTanqueRaw()])).toHaveLength(1);
  });
});

function makeTanqueRaw(overrides: Record<string, unknown> = {}): TanqueRaw {
  return {
    id_processo_tanque: 20,
    id_tanque: 2,
    tanques: {
      id_tanque: 2,
      nome: 'Tanque 2',
    },
    status_tanque_processo: statustanqueprocesso.CONCLUIDO,
    vacuo_alvo: '12',
    vacuo_inicial: '0',
    vacuo_final: '11',
    vacuo_medio: '10',
    eficiencia: '95',
    iniciado_em: new Date('2026-01-01T10:00:00Z'),
    finalizado_em: new Date('2026-01-01T10:10:00Z'),
    _count: {
      processostanquessensores: 2,
      alarmes: 1,
    },
    quantidade_leituras: 10,
    total_alarmes_criticos: 0,
    ...overrides,
  };
}
