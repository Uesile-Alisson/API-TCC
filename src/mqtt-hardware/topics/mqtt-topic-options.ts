import { mqtt_topics } from './mqtt-topics';

export const mqtt_qos = {
  qos_0: 0,
  qos_1: 1,
  qos_2: 2,
};

export const mqtt_topic_options = {
  [mqtt_topics.LEITURAS]: {
    qos: mqtt_qos.qos_0,
    retain: false,
  },

  [mqtt_topics.HEARTBEAT]: {
    qos: mqtt_qos.qos_0,
    retain: false,
  },

  [mqtt_topics.STATUS]: {
    qos: mqtt_qos.qos_1,
    retain: true,
  },

  [mqtt_topics.ALARMES]: {
    qos: mqtt_qos.qos_1,
    retain: true,
  },

  [mqtt_topics.COMANDOS]: {
    qos: mqtt_qos.qos_1,
    retain: false,
  },
} as const;

export type MqttQos = (typeof mqtt_qos)[keyof typeof mqtt_qos];
