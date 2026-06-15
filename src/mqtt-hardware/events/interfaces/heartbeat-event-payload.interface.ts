export interface HeartbeatEventInput {
  id_mqtt_mensagem?: number | null;
  esp32_online: boolean;
  uptime_ms?: number | null;
  firmware_version?: string | null;
  receivedAt: Date;
}

export type HeartbeatTimeoutInput =
  | HeartbeatTimeoutWithoutProcessInput
  | HeartbeatTimeoutWithProcessInput;

export interface HeartbeatTimeoutBaseInput {
  lastHeartbeatAt?: Date | null;
  timeoutMs: number;
  checkedAt: Date;
}

export interface HeartbeatTimeoutWithoutProcessInput extends HeartbeatTimeoutBaseInput {
  processo_em_execucao: false;
  id_processo?: never;
  id_processo_tanque?: never;
  id_processo_tanque_sensor?: never;
}

export interface HeartbeatTimeoutWithProcessInput extends HeartbeatTimeoutBaseInput {
  processo_em_execucao: true;
  id_processo: number;
  id_processo_tanque?: number | null;
  id_processo_tanque_sensor?: number | null;
}
