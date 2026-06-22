import { TIMELINE_MAX_LIMIT } from '../constants';
import type { TimelineItem } from '../interfaces';
import { ProcessoTimelineService } from '../timeline';
import type {
  ProcessoTimelineEventoInput,
  ProcessoTimelineLeituraInput,
} from '../timeline';
import { beforeEach, describe, expect, it } from '@jest/globals';

describe('ProcessoTimelineService', () => {
  let service: ProcessoTimelineService;

  beforeEach(() => {
    service = new ProcessoTimelineService();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('deve normalizar opcoes', () => {
    expect(service.normalizeOptions({ id_processo: 1 }).incluir_leituras).toBe(
      true,
    );
    expect(
      service.normalizeOptions({ id_processo: 1, incluir_leituras: false })
        .incluir_leituras,
    ).toBe(false);
    expect(
      service.normalizeOptions({ id_processo: 1, incluir_eventos: false })
        .incluir_eventos,
    ).toBe(false);
    expect(service.normalizeOptions({ id_processo: 1, limit: 0 }).limit).toBe(
      100,
    );
    expect(
      service.normalizeOptions({
        id_processo: 1,
        limit: TIMELINE_MAX_LIMIT + 1,
      }).limit,
    ).toBe(TIMELINE_MAX_LIMIT);
  });

  it('deve transformar leituras em itens', () => {
    const items = service.buildLeituraItems([
      buildLeitura(1, '10.5'),
      buildLeitura(2, 'invalido'),
    ]);

    expect(items[0]).toMatchObject({
      type: 'LEITURA',
      id: 1,
      value: 10.5,
      unit: 'kPa',
      metadata: {
        id_processo_tanque_sensor: 2,
      },
    });
    expect(items[0].description).toContain('10.5');
    expect(items[1].value).toBeNull();
    expect(items[1].description).toContain('sem valor');
  });

  it('deve transformar eventos em itens', () => {
    const items = service.buildEventoItems([buildEvento(1, 'CRITICO')]);

    expect(items[0]).toMatchObject({
      type: 'EVENTO',
      id: 1,
      severity: 'CRITICO',
      metadata: {
        id_processo: 9,
        id_processo_tanque_sensor: 2,
        tipo_evento: 'PROCESSO_INICIADO',
        origem_evento: 'SISTEMA',
      },
    });
  });

  it('deve juntar arrays sem mutar originais', () => {
    const leituraItems = [buildTimelineItem(1, 'LEITURA')];
    const eventoItems = [buildTimelineItem(2, 'EVENTO')];

    const merged = service.mergeTimelineItems(leituraItems, eventoItems);

    expect(merged.map((item) => item.id)).toEqual([1, 2]);
    expect(leituraItems).toHaveLength(1);
    expect(eventoItems).toHaveLength(1);
  });

  it('deve ordenar por data, tipo e id', () => {
    const timestamp = new Date('2026-01-01T10:00:00Z');
    const items = [
      buildTimelineItem(3, 'LEITURA', timestamp),
      buildTimelineItem(2, 'EVENTO', timestamp),
      buildTimelineItem(1, 'EVENTO', timestamp),
      buildTimelineItem(4, 'LEITURA', new Date('2026-01-01T09:00:00Z')),
    ];

    expect(service.sortTimelineItems(items).map((item) => item.id)).toEqual([
      4, 1, 2, 3,
    ]);
  });

  it('deve limitar e filtrar por data sem mutar original', () => {
    const items = [
      buildTimelineItem(1, 'LEITURA', new Date('2026-01-01T09:00:00Z')),
      buildTimelineItem(2, 'EVENTO', new Date('2026-01-01T10:00:00Z')),
    ];

    expect(service.limitTimelineItems(items, 1)).toHaveLength(1);
    expect(
      service.filterTimelineItemsByDate(
        items,
        new Date('2026-01-01T09:30:00Z'),
        new Date('2026-01-01T10:30:00Z'),
      ),
    ).toHaveLength(1);
    expect(service.filterTimelineItemsByDate(items)).toEqual(items);
    expect(items).toHaveLength(2);
  });

  it('deve montar timeline respeitando flags, ordenacao e limite', () => {
    const response = service.buildProcessTimeline({
      id_processo: 9,
      leituras: [buildLeitura(1, 10)],
      eventos: [buildEvento(2, 'INFO')],
      limit: 1,
    });

    expect(response.id_processo).toBe(9);
    expect(response.items).toHaveLength(1);
    expect(response.total_items).toBe(2);
    expect(response.generated_at).toBeInstanceOf(Date);
  });

  it('deve retornar timeline vazia com ambos os tipos desativados', () => {
    const response = service.buildProcessTimeline({
      id_processo: 9,
      leituras: [buildLeitura(1, 10)],
      eventos: [buildEvento(2, 'INFO')],
      incluir_leituras: false,
      incluir_eventos: false,
    });

    expect(response.items).toEqual([]);
    expect(response.total_items).toBe(0);
  });
});

function buildLeitura(
  id: number,
  valor_vacuo: unknown,
): ProcessoTimelineLeituraInput {
  return {
    id_leitura_sensor: id,
    id_processo_tanque_sensor: 2,
    valor_vacuo,
    leitura_em: new Date(`2026-01-01T10:0${id}:00Z`),
    recebido_em: new Date(`2026-01-01T10:0${id}:01Z`),
    unidade_medida: 'kPa',
  };
}

function buildEvento(
  id: number,
  severidade_evento: string,
): ProcessoTimelineEventoInput {
  return {
    id_evento_processo: id,
    id_processo: 9,
    id_processo_tanque_sensor: 2,
    tipo_evento: 'PROCESSO_INICIADO',
    origem_evento: 'SISTEMA',
    severidade_evento,
    ocorrido_em: new Date(`2026-01-01T10:0${id}:30Z`),
  };
}

function buildTimelineItem(
  id: number,
  type: TimelineItem['type'],
  timestamp = new Date('2026-01-01T10:00:00Z'),
): TimelineItem {
  return {
    type,
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
