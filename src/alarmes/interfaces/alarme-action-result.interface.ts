export type AlarmeActionType =
  | 'ACKNOWLEDGED'
  | 'NORMALIZED'
  | 'RESOLVED'
  | 'RECOVERY_ATTEMPTED';

export interface AlarmeActionResult {
  success: boolean;
  id_alarme: number;
  action: AlarmeActionType;
  message: string;
  occurred_at: Date;
}

export interface ResolveAlarmeResult extends AlarmeActionResult {
  status_alarme: 'RESOLVIDO';
  resolvido_em: Date;
  id_usuario_responsavel: number;
}

export interface AcknowledgeAlarmeResult extends AlarmeActionResult {
  status_alarme: 'ATIVO' | 'NORMALIZADO' | 'RESOLVIDO';
  reconhecido_em: Date;
  id_usuario: number;
}
