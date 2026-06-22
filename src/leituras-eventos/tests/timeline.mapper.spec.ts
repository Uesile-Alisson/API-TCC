import { TIMELINE_MAX_LIMIT } from '../constants';
import type { TimelineItem, TimelineItemSeverity } from '../interfaces';
import { TimelineMapper } from '../mappers';
import { beforeEach, describe, expect, it } from '@jest/globals';

type TimelineLeituraRaw = Parameters<
  TimelineMapper['leituraToTimelineItem']
>[0];
type TimelineEventoRaw = Parameters<TimelineMapper['eventoToTimelineItem']>[0];
type TimelineMapperPrivate = {
  normalizeSeverity(value: unknown): TimelineItemSeverity;
};

describe('TimelineMapper', () => {
  let mapper: TimelineMapper;

  beforeEach(() => {
    mapper = new TimelineMapper();
  });

  it('deve estar definido', () => {
    expect(mapper).toBeDefined();
  });

  it('deve mapear leitura para item de timeline', () => {
    const leitura: TimelineLeituraRaw = {
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: '10.5',
      leitura_em: new Date('2026-01-01T10:00:00Z'),
      recebido_em: new Date('2026-01-01T10:00:02Z'),
      unidade_medida: 'kPa',
    };

    const item = mapper.leituraToTimelineItem(leitura);

    expect(item.type).toBe('LEITURA');
    expect(item.timestamp).toBe(leitura.leitura_em);
    expect(item.id).toBe(1);
    expect(item.value).toBe(10.5);
    expect(item.metadata).toEqual({
      id_processo_tanque_sensor: 2,
      recebido_em: leitura.recebido_em,
    });
  });

  it('deve mapear evento para item de timeline', () => {
    const evento: TimelineEventoRaw = {
      id_evento_processo: 1,
      id_processo: 2,
      id_processo_tanque_sensor: 3,
      tipo_evento: 'PROCESSO_INICIADO',
      origem_evento: 'SISTEMA',
      severidade_evento: 'CRITICO',
      ocorrido_em: new Date('2026-01-01T10:00:00Z'),
    };

    const item = mapper.eventoToTimelineItem(evento);

    expect(item.type).toBe('EVENTO');
    expect(item.timestamp).toBe(evento.ocorrido_em);
    expect(item.id).toBe(1);
    expect(item.severity).toBe('CRITICO');
    expect(item.metadata).toEqual({
      id_processo: 2,
      id_processo_tanque_sensor: 3,
      tipo_evento: 'PROCESSO_INICIADO',
      origem_evento: 'SISTEMA',
    });
  });

  it('deve normalizar severidade', () => {
    const privateMapper = mapper as unknown as TimelineMapperPrivate;

    expect(privateMapper.normalizeSeverity('INFO')).toBe('INFO');
    expect(privateMapper.normalizeSeverity('MEDIO')).toBe('MEDIO');
    expect(privateMapper.normalizeSeverity('CRITICO')).toBe('CRITICO');
    expect(privateMapper.normalizeSeverity('INVALIDO')).toBeNull();
  });

  it('deve ordenar por timestamp sem mutar array original', () => {
    const first: TimelineItem = buildItem(1, new Date('2026-01-01T10:00:00Z'));
    const second: TimelineItem = buildItem(2, new Date('2026-01-01T09:00:00Z'));
    const items = [first, second];

    const sorted = mapper.sortItemsByTimestamp(items);

    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
    expect(items.map((item) => item.id)).toEqual([1, 2]);
  });

  it('deve limitar itens com limites seguros', () => {
    const items = [buildItem(1), buildItem(2)];

    expect(mapper.limitItems(items, 1)).toHaveLength(1);
    expect(mapper.limitItems(items, 0)).toEqual(items);
    expect(mapper.limitItems(items, TIMELINE_MAX_LIMIT + 1)).toEqual(items);
  });

  it('deve montar resposta ordenada e limitada', () => {
    const late = buildItem(1, new Date('2026-01-01T11:00:00Z'));
    const early = buildItem(2, new Date('2026-01-01T10:00:00Z'));

    const response = mapper.toTimelineResponse(9, [late, early], 1);

    expect(response.id_processo).toBe(9);
    expect(response.items.map((item) => item.id)).toEqual([2]);
    expect(response.total_items).toBe(2);
    expect(response.generated_at).toBeInstanceOf(Date);
  });
});

function buildItem(
  id: number,
  timestamp = new Date('2026-01-01T10:00:00Z'),
): TimelineItem {
  return {
    type: 'LEITURA',
    timestamp,
    id,
    title: `Item ${id}`,
    description: null,
    severity: null,
    value: null,
    unit: null,
    metadata: null,
  };
}
