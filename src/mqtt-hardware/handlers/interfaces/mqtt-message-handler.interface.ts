import { MqttMessage } from '@/mqtt-hardware/interfaces/mqtt-message.interface';

export interface MqttMessageHandler<TResult = void> {
  handle(message: MqttMessage): Promise<TResult>;
}
