import { describe, expect, it, jest } from '@jest/globals';

import { Esp32SyncConfigService } from '../config/esp32-sync-config.service';
import { MqttConfigService } from '../config/mqtt-config.service';
import { MqttClientService } from '../connection/mqtt-client.service';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { CommandAckHandler } from '../handlers/command-ack.handler';
import { CommandService } from './command.service';

describe('CommandService', () => {
  it('registra a espera antes de publicar e retorna somente apos EXECUTADO', async () => {
    const ackHandler = new CommandAckHandler();
    const publish = jest.fn((_topic: string, payload: object) => {
      const command = payload as {
        comando: string;
        correlation_id: string;
        id_processo?: number;
      };

      ackHandler.handle(
        ackMessage({
          correlation_id: command.correlation_id,
          comando: command.comando,
          id_processo: command.id_processo,
        }),
      );
      return Promise.resolve();
    });
    const service = makeService(ackHandler, publish, 1000);

    const result = await service.abrirValvula(
      {
        correlation_id: 'cmd-abrir-1',
        id_processo: 10,
      },
      7,
      'VP_T1',
    );

    expect(publish).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      comando: 'ABRIR_VALVULA',
      correlation_id: 'cmd-abrir-1',
      acknowledged: true,
      ack_status: 'EXECUTADO',
      reused_ack: false,
    });
  });

  it('nao republica comando quando correlation_id ja possui ACK EXECUTADO', async () => {
    const ackHandler = new CommandAckHandler();
    const publish = jest.fn((_topic: string, payload: object) => {
      const command = payload as {
        comando: string;
        correlation_id: string;
      };
      ackHandler.handle(
        ackMessage({
          correlation_id: command.correlation_id,
          comando: command.comando,
        }),
      );
      return Promise.resolve();
    });
    const service = makeService(ackHandler, publish, 1000);

    await service.fecharValvula(
      { correlation_id: 'cmd-idempotente-1' },
      7,
      'VP_T1',
    );
    const replay = await service.fecharValvula(
      { correlation_id: 'cmd-idempotente-1' },
      7,
      'VP_T1',
    );

    expect(publish).toHaveBeenCalledTimes(1);
    expect(replay.reused_ack).toBe(true);
  });

  it('falha com timeout quando o ESP32 nao envia ACK final', async () => {
    const ackHandler = new CommandAckHandler();
    const publish = jest.fn(() => Promise.resolve());
    const service = makeService(ackHandler, publish, 5);

    await expect(
      service.ligarBomba(
        { correlation_id: 'cmd-timeout-1' },
        1,
        'BOMBA_VACUO_PRINCIPAL',
      ),
    ).rejects.toThrow('Timeout aguardando ACK EXECUTADO de LIGAR_BOMBA');
  });

  function makeService(
    ackHandler: CommandAckHandler,
    publish: (...args: unknown[]) => Promise<unknown>,
    timeout_comunicacao: number,
  ): CommandService {
    return new CommandService(
      { publish } as unknown as MqttClientService,
      {
        getConfig: jest.fn(() =>
          Promise.resolve({
            topico_comandos: 'tsea/comandos',
            timeout_comunicacao,
          }),
        ),
      } as unknown as MqttConfigService,
      {} as Esp32SyncConfigService,
      ackHandler,
    );
  }

  function ackMessage(input: {
    correlation_id: string;
    comando: string;
    id_processo?: number;
  }): MqttMessage {
    const payload = {
      tipo: 'ACK',
      schema_version: 2,
      correlation_id: input.correlation_id,
      comando: input.comando,
      status: 'EXECUTADO',
      id_processo: input.id_processo,
      recebido_em: '2026-01-01T00:00:01.000Z',
    };

    return {
      topic: 'tsea/acks',
      payload,
      rawPayloado: JSON.stringify(payload),
      receivedAt: new Date('2026-01-01T00:00:01.000Z'),
      qos: 1,
      retain: false,
    };
  }
});
