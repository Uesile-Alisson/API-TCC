import { StatusAcoplamentoMangueira } from '@prisma/client';

export type AcoplamentoEventInput =
  | AcoplamentoPreProcessoEventInput
  | AcoplamentoProcessoEventInput;

export interface AcoplamentoBaseEventInput {
  id_mqtt_mensagem?: number | null;
  status_acoplamento: StatusAcoplamentoMangueira;
  status_anterior?: StatusAcoplamentoMangueira | null;
  sinal_detectado: boolean;
  status_mudou: boolean;
  ultima_verificacao: Date;
}

export interface AcoplamentoPreProcessoEventInput extends AcoplamentoBaseEventInput {
  processo_em_execucao: false;
  id_sensor: number;
  id_tanque: number;
  id_processo?: never;
  id_processo_tanque?: never;
  id_processo_tanque_sensor?: never;
}

export interface AcoplamentoProcessoEventInput extends AcoplamentoBaseEventInput {
  processo_em_execucao: true;
  id_processo_tanque_sensor: number;
  id_sensor?: never;
  id_tanque?: never;
  id_processo?: never;
  id_processo_tanque?: never;
}
