export type AcoplamentoOperationalContext =
  | AcoplamentoPreProcessOperationalContext
  | AcoplamentoRunningProcessOperationalContext;

export interface AcoplamentoPreProcessOperationalContext {
  processo_em_execucao: false;
  id_sensor: number;
  id_tanque: number;
  id_processo?: never;
  id_processo_tanque?: never;
  id_processo_tanque_sensor?: never;
}

export interface AcoplamentoRunningProcessOperationalContext {
  processo_em_execucao: true;
  id_processo: number;
  id_processo_tanque: number;
  id_processo_tanque_sensor: number;
  id_sensor?: never;
  id_tanque?: never;
}
