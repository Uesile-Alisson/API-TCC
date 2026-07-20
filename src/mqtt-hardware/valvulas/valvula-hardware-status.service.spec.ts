import { describe, expect, it, jest } from '@jest/globals';
import { StatusValvula } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { ValvulaHardwareStatusService } from './valvula-hardware-status.service';

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('ValvulaHardwareStatusService', () => {
  it('persiste ACK true FECHADA como estado fisico da valvula', async () => {
    const prisma = makePrisma();
    const service = new ValvulaHardwareStatusService(
      prisma as unknown as PrismaService,
    );
    const statusAt = new Date('2026-07-01T12:00:00.000Z');

    const result = await service.processStatusPayload(
      {
        '1': {
          id_valvula: 1,
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: false,
        },
      },
      statusAt,
    );

    expect(result[0]).toEqual(
      expect.objectContaining({
        id_valvula: 1,
        status_valvula: StatusValvula.FECHADA,
        ack: true,
        falha: false,
        atualizado: true,
      }),
    );
    expect(prisma.valvulas.update).toHaveBeenCalledWith({
      where: { id_valvula: 1 },
      data: {
        status_valvula: StatusValvula.FECHADA,
        ultimo_acionamento: statusAt,
        atualizado_em: expect.any(Date),
      },
    });
  });

  it('persiste falha true como FALHA', async () => {
    const prisma = makePrisma();
    const service = new ValvulaHardwareStatusService(
      prisma as unknown as PrismaService,
    );

    await service.processStatusPayload(
      {
        '1': {
          id_valvula: 1,
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: true,
        },
      },
      new Date(),
    );

    expect(prisma.valvulas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_valvula: StatusValvula.FALHA,
        }),
      }),
    );
  });

  it('ACK false nao aprova estado fisico e persiste DESCONHECIDA', async () => {
    const prisma = makePrisma();
    const service = new ValvulaHardwareStatusService(
      prisma as unknown as PrismaService,
    );

    await service.processStatusPayload(
      {
        '1': {
          id_valvula: 1,
          status_valvula: StatusValvula.FECHADA,
          ack: false,
          falha: false,
        },
      },
      new Date(),
    );

    expect(prisma.valvulas.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_valvula: StatusValvula.DESCONHECIDA,
        }),
      }),
    );
  });

  it('processa lista v2 e resolve valvula pelo codigo de hardware', async () => {
    const prisma = makePrisma();
    const service = new ValvulaHardwareStatusService(
      prisma as unknown as PrismaService,
    );

    const result = await service.processStatusPayload(
      [
        {
          codigo_hardware: 'VP_T1',
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: false,
        },
        {
          codigo_hardware: 'VA_T1',
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: false,
        },
      ],
      new Date(),
    );

    expect(prisma.valvulas.findUnique).toHaveBeenCalledWith({
      where: { codigo_hardware: 'VP_T1' },
      select: { id_valvula: true, ativo: true },
    });
    expect(prisma.valvulas.findUnique).toHaveBeenNthCalledWith(2, {
      where: { codigo_hardware: 'VA_T1' },
      select: { id_valvula: true, ativo: true },
    });
    expect(result[0]).toEqual(
      expect.objectContaining({ id_valvula: 1, atualizado: true }),
    );
  });

  function makePrisma() {
    return {
      valvulas: {
        findUnique: asyncMock().mockResolvedValue({
          id_valvula: 1,
          ativo: true,
        }),
        update: asyncMock().mockResolvedValue({}),
      },
    };
  }
});
