import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { Esp32CommandAckStatus } from '../dto/esp32-command-ack.dto';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { CommandAckHandler } from './command-ack.handler';

describe('CommandAckHandler', () => {
  it('registra ACK valido por correlation_id', () => {
    const handler = new CommandAckHandler();
    const result = handler.handle(
      message({
        tipo: 'ACK',
        schema_version: 1,
        correlation_id: 'cmd-1',
        comando: 'INICIAR_PROCESSO_VACUO',
        status: Esp32CommandAckStatus.EXECUTADO,
        codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
        id_processo: 10,
        recebido_em: '2026-01-01T00:00:00.000Z',
      }),
    );

    expect(result).toMatchObject({
      correlation_id: 'cmd-1',
      status: Esp32CommandAckStatus.EXECUTADO,
      codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
      id_processo: 10,
    });
    expect(handler.getLatestAck('cmd-1')).toEqual(result);
  });

  it('rejeita ACK sem correlation_id', () => {
    const handler = new CommandAckHandler();

    expect(() =>
      handler.handle(
        message({
          tipo: 'ACK',
          schema_version: 1,
          comando: 'INICIAR_PROCESSO_VACUO',
          status: Esp32CommandAckStatus.RECEBIDO,
          recebido_em: '2026-01-01T00:00:00.000Z',
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejeita ACK com status invalido', () => {
    const handler = new CommandAckHandler();

    expect(() =>
      handler.handle(
        message({
          tipo: 'ACK',
          schema_version: 1,
          correlation_id: 'cmd-2',
          comando: 'INICIAR_PROCESSO_VACUO',
          status: 'OK',
          recebido_em: '2026-01-01T00:00:00.000Z',
        }),
      ),
    ).toThrow(BadRequestException);
  });

  function message(payload: Record<string, unknown>): MqttMessage {
    return {
      topic: 'tsea/acks',
      payload,
      rawPayloado: JSON.stringify(payload),
      receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      qos: 1,
      retain: false,
    };
  }
});
