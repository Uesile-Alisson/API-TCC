import type { AlarmeNotificationPolicy } from '../interfaces/alarme-notification.interface';
import type { AlarmeSeverity } from '../interfaces/alarme-response.interface';

export const ALARME_NOTIFICATION_POLICIES: Record<
  AlarmeSeverity,
  AlarmeNotificationPolicy
> = {
  INFO: {
    severity: 'INFO',
    showPopup: true,
    autoDismiss: true,
    autoDismissMs: 5000,
    dismissible: true,
    reappearAfterMs: null,
    requiresResolution: false,
  },
  MEDIO: {
    severity: 'MEDIO',
    showPopup: true,
    autoDismiss: true,
    autoDismissMs: 10000,
    dismissible: true,
    reappearAfterMs: 10000,
    requiresResolution: true,
  },
  CRITICO: {
    severity: 'CRITICO',
    showPopup: true,
    autoDismiss: false,
    autoDismissMs: null,
    dismissible: false,
    reappearAfterMs: 5000,
    requiresResolution: true,
  },
} as const;

export const DEFAULT_ALARME_NOTIFICATION_POLICY =
  ALARME_NOTIFICATION_POLICIES.INFO;
