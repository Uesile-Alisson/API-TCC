import type { AlarmeSeverity, AlarmeStatus } from './alarme-response.interface';

export interface AlarmeNotificationPolicy {
  severity: AlarmeSeverity;
  showPopup: boolean;
  autoDismiss: boolean;
  autoDismissMs: number | null;
  dismissible: boolean;
  reappearAfterMs: number | null;
  requiresResolution: boolean;
}

export interface AlarmeNotificationPayload {
  id_alarme: number;
  titulo: string;
  descricao: string;
  severidade: AlarmeSeverity;
  status_alarme: AlarmeStatus;
  ocorrido_em: Date;
  policy: AlarmeNotificationPolicy;
  emitted_at: Date;
}
