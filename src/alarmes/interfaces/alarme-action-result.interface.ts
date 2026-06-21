export type AlarmeActionType = 'RESOLVED';

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
