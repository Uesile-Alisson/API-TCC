export interface MqttMessage {
  topic: string;
  payload: Record<string, unknown>;
  rawPayloado?: string;
  qos: 1 | 0 | 2;
  retain: boolean;
  receivedAt: Date;
  enviado_em?: Date;
}
