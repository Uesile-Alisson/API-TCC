export const HISTORICO_ALLOWED_FILTERS = [
  'page',
  'limit',
  'status_processo',
  'data_inicio',
  'data_fim',
  'campo_data',
  'id_usuario',
  'id_tanque',
  'id_sensor',
  'nome_processo',
  'parada_emergencia',
  'possui_alarmes',
  'possui_alarme_critico',
  'possui_relatorio',
  'eficiencia_min',
  'eficiencia_max',
  'tempo_execucao_min',
  'tempo_execucao_max',
  'vacuo_alvo_min',
  'vacuo_alvo_max',
  'vacuo_final_min',
  'vacuo_final_max',
  'order_by',
  'order_direction',
] as const;

export const HISTORICO_RESTRICTED_FILTERS = ['id_usuario'] as const;

export const HISTORICO_OPERATOR_BLOCKED_FILTERS = ['id_usuario'] as const;

export const HISTORICO_TECHNICIAN_ALLOWED_RESTRICTED_FILTERS = [
  'id_usuario',
] as const;

export const HISTORICO_ADMIN_ALLOWED_RESTRICTED_FILTERS = [
  'id_usuario',
] as const;

// id_usuario nao deve ser permitido para OPERADOR. A validacao real de role sera feita futuramente no validator/service; este arquivo apenas centraliza allowlists.
export type HistoricoAllowedFilter = (typeof HISTORICO_ALLOWED_FILTERS)[number];

export type HistoricoRestrictedFilter =
  (typeof HISTORICO_RESTRICTED_FILTERS)[number];
