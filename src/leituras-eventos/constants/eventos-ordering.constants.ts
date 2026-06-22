export const EVENTOS_ORDER_FIELDS = [
  'ocorrido_em',
  'tipo_evento',
  'severidade_evento',
] as const;

export type EventosOrderField = (typeof EVENTOS_ORDER_FIELDS)[number];

export const DEFAULT_EVENTOS_ORDER_BY: EventosOrderField = 'ocorrido_em';

export const DEFAULT_EVENTOS_ORDER_DIRECTION = 'desc';
