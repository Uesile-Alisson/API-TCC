export const DEFAULT_ALARME_PAGE = 1;

export const DEFAULT_ALARME_LIMIT = 20;

export const MAX_ALARME_LIMIT = 100;

export const DEFAULT_ALARME_ORDER_BY = 'ocorrido_em';

export const DEFAULT_ALARME_ORDER_DIRECTION = 'desc';

export const ALARME_ALLOWED_ORDER_BY_FIELDS = [
  'ocorrido_em',
  'severidade',
  'status_alarme',
  'tipo_alarme',
] as const;

export const ALARME_ALLOWED_ORDER_DIRECTIONS = ['asc', 'desc'] as const;

export type AlarmeOrderByField =
  (typeof ALARME_ALLOWED_ORDER_BY_FIELDS)[number];

export type AlarmeOrderDirection =
  (typeof ALARME_ALLOWED_ORDER_DIRECTIONS)[number];
