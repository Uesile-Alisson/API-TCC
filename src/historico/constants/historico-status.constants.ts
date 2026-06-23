import { statusprocesso } from '@prisma/client';

export const HISTORICO_PROCESS_STATUS = [
  statusprocesso.CONCLUIDO,
  statusprocesso.INTERROMPIDO,
  statusprocesso.FALHA,
] as const;

export const NON_HISTORICAL_PROCESS_STATUS = [
  statusprocesso.CONFIGURADO,
  statusprocesso.EM_EXECUCAO,
  statusprocesso.PAUSADO,
] as const;

export const HISTORICO_SUCCESS_STATUS = [statusprocesso.CONCLUIDO] as const;

export const HISTORICO_ATTENTION_STATUS = [
  statusprocesso.INTERROMPIDO,
] as const;

export const HISTORICO_FAILURE_STATUS = [statusprocesso.FALHA] as const;

export const HISTORICO_PROCESS_STATUS_LABELS = {
  [statusprocesso.CONCLUIDO]: 'Concluído',
  [statusprocesso.INTERROMPIDO]: 'Interrompido',
  [statusprocesso.FALHA]: 'Falha',
} as const;
