export interface ActiveMqttConfig {
  id_mqtt_configuracao: number;
  broker_url: string;
  porta: number;
  usuario_mqtt?: string | null;
  senha_mqtt?: string | null;
  topico_leituras: string;
  topico_comandos: string;
  topico_alarmes: string;
  topico_heartbeat: string;
  topico_status: string;
  reconexao_automatica: boolean;
  timeout_comunicacao: number;
  ativo: boolean;
}
