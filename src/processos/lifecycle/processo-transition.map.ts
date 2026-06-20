import { statusprocesso } from '@prisma/client';

export const PROCESSO_ALLOWED_TRANSITIONS: Record<
  statusprocesso,
  statusprocesso[]
> = {
  [statusprocesso.CONFIGURADO]: [
    statusprocesso.EM_EXECUCAO,
    statusprocesso.INTERROMPIDO,
  ],
  [statusprocesso.EM_EXECUCAO]: [
    statusprocesso.PAUSADO,
    statusprocesso.CONCLUIDO,
    statusprocesso.INTERROMPIDO,
    statusprocesso.FALHA,
  ],
  [statusprocesso.PAUSADO]: [
    statusprocesso.EM_EXECUCAO,
    statusprocesso.INTERROMPIDO,
  ],
  [statusprocesso.CONCLUIDO]: [],
  [statusprocesso.INTERROMPIDO]: [],
  [statusprocesso.FALHA]: [],
};

export const PROCESSO_FINAL_STATUSES: statusprocesso[] = [
  statusprocesso.CONCLUIDO,
  statusprocesso.INTERROMPIDO,
  statusprocesso.FALHA,
];

export function isProcessoFinalStatus(status: statusprocesso): boolean {
  return PROCESSO_FINAL_STATUSES.includes(status);
}
