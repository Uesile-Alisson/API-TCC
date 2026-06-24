import { nivelacesso } from '@prisma/client';

export const RELATORIO_ROLES = {
  OPERADOR: nivelacesso.OPERADOR,
  TECNICO: nivelacesso.TECNICO,
  ADMINISTRADOR: nivelacesso.ADMINISTRADOR,
} as const;

export const RELATORIO_VIEW_ROLES = [
  nivelacesso.OPERADOR,
  nivelacesso.TECNICO,
  nivelacesso.ADMINISTRADOR,
] as const;

export const RELATORIO_FILTER_ROLES = [
  nivelacesso.OPERADOR,
  nivelacesso.TECNICO,
  nivelacesso.ADMINISTRADOR,
] as const;

export const RELATORIO_PREVIEW_ROLES = [
  nivelacesso.OPERADOR,
  nivelacesso.TECNICO,
  nivelacesso.ADMINISTRADOR,
] as const;

// Operador pode visualizar e filtrar relatórios, mas não pode gerar nem baixar arquivos.
export const RELATORIO_GENERATE_ROLES = [
  nivelacesso.TECNICO,
  nivelacesso.ADMINISTRADOR,
] as const;

export const RELATORIO_DOWNLOAD_ROLES = [
  nivelacesso.TECNICO,
  nivelacesso.ADMINISTRADOR,
] as const;

export const RELATORIO_RESTRICTED_FILTERS = ['id_usuario'] as const;

export const RELATORIO_OPERATOR_BLOCKED_FILTERS = ['id_usuario'] as const;

export const RELATORIO_ALLOWED_ACTIONS = {
  LIST: 'list',
  DETAIL: 'detail',
  PREVIEW: 'preview',
  DOWNLOAD: 'download',
  GENERATE_PROCESS_REPORT: 'generate_process_report',
  GENERATE_ALARM_REPORT: 'generate_alarm_report',
} as const;

export const RELATORIO_ACTION_ROLES = {
  LIST: RELATORIO_VIEW_ROLES,
  DETAIL: RELATORIO_VIEW_ROLES,
  PREVIEW: RELATORIO_PREVIEW_ROLES,
  DOWNLOAD: RELATORIO_DOWNLOAD_ROLES,
  GENERATE_PROCESS_REPORT: RELATORIO_GENERATE_ROLES,
  GENERATE_ALARM_REPORT: RELATORIO_GENERATE_ROLES,
} as const;
