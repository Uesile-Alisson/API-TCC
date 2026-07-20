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

  it('mantem RECEBIDO como intermediario e resolve somente em EXECUTADO', async () => {
    const handler = new CommandAckHandler();
    const wait = handler.waitForFinalAck('cmd-wait-1', 'ABRIR_VALVULA', 1000);
    let settled = false;
    void wait.promise.then(() => {
      settled = true;
    });

    handler.handle(
      message({
        tipo: 'ACK',
        schema_version: 2,
        correlation_id: 'cmd-wait-1',
        comando: 'ABRIR_VALVULA',
        status: Esp32CommandAckStatus.RECEBIDO,
        recebido_em: '2026-01-01T00:00:00.000Z',
      }),
    );
    await Promise.resolve();
    expect(settled).toBe(false);

    handler.handle(
      message({
        tipo: 'ACK',
        schema_version: 2,
        correlation_id: 'cmd-wait-1',
        comando: 'ABRIR_VALVULA',
        status: Esp32CommandAckStatus.EXECUTADO,
        recebido_em: '2026-01-01T00:00:01.000Z',
      }),
    );

    await expect(wait.promise).resolves.toMatchObject({
      correlation_id: 'cmd-wait-1',
      status: Esp32CommandAckStatus.EXECUTADO,
    });
  });

  it('rejeita espera quando o ESP32 recusa o comando', async () => {
    const handler = new CommandAckHandler();
    const wait = handler.waitForFinalAck('cmd-recusado', 'LIGAR_BOMBA', 1000);

    handler.handle(
      message({
        tipo: 'ACK',
        schema_version: 2,
        correlation_id: 'cmd-recusado',
        comando: 'LIGAR_BOMBA',
        status: Esp32CommandAckStatus.RECUSADO,
        mensagem: 'Intertravamento ativo.',
        recebido_em: '2026-01-01T00:00:00.000Z',
      }),
    );

    await expect(wait.promise).rejects.toThrow('ESP32 recusou LIGAR_BOMBA');
  });

  it('aplica timeout quando ACK final nao chega', async () => {
    const handler = new CommandAckHandler();
    const wait = handler.waitForFinalAck('cmd-timeout', 'FECHAR_VALVULA', 5);

    await expect(wait.promise).rejects.toThrow(
      'Timeout aguardando ACK EXECUTADO de FECHAR_VALVULA',
    );
  });

  it('reutiliza espera e ACK final pelo mesmo correlation_id sem republicar', async () => {
    const handler = new CommandAckHandler();
    const first = handler.waitForFinalAck(
      'cmd-idempotente',
      'ABRIR_VALVULA',
      1000,
    );
    const duplicate = handler.waitForFinalAck(
      'cmd-idempotente',
      'ABRIR_VALVULA',
      1000,
    );

    expect(first.shouldPublish).toBe(true);
    expect(duplicate.shouldPublish).toBe(false);
    expect(duplicate.promise).toBe(first.promise);

    const executed = handler.handle(
      message({
        tipo: 'ACK',
        schema_version: 2,
        correlation_id: 'cmd-idempotente',
        comando: 'ABRIR_VALVULA',
        status: Esp32CommandAckStatus.EXECUTADO,
        recebido_em: '2026-01-01T00:00:00.000Z',
      }),
    );

    await expect(first.promise).resolves.toEqual(executed);
    await expect(duplicate.promise).resolves.toEqual(executed);

    const replay = handler.waitForFinalAck(
      'cmd-idempotente',
      'ABRIR_VALVULA',
      1000,
    );
    expect(replay.shouldPublish).toBe(false);
    await expect(replay.promise).resolves.toEqual(executed);
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
