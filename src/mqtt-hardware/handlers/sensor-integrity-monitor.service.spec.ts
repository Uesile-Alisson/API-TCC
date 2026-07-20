import { describe, expect, it, jest } from '@jest/globals';
import { SensorIntegrityMonitorService } from './sensor-integrity-monitor.service';
import { PrismaService } from '../../prisma/prisma.service';
import { statusintegridadesensor, statussensor } from '@prisma/client';

describe('SensorIntegrityMonitorService', () => {
  it('marca timeout uma unica vez e cria alarme bloqueante', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const createAlarm = jest.fn().mockResolvedValue({ id_alarme: 9 });
    const prisma = {
      processostanquessensores: {
        findMany: jest.fn().mockResolvedValue([
          {
            id_processo_tanque_sensor: 40,
            id_processo_tanque: 20,
            id_sensor: 3,
            sensores: {
              ultima_leitura: new Date('2026-07-16T11:59:50.000Z'),
            },
            processostanques: {
              id_processo: 10,
              processos: { encerramento_timeout_leitura_sensor_ms: 2500 },
            },
          },
        ]),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            sensores: { updateMany },
            alarmes: { create: createAlarm },
          }),
      ),
    };
    const service = new SensorIntegrityMonitorService(
      prisma as unknown as PrismaService,
    );

    const failures = await service.monitorTimeouts(
      new Date('2026-07-16T12:00:00.000Z'),
    );

    expect(failures).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_sensor: statussensor.DESCONECTADO,
          status_integridade: statusintegridadesensor.TIMEOUT,
          liberado_em: null,
        }),
      }),
    );
    expect(createAlarm).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bloqueante: true }),
      }),
    );
  });
});
