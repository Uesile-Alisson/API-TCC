export interface HeartbeatEventInput {
  id_mqtt_mensagem?: number | null;
  esp32_online: boolean;
  uptime_ms?: number | null;
  firmware_version?: string | null;
  receivedAt: Date;
}
