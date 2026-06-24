export const RELATORIO_TEMPLATE_BRANDING = {
  SYSTEM_NAME: 'TSEA',
  PROJECT_NAME: 'TSEA — Solução a Vácuo',
  DOCUMENT_TITLE: 'Relatório Operacional',
  INSTITUTION_NAME: 'SENAI',
  PRIMARY_COLOR: '#0F172A',
  SECONDARY_COLOR: '#0EA5E9',
  ACCENT_COLOR: '#F97316',
} as const;

export const RELATORIO_PROCESS_TEMPLATE = {
  TITLE: 'Relatório Operacional de Processo — TSEA',
  SUBTITLE: 'Documentação técnica do processo de vácuo',
} as const;

export const RELATORIO_ALARM_TEMPLATE = {
  TITLE: 'Relatório Técnico de Alarme — TSEA',
  SUBTITLE: 'Documentação técnica de ocorrência operacional',
} as const;

export const RELATORIO_PROCESS_PDF_SECTIONS = [
  'Capa técnica',
  'Identificação do relatório',
  'Resumo executivo',
  'Dados do processo',
  'Indicadores operacionais',
  'Tanques envolvidos',
  'Leituras de sensores',
  'Eventos do processo',
  'Alarmes relacionados',
  'Diagnóstico técnico',
  'Rastreabilidade',
] as const;

export const RELATORIO_ALARM_PDF_SECTIONS = [
  'Identificação do relatório',
  'Dados do alarme',
  'Processo relacionado',
  'Origem operacional',
  'Severidade e status',
  'Valor detectado',
  'Linha do tempo',
  'Resolução',
  'Diagnóstico técnico',
  'Rastreabilidade',
] as const;

export const RELATORIO_PROCESS_XLSX_SHEETS = [
  'Resumo',
  'Processo',
  'Tanques',
  'Leituras',
  'Eventos',
  'Alarmes',
  'Sensores',
] as const;

export const RELATORIO_XLSX_DEFAULT_SHEET = 'Resumo' as const;

export const RELATORIO_TEMPLATE_FOOTER_TEXT =
  'Documento gerado automaticamente pelo Sistema TSEA. Relatórios são históricos imutáveis.' as const;

export const RELATORIO_TRACEABILITY_LABEL =
  'Rastreabilidade operacional' as const;
