import { tiporelatorio } from '@prisma/client';

export const RELATORIO_TYPES = {
  PROCESSO: tiporelatorio.PROCESSO,
  ALARME: tiporelatorio.ALARME,
} as const;

export const RELATORIO_ALLOWED_TYPES = [
  tiporelatorio.PROCESSO,
  tiporelatorio.ALARME,
] as const;

export const RELATORIO_TYPE_LABELS = {
  PROCESSO: 'Processo',
  ALARME: 'Alarme',
} as const;

export const RELATORIO_TYPE_DESCRIPTIONS = {
  PROCESSO: 'Relatório operacional de processo de vácuo.',
  ALARME: 'Relatório técnico de ocorrência de alarme.',
} as const;

export const RELATORIO_GENERATION_ALLOWED_TYPES = [
  tiporelatorio.PROCESSO,
  tiporelatorio.ALARME,
] as const;
