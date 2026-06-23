import { nivelacesso } from '@prisma/client';

export const HISTORICO_ACTIONS = {
  LIST: 'historico:list',
  DETAILS: 'historico:details',
  DASHBOARD: 'historico:dashboard',
  VIEW_TANKS: 'historico:view_tanks',
  VIEW_ALARMS: 'historico:view_alarms',
  VIEW_EVENTS: 'historico:view_events',
  VIEW_REPORT_METADATA: 'historico:view_report_metadata',
  VIEW_VACUUM_CHART: 'historico:view_vacuum_chart',
  VIEW_TANK_COMPARISON: 'historico:view_tank_comparison',
} as const;

export const HISTORICO_ALLOWED_ROLES = [
  nivelacesso.OPERADOR,
  nivelacesso.TECNICO,
  nivelacesso.ADMINISTRADOR,
] as const;

const HISTORICO_BASE_ROLE_ACTIONS = [
  HISTORICO_ACTIONS.LIST,
  HISTORICO_ACTIONS.DETAILS,
  HISTORICO_ACTIONS.DASHBOARD,
  HISTORICO_ACTIONS.VIEW_TANKS,
  HISTORICO_ACTIONS.VIEW_ALARMS,
  HISTORICO_ACTIONS.VIEW_EVENTS,
  HISTORICO_ACTIONS.VIEW_REPORT_METADATA,
  HISTORICO_ACTIONS.VIEW_VACUUM_CHART,
  HISTORICO_ACTIONS.VIEW_TANK_COMPARISON,
] as const;

export const HISTORICO_ROLE_ACTIONS = {
  [nivelacesso.OPERADOR]: HISTORICO_BASE_ROLE_ACTIONS,
  [nivelacesso.TECNICO]: HISTORICO_BASE_ROLE_ACTIONS,
  [nivelacesso.ADMINISTRADOR]: HISTORICO_BASE_ROLE_ACTIONS,
} as const;

// Gerar relatorio pertence ao RelatoriosModule; editar, excluir, ocultar historico ou resolver alarme nao sao acoes deste modulo.
export type HistoricoAction =
  (typeof HISTORICO_ACTIONS)[keyof typeof HISTORICO_ACTIONS];

export type HistoricoAllowedRole = (typeof HISTORICO_ALLOWED_ROLES)[number];
