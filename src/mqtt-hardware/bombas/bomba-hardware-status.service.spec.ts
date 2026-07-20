import { describe, expect, it, jest } from '@jest/globals';
import { tipobomba } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { BombaHardwareStatusService } from './bomba-hardware-status.service';

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('BombaHardwareStatusService', () => {
  it('persiste os sinais fisicos das bombas principal e auxiliar', async () => {
    const findUnique = asyncMock()
      .mockResolvedValueOnce({
        id_bomba: 1,
        codigo_hardware: 'BOMBA_PRINCIPAL',
        tipo_bomba: tipobomba.PRINCIPAL,
      })
      .mockResolvedValueOnce({
        id_bomba: 2,
        codigo_hardware: 'BOMBA_AUXILIAR',
        tipo_bomba: tipobomba.AUXILIAR,
      });
    const update = asyncMock().mockResolvedValue({});
    const prisma = { bombas: { findUnique, update } };
    const service = new BombaHardwareStatusService(
      prisma as unknown as PrismaService,
    );
    const statusAt = new Date('2026-07-16T12:00:00.000Z');

    const result = await service.processStatusPayload(
      [
        {
          codigo_hardware: 'BOMBA_PRINCIPAL',
          ligada: true,
          disponivel: true,
          falha: false,
        },
        {
          codigo_hardware: 'BOMBA_AUXILIAR',
          ligada: false,
          disponivel: true,
          falha: false,
        },
      ],
      statusAt,
    );

    expect(result).toEqual([
      expect.objectContaining({
        id_bomba: 1,
        tipo_bomba: tipobomba.PRINCIPAL,
        ligada: true,
        disponivel: true,
        atualizado: true,
      }),
      expect.objectContaining({
        id_bomba: 2,
        tipo_bomba: tipobomba.AUXILIAR,
        ligada: false,
        disponivel: true,
        atualizado: true,
      }),
    ]);
    expect(update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          ligada_hardware: true,
          disponivel_hardware: true,
          ultimo_status_hardware_em: statusAt,
        }),
      }),
    );
  });

  it('persiste indisponibilidade quando o ESP32 informa falha', async () => {
    const update = asyncMock().mockResolvedValue({});
    const prisma = {
      bombas: {
        findUnique: asyncMock().mockResolvedValue({
          id_bomba: 2,
          codigo_hardware: 'BOMBA_AUXILIAR',
          tipo_bomba: tipobomba.AUXILIAR,
        }),
        update,
      },
    };
    const service = new BombaHardwareStatusService(
      prisma as unknown as PrismaService,
    );

    const [result] = await service.processStatusPayload(
      [
        {
          codigo_hardware: 'BOMBA_AUXILIAR',
          ligada: false,
          disponivel: true,
          falha: true,
        },
      ],
      new Date(),
    );

    expect(result.disponivel).toBe(false);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ disponivel_hardware: false }),
      }),
    );
  });

  it('nao atualiza cadastro para entrada invalida ou bomba desconhecida', async () => {
    const update = asyncMock();
    const prisma = {
      bombas: {
        findUnique: asyncMock().mockResolvedValue(null),
        update,
      },
    };
    const service = new BombaHardwareStatusService(
      prisma as unknown as PrismaService,
    );

    const result = await service.processStatusPayload(
      [
        { ligada: true, disponivel: true } as never,
        {
          codigo_hardware: 'BOMBA_INEXISTENTE',
          ligada: false,
          disponivel: true,
        },
      ],
      new Date(),
    );

    expect(result).toHaveLength(2);
    expect(result.every((entry) => !entry.atualizado)).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejeita id e codigo_hardware que apontam para bombas diferentes', async () => {
    const update = asyncMock();
    const prisma = {
      bombas: {
        findUnique: asyncMock().mockResolvedValue({
          id_bomba: 1,
          codigo_hardware: 'BOMBA_PRINCIPAL',
          tipo_bomba: tipobomba.PRINCIPAL,
        }),
        update,
      },
    };
    const service = new BombaHardwareStatusService(
      prisma as unknown as PrismaService,
    );

    const [result] = await service.processStatusPayload(
      [
        {
          id_bomba: 1,
          codigo_hardware: 'BOMBA_AUXILIAR',
          ligada: true,
          disponivel: true,
          falha: false,
        },
      ],
      new Date(),
    );

    expect(result.atualizado).toBe(false);
    expect(result.motivo).toBe('Identidade da bomba inconsistente.');
    expect(update).not.toHaveBeenCalled();
  });
});
