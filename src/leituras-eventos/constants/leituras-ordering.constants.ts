export const LEITURAS_ORDER_FIELDS = [
  'leitura_em',
  'recebido_em',
  'valor_vacuo',
] as const;

export type LeiturasOrderField = (typeof LEITURAS_ORDER_FIELDS)[number];

export const DEFAULT_LEITURAS_ORDER_BY: LeiturasOrderField = 'leitura_em';

export const DEFAULT_LEITURAS_ORDER_DIRECTION = 'desc';
