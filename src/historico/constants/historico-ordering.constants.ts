export const HISTORICO_DEFAULT_ORDER_BY = 'finalizado_em';

export const HISTORICO_DEFAULT_ORDER_DIRECTION = 'desc';

export const HISTORICO_ALLOWED_ORDER_DIRECTIONS = ['asc', 'desc'] as const;

export const HISTORICO_ALLOWED_ORDER_BY_FIELDS = [
  'criado_em',
  'iniciado_em',
  'finalizado_em',
  'tempo_execucao',
  'eficiencia',
  'vacuo_medio',
  'vacuo_final',
  'status_processo',
  'nome_processo',
] as const;

export const HISTORICO_ALLOWED_DATE_FIELDS = [
  'criado_em',
  'iniciado_em',
  'finalizado_em',
] as const;

export type HistoricoOrderByField =
  (typeof HISTORICO_ALLOWED_ORDER_BY_FIELDS)[number];

export type HistoricoOrderDirection =
  (typeof HISTORICO_ALLOWED_ORDER_DIRECTIONS)[number];

export type HistoricoDateField = (typeof HISTORICO_ALLOWED_DATE_FIELDS)[number];
