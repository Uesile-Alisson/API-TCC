import { statuscomandomqtt } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from '../../prisma/prisma.service';
import { CommandLedgerService } from './command-ledger.service';

describe('CommandLedgerService', () => {
  it('registra o comando antes da publicacao MQTT', async () => {
    const { service, prisma } = makeService();
    prisma.comandosmqtt.findUnique.mockResolvedValue(null);
    prisma.comandosmqtt.create.mockResolvedValue({ id_comando_mqtt: 1 });

    const prepared = await service.prepare(command());

    expect(prepared).toEqual({ shouldPublish: true, restoredAck: null });
    expect(prisma.comandosmqtt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correlation_id: 'startup-10-load',
        status: statuscomandomqtt.PENDENTE,
        id_processo: 10,
        tentativas: 1,
      }),
    });
  });

  it('restaura ACK EXECUTADO depois de reiniciar sem republicar', async () => {
    const { service, prisma } = makeService();
    prisma.comandosmqtt.findUnique.mockResolvedValue(
      persisted({
        status: statuscomandomqtt.EXECUTADO,
        ack_recebido_em: new Date('2026-07-17T00:00:01.000Z'),
        topico_ack: 'tsea/acks',
        mensagem_ack: 'Aplicado.',
        payload_ack: {
          codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
          id_processo: 10,
        },
      }),
    );

    const prepared = await service.prepare(command());

    expect(prepared.shouldPublish).toBe(false);
    expect(prepared.restoredAck).toMatchObject({
      correlation_id: 'startup-10-load',
      status: 'EXECUTADO',
      mensagem: 'Aplicado.',
      id_processo: 10,
    });
    expect(prisma.comandosmqtt.create).not.toHaveBeenCalled();
  });

  it('persiste ACK final e encerra o registro para auditoria', async () => {
    const { service, prisma } = makeService();
    prisma.comandosmqtt.updateMany.mockResolvedValue({ count: 1 });
    const receivedAt = new Date('2026-07-17T00:00:01.000Z');

    await service.recordAck({
      correlation_id: 'startup-10-load',
      comando: 'INICIAR_PROCESSO_VACUO',
      status: 'EXECUTADO',
      codigo_hardware: null,
      id_processo: 10,
      mensagem: 'Aplicado.',
      erro: null,
      recebido_em: receivedAt,
      topic: 'tsea/acks',
    });

    expect(prisma.comandosmqtt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: statuscomandomqtt.EXECUTADO,
          finalizado_em: receivedAt,
          ack_recebido_em: receivedAt,
        }),
      }),
    );
  });

  it('permite nova tentativa idempotente somente depois do timeout persistido', async () => {
    const { service, prisma } = makeService();
    prisma.comandosmqtt.findUnique.mockResolvedValue(
      persisted({
        status: statuscomandomqtt.TIMEOUT,
        atualizado_em: new Date('2026-07-16T23:00:00.000Z'),
      }),
    );
    prisma.comandosmqtt.updateMany.mockResolvedValue({ count: 1 });

    const prepared = await service.prepare(command());

    expect(prepared.shouldPublish).toBe(true);
    expect(prisma.comandosmqtt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: statuscomandomqtt.PENDENTE,
          tentativas: { increment: 1 },
        }),
      }),
    );
  });
});

function makeService() {
  const prisma = {
    comandosmqtt: {
      findUnique: jest.fn<(...args: unknown[]) => Promise<any>>(),
      create: jest.fn<(...args: unknown[]) => Promise<any>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
  };
  return {
    service: new CommandLedgerService(prisma as unknown as PrismaService),
    prisma,
  };
}

function command() {
  return {
    correlationId: 'startup-10-load',
    comando: 'INICIAR_PROCESSO_VACUO' as const,
    topic: 'tsea/comandos',
    payload: {
      tipo: 'INICIAR_PROCESSO_VACUO',
      correlation_id: 'startup-10-load',
      id_processo: 10,
    },
    qos: 1 as const,
    retain: false,
    timeoutMs: 10_000,
  };
}

function persisted(overrides: Record<string, unknown> = {}) {
  return {
    id_comando_mqtt: 1,
    correlation_id: 'startup-10-load',
    comando: 'INICIAR_PROCESSO_VACUO',
    status: statuscomandomqtt.PUBLICADO,
    id_processo: 10,
    id_processo_tanque: null,
    id_usuario: null,
    topico_publicacao: 'tsea/comandos',
    topico_ack: null,
    payload: {},
    payload_ack: null,
    qos: 1,
    retain: false,
    tentativas: 1,
    publicado_em: new Date(),
    ack_recebido_em: null,
    finalizado_em: null,
    mensagem_ack: null,
    erro: null,
    criado_em: new Date(),
    atualizado_em: new Date(),
    ...overrides,
  };
}
