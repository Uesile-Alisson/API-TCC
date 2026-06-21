export const ALARMES_SOCKET_NAMESPACE = 'alarmes';

export const ALARMES_SOCKET_EVENTS = {
  CONNECTED: 'alarm:socket-connected',
  RESOLVED: 'alarm:resolved',
  DASHBOARD_UPDATED: 'alarm:dashboard-updated',
  NOTIFICATION: 'alarm:notification',
} as const;

export type AlarmesSocketEvent =
  (typeof ALARMES_SOCKET_EVENTS)[keyof typeof ALARMES_SOCKET_EVENTS];
