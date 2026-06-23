import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  origemevento,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';
import { HistoricoEventoMapper } from '../mappers';

type EventoRaw = Parameters<HistoricoEventoMapper['toSummary']>[0];

describe('HistoricoEventoMapper', () => {
  let mapper: HistoricoEventoMapper;

  beforeEach(() => {
    mapper = new HistoricoEventoMapper();
  });

  it('toSummary retorna campos corretos', () => {
    const raw = makeEventoRaw();

    expect(mapper.toSummary(raw)).toEqual(raw);
  });

  it('toResumo conta severidades e calcula primeiro e ultimo evento', () => {
    const first = new Date('2026-01-01T09:00:00Z');
    const last = new Date('2026-01-01T11:00:00Z');
    const resumo = mapper.toResumo([
      makeEventoRaw({
        ocorrido_em: last,
        severidade_evento: severidadeevento.INFO,
      }),
      makeEventoRaw({
        id_evento_processo: 2,
        ocorrido_em: first,
        severidade_evento: severidadeevento.AVISO,
      }),
      makeEventoRaw({
        id_evento_processo: 3,
        ocorrido_em: new Date('2026-01-01T10:00:00Z'),
        severidade_evento: severidadeevento.CRITICO,
      }),
    ]);

    expect(resumo.total).toBe(3);
    expect(resumo.info).toBe(1);
    expect(resumo.aviso).toBe(1);
    expect(resumo.critico).toBe(1);
    expect(resumo.primeiro_evento_em).toEqual(first);
    expect(resumo.ultimo_evento_em).toEqual(last);
  });

  it('sem eventos retorna datas null', () => {
    expect(mapper.toResumo([])).toEqual({
      total: 0,
      info: 0,
      aviso: 0,
      critico: 0,
      primeiro_evento_em: null,
      ultimo_evento_em: null,
    });
  });
});

function makeEventoRaw(overrides: Record<string, unknown> = {}): EventoRaw {
  return {
    id_evento_processo: 1,
    id_processo: 10,
    id_processo_tanque_sensor: null,
    tipo_evento: tipoeventoprocesso.PROCESSO_CONCLUIDO,
    origem_evento: origemevento.SISTEMA,
    severidade_evento: severidadeevento.INFO,
    ocorrido_em: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}
