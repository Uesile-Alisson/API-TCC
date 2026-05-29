import { mqtt_topics } from './mqtt-topics';

export const TopicMatcher = {
  isLeitura(topic: string): boolean {
    return topic === mqtt_topics.LEITURAS || topic.includes('/leituras');
  },

  isStatus(topic: string): boolean {
    return topic === mqtt_topics.STATUS || topic.endsWith('/status');
  },

  isAlarme(topic: string): boolean {
    return topic === mqtt_topics.ALARMES || topic.endsWith('/alarmes');
  },

  isHeartbeat(topic: string): boolean {
    return topic === mqtt_topics.HEARTBEAT;
  },

  isComando(topic: string): boolean {
    return topic === mqtt_topics.COMANDOS || topic.endsWith('/comandos');
  },

  isEmergencia(topic: string): boolean {
    return topic === 'tsea/emergencia';
  },
} as const;