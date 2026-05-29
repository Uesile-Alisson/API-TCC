import { mqtt_topics } from '../topics/mqtt-topics';

export const MqttDefault = {
  BROKER_URL: 'mqtt://localhost',
  PORTA: 1883,
  TOPICO_LEITURAS: mqtt_topics.LEITURAS,
  TOPICO_COMANDOS: mqtt_topics.COMANDOS,
  TOPICO_STATUS: mqtt_topics.STATUS,
  TOPICO_ALARMES: mqtt_topics.ALARMES,
  TOPICO_HEARTBEAT: mqtt_topics.HEARTBEAT,
  RECONEXAO_AUTOMATICA: true,
  TIMEOUT_COMUNICACAO: 10000,
  ATIVO: true,
} as const;
