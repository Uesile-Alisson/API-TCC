export const mqtt_topic_prefix = 'tsea' as const;

export const mqtt_topics = {
  LEITURAS: `${mqtt_topic_prefix}/leituras`,
  COMANDOS: `${mqtt_topic_prefix}/comandos`,
  STATUS: `${mqtt_topic_prefix}/status`,
  ALARMES: `${mqtt_topic_prefix}/alarmes`,
  HEARTBEAT: `${mqtt_topic_prefix}/heartbeat`,
  ACOPLAMENTOS: `${mqtt_topic_prefix}/acoplamentos`,
} as const;

export type MqttTopicKey = keyof typeof mqtt_topics;
export type MqttTopicValue = (typeof mqtt_topics)[MqttTopicKey];
