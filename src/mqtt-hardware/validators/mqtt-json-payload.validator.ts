import { BadRequestException } from '@nestjs/common';

export class MqttJsonPayloadValidator {
    static parseToObject(rawPayload: Buffer | string): Record<string, unknown> {
        const payloadAsString = Buffer.isBuffer(rawPayload) ? rawPayload.toString('utf8') : rawPayload;

        if (!payloadAsString || payloadAsString.trim().length === 0) {
            throw new BadRequestException('Payload MQTT não pode ser vazio.');
        }

        try {
            const parsedPayload: unknown = JSON.parse(payloadAsString);

            if (typeof parsedPayload !== 'object' || parsedPayload === null || Array.isArray(parsedPayload)) {
                throw new BadRequestException('Payload MQTT deve ser um formato JSON válido.');
            }

            return parsedPayload as Record<string, unknown>;
        } catch {
            throw new BadRequestException('Payload MQTT inválido. A mensagem deve estar em formato JSON.');
        };
    }

    static toRawString(rawPayload: Buffer | string): string {
        return Buffer.isBuffer(rawPayload) ? rawPayload.toString('utf8') : rawPayload;
    }
}