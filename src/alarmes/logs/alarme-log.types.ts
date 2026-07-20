export interface OperationalLogResult {
  created: true;
  id_log_operacional: number;
}

export interface LogAlarmeActionInput {
  id_alarme: number;
  id_usuario?: number | null;
  id_processo?: number | null;
  acao: string;
  descricao: string;
  sucesso: boolean;
}

export interface LogResolvedAlarmeInput {
  id_alarme: number;
  id_usuario: number;
  id_processo?: number | null;
  titulo: string;
  severidade: string;
  observacao?: string | null;
  resolvido_em: Date;
  acao?: string;
}

export interface LogAcknowledgedAlarmeInput {
  id_alarme: number;
  id_usuario: number;
  id_processo?: number | null;
  titulo: string;
  observacao?: string | null;
  reconhecido_em: Date;
}
