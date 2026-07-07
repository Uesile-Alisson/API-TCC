import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma, statussensor } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';
import { ReadingHandler } from './reading.handler';

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('ReadingHandler', () => {
  let handler: ReadingHandler;
  let prisma: {
    sensores: {
      findUnique: AsyncMock;
      update: AsyncMock;
    };
    processostanquessensores: {
      findUnique: AsyncMock;
    };
    leiturasensores: {
      create: AsyncMock;
    };
    $transaction: Mock<
      (
        callback: (tx: {
          leiturasensores: { create: AsyncMock };
          sensores: { update: AsyncMock };
        }) => Promise<unknown>,
      ) => Promise<unknown>
    >;
  };

  beforeEach(() => {
    prisma = {
      sensores: {
        findUnique: asyncMock(),
        update: asyncMock(),
      },
      processostanquessensores: {
        findUnique: asyncMock(),
      },
      leiturasensores: {
        create: asyncMock(),
      },
      $transaction: jest.fn(
        async (
          callback: (tx: {
            leiturasensores: { create: AsyncMock };
            sensores: { update: AsyncMock };
          }) => Promise<unknown>,
        ) =>
          await callback({
            leiturasensores: prisma.leiturasensores,
            sensores: prisma.sensores,
          }),
      ),
    };

    handler = new ReadingHandler(prisma as unknown as PrismaService);
  });

  it('aceita leitura diagnostica valida com codigo_hardware sem PTS', async () => {
    prisma.sensores.findUnique.mockResolvedValueOnce({
      id_sensor: 3,
      codigo_hardware: 'VACUO_T1',
      excluido_em: null,
    });
    prisma.sensores.update.mockResolvedValueOnce({});

    const result = await handler.handle(
      makeMessage({
        tipo: 'SENSOR_READING',
        schema_version: 1,
        modo: 'DIAGNOSTICO',
        codigo_hardware: 'VACUO_T1',
        valor: -2.5,
        unidade: 'kPa',
        timestamp: '2026-07-07T12:00:00.000Z',
      }),
    );

    expect(result).toBeNull();
    expect(prisma.processostanquessensores.findUnique).not.toHaveBeenCalled();
    expect(prisma.sensores.update).toHaveBeenCalledWith({
      where: { id_sensor: 3 },
      data: {
        ultimo_valor_lido: new Prisma.Decimal(-2.5),
        ultima_leitura: new Date('2026-07-07T12:00:00.000Z'),
        status_sensor: statussensor.ATIVO,
      },
    });
  });

  it('aceita leitura diagnostica valida com id_sensor sem PTS', async () => {
    prisma.sensores.findUnique.mockResolvedValueOnce({
      id_sensor: 3,
      codigo_hardware: 'VACUO_T1',
      excluido_em: null,
    });
    prisma.sensores.update.mockResolvedValueOnce({});

    await handler.handle(
      makeMessage({
        tipo: 'SENSOR_READING',
        schema_version: 1,
        modo: 'DIAGNOSTICO',
        id_sensor: 3,
        valor: -1,
        unidade: 'kPa',
        timestamp: '2026-07-07T12:00:00.000Z',
      }),
    );

    expect(prisma.sensores.findUnique).toHaveBeenCalledWith({
      where: { id_sensor: 3 },
    });
  });

  it('mantem leitura de processo exigindo id_processo_tanque_sensor', () => {
    expect(() =>
      MqttPayloadValidator.validateReading({
        tipo: 'SENSOR_READING',
        schema_version: 1,
        modo: 'PROCESSO',
        codigo_hardware: 'VACUO_T1',
        valor: -80,
        unidade: 'kPa',
        timestamp: '2026-07-07T12:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });

  it('registra leitura de processo com PTS pelo fluxo existente', async () => {
    const leituraEm = new Date('2026-07-07T12:00:00.000Z');
    prisma.processostanquessensores.findUnique.mockResolvedValueOnce({
      id_processo_tanque_sensor: 40,
      id_sensor: 3,
      ativo: true,
      removido_em: null,
      sensores: {
        id_sensor: 3,
        excluido_em: null,
      },
      processostanques: {
        id_processo: 10,
        id_tanque: 1,
        processos: {},
        tanques: {},
      },
    });
    prisma.leiturasensores.create.mockResolvedValueOnce({
      id_leitura_sensor: 99,
      id_processo_tanque_sensor: 40,
      valor_vacuo: new Prisma.Decimal(-80),
      leitura_em: leituraEm,
      recebido_em: leituraEm,
    });
    prisma.sensores.update.mockResolvedValueOnce({});

    const result = await handler.handle(
      makeMessage({
        id_processo_tanque_sensor: 40,
        codigo_hardware: 'VACUO_T1',
        valor_vacuo: -80,
        unidade_medida: 'kPa',
        leitura_em: leituraEm.toISOString(),
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        id_leitura_sensor: 99,
        id_processo_tanque_sensor: 40,
        id_sensor: 3,
        id_processo: 10,
        id_tanque: 1,
        valor_vacuo: -80,
      }),
    );
  });

  function makeMessage(payload: Record<string, unknown>): MqttMessage {
    return {
      topic: 'tsea/leituras',
      payload,
      rawPayloado: JSON.stringify(payload),
      qos: 1,
      retain: false,
      receivedAt: new Date('2026-07-07T12:00:00.000Z'),
    };
  }
});
