export const ALARMES_SOCKET_NAMESPACE = 'alarmes';

export const ALARMES_SOCKET_EVENTS = {
  CONNECTED: 'alarm:socket-connected',
  CREATED: 'alarm:created',
  ACKNOWLEDGED: 'alarm:acknowledged',
  NORMALIZED: 'alarm:normalized',
  RESOLVED: 'alarm:resolved',
  RECOVERY_ATTEMPT: 'alarm:recovery-attempt',
  UPDATED: 'alarm:updated',
  DASHBOARD_UPDATED: 'alarm:dashboard-updated',
  NOTIFICATION: 'alarm:notification',
} as const;

export type AlarmesSocketEvent =
  (typeof ALARMES_SOCKET_EVENTS)[keyof typeof ALARMES_SOCKET_EVENTS];
