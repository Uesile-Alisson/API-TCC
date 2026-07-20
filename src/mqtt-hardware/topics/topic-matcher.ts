import { mqtt_topics } from './mqtt-topics';
import type { ActiveMqttConfig } from '../interfaces/active-mqtt-config.interface';

type MqttRoutingConfig = Pick<
  ActiveMqttConfig,
  | 'topico_leituras'
  | 'topico_comandos'
  | 'topico_status'
  | 'topico_alarmes'
  | 'topico_heartbeat'
  | 'topico_acoplamentos'
  | 'topico_configuracoes'
  | 'topico_acks'
>;

let activeTopics: MqttRoutingConfig = {
  topico_leituras: mqtt_topics.LEITURAS,
  topico_comandos: mqtt_topics.COMANDOS,
  topico_status: mqtt_topics.STATUS,
  topico_alarmes: mqtt_topics.ALARMES,
  topico_heartbeat: mqtt_topics.HEARTBEAT,
  topico_acoplamentos: mqtt_topics.ACOPLAMENTOS,
  topico_configuracoes: mqtt_topics.CONFIGURACOES,
  topico_acks: mqtt_topics.ACKS,
};

export const TopicMatcher = {
  configure(config: MqttRoutingConfig): void {
    activeTopics = {
      topico_leituras: config.topico_leituras,
      topico_comandos: config.topico_comandos,
      topico_status: config.topico_status,
      topico_alarmes: config.topico_alarmes,
      topico_heartbeat: config.topico_heartbeat,
      topico_acoplamentos: config.topico_acoplamentos,
      topico_configuracoes: config.topico_configuracoes,
      topico_acks: config.topico_acks,
    };
  },

  isLeitura(topic: string): boolean {
    return topic === activeTopics.topico_leituras;
  },

  isStatus(topic: string): boolean {
    return topic === activeTopics.topico_status;
  },

  isAlarme(topic: string): boolean {
    return topic === activeTopics.topico_alarmes;
  },

  isHeartbeat(topic: string): boolean {
    return topic === activeTopics.topico_heartbeat;
  },

  isAcoplamento(topic: string): boolean {
    return topic === activeTopics.topico_acoplamentos;
  },

  isAck(topic: string): boolean {
    return topic === activeTopics.topico_acks;
  },

  isConfiguracao(topic: string): boolean {
    return topic === activeTopics.topico_configuracoes;
  },

  isComando(topic: string): boolean {
    return topic === activeTopics.topico_comandos;
  },

  isEmergencia(topic: string): boolean {
    return topic === 'tsea/emergencia';
  },
} as const;
