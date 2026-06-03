import { BadRequestException } from '@nestjs/common';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { TopicValidator } from '../topics/topic-validator';
import { MqttJsonPayloadValidator } from './mqtt-json-payload.validator';

type MqttPacketMetadata = {
  qos?: number;
  retain?: boolean;
};

export class MqttMessageValidator {
  static normalizeIncomingMessage(
    topic: string,
    rawPayload: Buffer | string,
    packet: MqttPacketMetadata,
  ): MqttMessage {
    TopicValidator.validateTopics(topic, 'topic');

    const qos = this.validateQos(packet?.qos ?? 0);
    const retain = packet?.retain ?? false;

    const payload = MqttJsonPayloadValidator.parseToObject(rawPayload);
    const rawPayloadString = MqttJsonPayloadValidator.toRawString(rawPayload);

    return {
      topic,
      payload,
      rawPayloado: rawPayloadString,
      qos,
      retain,
      receivedAt: new Date(),
    };
  }

  private static validateQos(qos: number): 0 | 1 | 2 {
    if (qos !== 0 && qos !== 1 && qos !== 2) {
      throw new BadRequestException(
        'Qos MQTT inválido. Valores permitidos 0, 1 ou 2.',
      );
    }

    return qos;
  }
}
