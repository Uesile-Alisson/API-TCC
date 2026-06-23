import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
} from '@prisma/client';
import { HistoricoAlarmeMapper } from '../mappers';

type AlarmeRaw = Parameters<HistoricoAlarmeMapper['toSummary']>[0];

describe('HistoricoAlarmeMapper', () => {
  let mapper: HistoricoAlarmeMapper;

  beforeEach(() => {
    mapper = new HistoricoAlarmeMapper();
  });

  it('toSummary converte valor_detectado decimal-like', () => {
    const result = mapper.toSummary(
      makeAlarmeRaw({ valor_detectado: { toString: () => '12.5' } }),
    );

    expect(result.valor_detectado).toBe(12.5);
    expect(result.id_alarme).toBe(1);
  });

  it('toResumo conta severidades e status', () => {
    const resumo = mapper.toResumo([
      makeAlarmeRaw({ severidade: severidadealarme.INFO }),
      makeAlarmeRaw({
        id_alarme: 2,
        severidade: severidadealarme.MEDIO,
        status_alarme: statusalarme.RESOLVIDO,
      }),
      makeAlarmeRaw({
        id_alarme: 3,
        severidade: severidadealarme.CRITICO,
      }),
    ]);

    expect(resumo).toEqual({
      total: 3,
      info: 1,
      medio: 1,
      critico: 1,
      ativos: 2,
      resolvidos: 1,
    });
  });

  it('nao cria acao de resolver ou excluir no resumo', () => {
    const summary = mapper.toSummary(makeAlarmeRaw());

    expect(summary).not.toHaveProperty('resolver');
    expect(summary).not.toHaveProperty('excluir');
    expect(summary).not.toHaveProperty('delete');
  });
});

function makeAlarmeRaw(overrides: Record<string, unknown> = {}): AlarmeRaw {
  return {
    id_alarme: 1,
    titulo: 'Alarme',
    descricao: 'Descricao',
    tipo_alarme: tipoalarme.PROCESSO,
    severidade: severidadealarme.CRITICO,
    status_alarme: statusalarme.ATIVO,
    origem_alarme: origemalarme.SISTEMA,
    valor_detectado: '10.5',
    unidade: 'kPa',
    ocorrido_em: new Date('2026-01-01T10:00:00Z'),
    resolvido_em: null,
    id_processo: 10,
    id_processo_tanque: 20,
    id_processo_tanque_sensor: 30,
    ...overrides,
  };
}
