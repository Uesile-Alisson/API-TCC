import { resultadooperacao } from '@prisma/client';

export interface ProcessoLogResult {
  created: true;
  id_log_operacional: number;
}

export interface RegisterProcessUserActionInput {
  id_usuario: number;
  id_processo: number;
  acao: string;
  descricao: string;
  resultado?: resultadooperacao;
}

export interface RegisterProcessSystemActionInput {
  id_processo: number;
  acao: string;
  descricao: string;
  resultado?: resultadooperacao;
}

export interface RegisterProcessLifecycleInput {
  id_processo: number;
  id_usuario: number;
}

export interface RegisterProcessReasonInput extends RegisterProcessLifecycleInput {
  motivo?: string | null;
}

export interface RegisterProcessEmergencyInput {
  id_processo: number;
  id_usuario?: number | null;
  motivo?: string | null;
}

export interface RegisterProcessFailureInput {
  id_processo: number;
  motivo?: string | null;
}
