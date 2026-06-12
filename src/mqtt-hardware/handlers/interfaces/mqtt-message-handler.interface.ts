import { MqttMessage } from '@/mqtt-hardware/interfaces/mqtt-message.interface';

export interface MqttMessageHandler {
  handle(message: MqttMessage): Promise<void>;
}
