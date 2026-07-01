import { describe, expect, it, jest } from '@jest/globals';
import { statusgeralsistema } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { MqttConfigService } from '../config/mqtt-config.service';
import { ValvulaHardwareStatusService } from '../valvulas/valvula-hardware-status.service';
import { StatusHandler } from './status.handler';

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('StatusHandler', () => {
  it('normaliza enviado_em ISO string antes de usar toISOString', async () => {
    const prisma = {
      configuracoessistema: {
        findFirst: asyncMock().mockResolvedValue({
          id_configuracao_sistema: 1,
          status_geral_sistema: statusgeralsistema.ALERTA,
        }),
        update: asyncMock().mockResolvedValue({}),
      },
    };

    const mqttConfig = {
      updateLastSync: asyncMock().mockResolvedValue(undefined),
    };

    const valveStatus = {
      processStatusPayload: asyncMock().mockResolvedValue([]),
    };

    const handler = new StatusHandler(
      prisma as unknown as PrismaService,
      mqttConfig as unknown as MqttConfigService,
      valveStatus as unknown as ValvulaHardwareStatusService,
    );

    const result = await handler.handle({
      topic: 'tsea/status',
      payload: {
        esp32_on: true,
        status_geral: statusgeralsistema.OPERACIONAL,
        mensagem: 'ESP32 operacional',
        device_id: 'esp32-tsea-simulado',
        sensores_ativos: 3,
        valvulas: {},
        tanques: {},
        enviado_em: '2026-07-01T12:00:00.000Z',
      },
      qos: 1,
      retain: false,
      receivedAt: new Date('2026-07-01T12:00:01.000Z'),
    });

    expect(result?.status_em).toEqual(new Date('2026-07-01T12:00:00.000Z'));
    expect(valveStatus.processStatusPayload).toHaveBeenCalledWith(
      {},
      new Date('2026-07-01T12:00:00.000Z'),
    );
  });
});
