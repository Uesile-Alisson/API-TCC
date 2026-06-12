export interface MqttConnectionStatusSocketPayload {
  status_conexao: string;
  error?: string | null;
  enviado_em?: Date;
}

export interface MqttErrorSocketPayload {
  error: string;
  enviado_em?: Date;
}

export interface SensorAcoplamentoSocketPayload {
  id_sensor: number;
  id_tanque: number;
  sinal_detectado: boolean;
  status_acoplamento?: string;
  verificado_em?: Date | string;
  topic: string;
  receivedAt: Date;
  enviado_em?: Date;
}

export type GenericMqttSocketPayload = Record<string, unknown>;
