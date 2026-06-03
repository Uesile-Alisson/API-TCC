export interface MqttClientOptions {
  brokerUrl: string;
  port: number;
  username?: string;
  password?: string;
  reconnectPeriod: number;
  connectTimeout: number;
  clean: boolean;
  clientId: string;
}
