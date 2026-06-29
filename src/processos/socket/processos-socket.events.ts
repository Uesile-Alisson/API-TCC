export const PROCESSOS_SOCKET_EVENTS = {
  CONNECTED: 'process:socket-connected',

  JOIN_PROCESS: 'process:join',
  LEAVE_PROCESS: 'process:leave',
  JOINED_PROCESS: 'process:joined',
  LEFT_PROCESS: 'process:left',

  CREATED: 'process:created',
  STARTED: 'process:started',
  PAUSED: 'process:paused',
  RESUMED: 'process:resumed',
  FINISHED: 'process:finished',
  INTERRUPTED: 'process:interrupted',
  EMERGENCY_STOP: 'process:emergency-stop',
  FAILURE: 'process:failure',
  CONFIG_UPDATED: 'process:config-updated',
  METRICS_UPDATED: 'process:metrics-updated',
  DASHBOARD_UPDATED: 'process:dashboard-updated',
  STATUS_CHANGED: 'process:status-changed',
  PRECHECK_RESULT: 'process:precheck-result',
  ERROR: 'process:error',
} as const;

export type ProcessosSocketEventName =
  (typeof PROCESSOS_SOCKET_EVENTS)[keyof typeof PROCESSOS_SOCKET_EVENTS];
