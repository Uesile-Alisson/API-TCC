export const HISTORICO_DASHBOARD_GROUPINGS = ['DIA', 'SEMANA', 'MES'] as const;

export const HISTORICO_DEFAULT_GROUPING = 'DIA';

export const HISTORICO_DASHBOARD_KPI_KEYS = [
  'total_processos',
  'total_concluidos',
  'total_interrompidos',
  'total_falhas',
  'taxa_sucesso_percentual',
  'eficiencia_media',
  'tempo_execucao_medio',
  'tempo_execucao_total',
  'vacuo_medio_geral',
  'vacuo_final_medio',
  'processos_com_parada_emergencia',
  'total_alarmes',
  'total_alarmes_criticos',
  'media_alarmes_por_processo',
] as const;

export const HISTORICO_DASHBOARD_CHART_KEYS = [
  'processos_por_status',
  'processos_por_periodo',
  'eficiencia_por_periodo',
  'tempo_execucao_por_periodo',
  'alarmes_por_severidade',
  'comparativo_tanques',
  'processos_problematicos',
] as const;

export const HISTORICO_PROCESS_RESULT_CLASSIFICATIONS = [
  'NORMAL',
  'ATENCAO',
  'CRITICO',
] as const;

export const HISTORICO_PROCESS_RESULT_CLASSIFICATION_LABELS = {
  NORMAL: 'Normal',
  ATENCAO: 'Atenção',
  CRITICO: 'Crítico',
} as const;

export type HistoricoDashboardGrouping =
  (typeof HISTORICO_DASHBOARD_GROUPINGS)[number];

export type HistoricoProcessResultClassification =
  (typeof HISTORICO_PROCESS_RESULT_CLASSIFICATIONS)[number];
