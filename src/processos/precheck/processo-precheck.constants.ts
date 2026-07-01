import { ProcessoPrecheckGrupo } from './processo-precheck.types';

export const PROCESSO_PRECHECK_VALIDADE_SEGUNDOS = 30;
export const PROCESSO_PRECHECK_SENSOR_RECENCIA_SEGUNDOS = 60;
export const PROCESSO_PRECHECK_ACOPLAMENTO_RECENCIA_SEGUNDOS = 60;
export const PROCESSO_PRECHECK_VALVULA_ACK_RECENCIA_SEGUNDOS = 60;

export const PROCESSO_PRECHECK_GRUPOS: ProcessoPrecheckGrupo[] = [
  'USUARIO',
  'PROCESSO',
  'TANQUES',
  'ACOPLAMENTO',
  'SENSORES',
  'VALVULAS',
  'BOMBAS',
  'MQTT',
  'ESP32',
  'SOCKET',
  'LOGS',
];

export const PROCESSOS_PRECHECK_SOCKET_EVENT = 'process:precheck-result';
