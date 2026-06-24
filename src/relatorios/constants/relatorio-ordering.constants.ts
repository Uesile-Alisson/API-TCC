export const RELATORIO_DEFAULT_ORDER_BY = 'gerado_em' as const;

export const RELATORIO_DEFAULT_ORDER_DIRECTION = 'desc' as const;

export const RELATORIO_ALLOWED_ORDER_DIRECTIONS = ['asc', 'desc'] as const;

export const RELATORIO_ALLOWED_ORDER_BY_FIELDS = [
  'gerado_em',
  'tipo_relatorio',
  'formato_relatorio',
  'nome_arquivo',
  'tamanho_bytes',
  'titulo',
] as const;

export const RELATORIO_ALLOWED_DATE_FIELDS = ['gerado_em'] as const;

export type RelatorioOrderDirection =
  (typeof RELATORIO_ALLOWED_ORDER_DIRECTIONS)[number];

export type RelatorioOrderByField =
  (typeof RELATORIO_ALLOWED_ORDER_BY_FIELDS)[number];
