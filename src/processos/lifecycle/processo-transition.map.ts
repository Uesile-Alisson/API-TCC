import { statusprocesso } from '@prisma/client';

export const PROCESSO_ALLOWED_TRANSITIONS: Record<
  statusprocesso,
  statusprocesso[]
> = {
  CONFIGURADO: ['EM_EXECUCAO', 'INTERROMPIDO'],
  EM_EXECUCAO: ['PAUSADO', 'CONCLUIDO', 'INTERROMPIDO', 'FALHA'],
  PAUSADO: ['EM_EXECUCAO', 'INTERROMPIDO'],
  CONCLUIDO: [],
  INTERROMPIDO: [],
  FALHA: [],
};

export const PROCESSO_FINAL_STATUSES: statusprocesso[] = [
  statusprocesso.CONCLUIDO,
  statusprocesso.INTERROMPIDO,
  statusprocesso.FALHA,
];

export function isProcessoFinalStatus(status: statusprocesso): boolean {
  return PROCESSO_FINAL_STATUSES.includes(status);
}
