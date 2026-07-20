import { nivelacesso, StatusValvula, tipobomba } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoLifecycleService } from '../lifecycle';
import { ProcessosRepository } from '../processos.repository';
import { ProcessoMqttOrchestratorService } from './processo-mqtt-orchestrator.service';
import { ProcessoStartupService } from './processo-startup.service';
import {
  ProcessoMqttCommandContext,
  ProcessoMqttStartHooks,
} from './processo-mqtt.types';

describe('ProcessoStartupService', () => {
  it('persiste as etapas, confirma telemetria fresca e conclui a partida atomicamente', async () => {
    const { service, repository, orchestrator } = makeService();
    const persistAudit = jest
      .fn<() => Promise<void>>()
      .mockResolvedValue(undefined);
    const internals = service as never as {
      beginStartup: (...args: unknown[]) => Promise<unknown>;
      touchStage: (...args: unknown[]) => Promise<number>;
      waitForHardwareState: (...args: unknown[]) => Promise<void>;
    };
    jest.spyOn(internals, 'beginStartup').mockResolvedValue({
      version: 1,
      attempt: 2,
      marker: new Date('2026-07-17T00:00:00.000Z'),
    });
    const touch = jest
      .spyOn(internals, 'touchStage')
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(6);
    const wait = jest
      .spyOn(internals, 'waitForHardwareState')
      .mockResolvedValue(undefined);
    orchestrator.prepareHardwareForStart.mockImplementation(
      async (_context, hooks) => {
        await hooks?.onStage?.('SINCRONIZANDO_HARDWARE');
        return successResult();
      },
    );
    orchestrator.startVacuumOperation.mockImplementation(
      async (_context, hooks) => {
        await hooks?.onStage?.('CARREGANDO_PROCESSO');
        await hooks?.onStage?.('ABRINDO_VALVULAS_PRINCIPAIS');
        await hooks?.onStage?.('LIGANDO_BOMBA_PRINCIPAL');
        return successResult();
      },
    );
    repository.applyLifecycleTransition.mockResolvedValue({
      id_processo: 10,
      status_processo: 'EM_EXECUCAO',
    });

    const result = await service.execute({
      id_processo: 10,
      user: user(),
      mqttContext: { id_processo: 10, tanques: [], sensores: [] },
      persistAudit,
    });

    expect(touch).toHaveBeenCalledTimes(5);
    expect(wait).toHaveBeenNthCalledWith(
      1,
      10,
      new Date('2026-07-17T00:00:00.000Z'),
      'SAFE',
    );
    expect(wait).toHaveBeenNthCalledWith(
      2,
      10,
      new Date('2026-07-17T00:00:00.000Z'),
      'RUNNING',
    );
    expect(repository.applyLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        id_processo: 10,
        startupCompletion: expect.objectContaining({ expectedVersion: 6 }),
        persistAudit,
      }),
    );
    expect(result).toMatchObject({ status_processo: 'EM_EXECUCAO' });
  });

  it('executa rollback e nao conclui o processo quando um comando falha', async () => {
    const { service, repository, orchestrator } = makeService();
    const internals = service as never as {
      beginStartup: (...args: unknown[]) => Promise<unknown>;
      touchStage: (...args: unknown[]) => Promise<number>;
      waitForHardwareState: (...args: unknown[]) => Promise<void>;
      claimRollback: (...args: unknown[]) => Promise<number>;
      finishFailedStartup: (...args: unknown[]) => Promise<void>;
    };
    jest.spyOn(internals, 'beginStartup').mockResolvedValue({
      version: 1,
      attempt: 1,
      marker: new Date(),
    });
    jest.spyOn(internals, 'touchStage').mockResolvedValue(2);
    jest.spyOn(internals, 'waitForHardwareState').mockResolvedValue(undefined);
    jest.spyOn(internals, 'claimRollback').mockResolvedValue(3);
    const finishFailure = jest
      .spyOn(internals, 'finishFailedStartup')
      .mockResolvedValue(undefined);
    orchestrator.prepareHardwareForStart.mockResolvedValue(successResult());
    orchestrator.startVacuumOperation.mockResolvedValue({
      ...successResult(),
      success: false,
      message: 'ACK da bomba ausente.',
    });
    orchestrator.shutdownAllActuators.mockResolvedValue(successResult());

    await expect(
      service.execute({
        id_processo: 10,
        user: user(),
        mqttContext: { id_processo: 10, tanques: [], sensores: [] },
      }),
    ).rejects.toThrow('ACK da bomba ausente');

    expect(orchestrator.shutdownAllActuators).toHaveBeenCalledWith(
      10,
      'process-startup-p10-r1-rollback',
    );
    expect(finishFailure).toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).not.toHaveBeenCalled();
  });

  it('ainda desliga atuadores quando a parada de emergencia vence a corrida do rollback da partida', async () => {
    const { service, prisma, orchestrator } = makeService();
    const internals = service as never as {
      rollbackOrScheduleRetry: (input: {
        idProcesso: number;
        version: number;
        correlationPrefix: string;
        originalError: unknown;
      }) => Promise<void>;
      claimRollback: (...args: unknown[]) => Promise<number>;
    };
    jest
      .spyOn(internals, 'claimRollback')
      .mockRejectedValue(new ConflictException('emergencia venceu o CAS'));
    prisma.processos.findUnique.mockResolvedValue({
      parada_emergencia: true,
      status_processo: 'INTERROMPIDO',
    });
    orchestrator.shutdownAllActuators.mockResolvedValue(successResult());

    await expect(
      internals.rollbackOrScheduleRetry({
        idProcesso: 10,
        version: 4,
        correlationPrefix: 'startup-rollback',
        originalError: new Error('ACK atrasado'),
      }),
    ).resolves.toBeUndefined();
    expect(orchestrator.shutdownAllActuators).toHaveBeenCalledWith(
      10,
      'startup-rollback-emergency-race',
    );
  });

  it('recupera partida expirada apos reinicializacao executando parada segura', async () => {
    const { service, prisma, orchestrator } = makeService();
    prisma.processos.findMany.mockResolvedValue([
      {
        id_processo: 10,
        partida_versao: 4,
        partida_tentativa: 2,
        partida_ultimo_erro: null,
      },
    ]);
    prisma.processos.updateMany.mockResolvedValue({ count: 1 });
    orchestrator.shutdownAllActuators.mockResolvedValue(successResult());

    await service.recoverExpiredStartups(new Date('2026-07-17T00:01:00.000Z'));

    expect(orchestrator.shutdownAllActuators).toHaveBeenCalledWith(
      10,
      'process-startup-p10-r2-recovery',
    );
    expect(prisma.processos.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_partida: 'FALHA',
          etapa_partida: 'FALHA',
        }),
      }),
    );
  });

  it('aceita estado operacional somente com timestamps posteriores ao marcador', async () => {
    const { service, prisma } = makeService();
    const marker = new Date('2026-07-17T00:00:00.000Z');
    prisma.processos.findUnique.mockResolvedValue({
      processostanques: [{ id_tanque: 1 }],
    });
    prisma.valvulas.findMany.mockResolvedValue([
      valve(1, tipobomba.PRINCIPAL, StatusValvula.ABERTA, marker),
      valve(1, tipobomba.AUXILIAR, StatusValvula.FECHADA, marker),
    ]);
    prisma.bombas.findMany.mockResolvedValue([
      pump(tipobomba.PRINCIPAL, true, marker),
      pump(tipobomba.AUXILIAR, false, marker),
    ]);
    const matches = await (
      service as never as {
        hardwareStateMatches: (
          id: number,
          date: Date,
          mode: 'RUNNING',
        ) => Promise<boolean>;
      }
    ).hardwareStateMatches(10, marker, 'RUNNING');

    expect(matches).toBe(true);

    prisma.bombas.findMany.mockResolvedValueOnce([
      pump(tipobomba.PRINCIPAL, true, new Date('2026-07-16T23:59:59.999Z')),
      pump(tipobomba.AUXILIAR, false, marker),
    ]);
    await expect(
      (
        service as never as {
          hardwareStateMatches: (
            id: number,
            date: Date,
            mode: 'RUNNING',
          ) => Promise<boolean>;
        }
      ).hardwareStateMatches(10, marker, 'RUNNING'),
    ).resolves.toBe(false);
  });

  it('nao inicia processo enquanto uma atualizacao MQTT possui lease ativo', async () => {
    const { service, prisma } = makeService();
    prisma.processos.findFirst.mockResolvedValue(null);
    prisma.$queryRaw.mockResolvedValue([
      {
        credenciais_atualizacao_bloqueada_ate: new Date(Date.now() + 60_000),
      },
    ]);

    await expect(
      (
        service as never as {
          beginStartup: (id: number, userId: number) => Promise<unknown>;
        }
      ).beginStartup(10, 7),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.processos.findUnique).not.toHaveBeenCalled();
    expect(prisma.processos.updateMany).not.toHaveBeenCalled();
  });

  it('bloqueia nova partida enquanto outra parada de emergencia nao foi confirmada', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValue([
      { credenciais_atualizacao_bloqueada_ate: null },
    ]);
    prisma.processos.findFirst.mockResolvedValue({
      id_processo: 9,
      status_encerramento_geral: 'CONFIRMANDO_HARDWARE',
      encerramento_geral_ultimo_erro: null,
    });

    await expect(
      (
        service as never as {
          beginStartup: (id: number, userId: number) => Promise<unknown>;
        }
      ).beginStartup(10, 7),
    ).rejects.toMatchObject({
      response: {
        code: 'PROCESS_START_BLOCKED_BY_UNCONFIRMED_EMERGENCY_STOP',
        id_processo_bloqueante: 9,
      },
    });
    expect(prisma.processos.findUnique).not.toHaveBeenCalled();
    expect(prisma.processos.updateMany).not.toHaveBeenCalled();
  });

  it('bloqueia nova partida sem snapshot do controlador posterior a parada de emergencia confirmada', async () => {
    const { service, prisma } = makeService();
    const confirmedAt = new Date('2026-07-19T18:00:00.000Z');
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 3,
        topico_status: 'tsea/status',
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id_processo: 9,
        status_encerramento_geral: 'CONCLUIDO',
        encerramento_geral_finalizado_em: confirmedAt,
      });
    prisma.mqttmensagens.findFirst.mockResolvedValue(null);

    await expect(
      (
        service as never as {
          beginStartup: (id: number, userId: number) => Promise<unknown>;
        }
      ).beginStartup(10, 7),
    ).rejects.toMatchObject({
      response: {
        code: 'PROCESS_START_BLOCKED_BY_EMERGENCY_LATCH_RESET_REQUIRED',
        id_processo_bloqueante: 9,
        status_confirmacao: 'CONCLUIDO',
      },
    });
    expect(prisma.mqttmensagens.findFirst).toHaveBeenCalledWith({
      where: {
        id_mqtt_configuracao: 3,
        topico: 'tsea/status',
        direcao: 'RECEBIDA',
        origem: 'ESP32',
        recebido_em: { gt: confirmedAt },
        payload: { path: ['tipo'], equals: 'HARDWARE_STATUS' },
      },
      select: { payload: true, recebido_em: true, enviado_em: true },
      orderBy: [{ recebido_em: 'desc' }, { id_mqtt_mensagem: 'desc' }],
    });
    expect(prisma.processos.findUnique).not.toHaveBeenCalled();
    expect(prisma.processos.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'ESP32 offline',
      payload: {
        tipo: 'HARDWARE_STATUS',
        schema_version: 2,
        device_id: 'ESP32_TSEA_01',
        esp32_on: false,
        emergencia_ativa: false,
      },
    },
    {
      description: 'latch ainda ativo',
      payload: {
        tipo: 'HARDWARE_STATUS',
        schema_version: 2,
        device_id: 'ESP32_TSEA_01',
        esp32_on: true,
        emergencia_ativa: true,
      },
    },
    {
      description: 'contrato legado sem identidade do controlador',
      payload: {
        tipo: 'HARDWARE_STATUS',
        esp32_on: true,
        emergencia_ativa: false,
      },
    },
    {
      description: 'payload invalido',
      payload: ['HARDWARE_STATUS'],
    },
  ])('mantem a partida bloqueada quando $description', async ({ payload }) => {
    const { service, prisma } = makeService();
    prepareConfirmedEmergency(prisma, payload);

    await expect(
      (
        service as never as {
          beginStartup: (id: number, userId: number) => Promise<unknown>;
        }
      ).beginStartup(10, 7),
    ).rejects.toMatchObject({
      response: {
        code: 'PROCESS_START_BLOCKED_BY_EMERGENCY_LATCH_RESET_REQUIRED',
      },
    });
    expect(prisma.processos.findUnique).not.toHaveBeenCalled();
  });

  it('permite nova partida somente com ESP32 online e latch resetado em status fresco', async () => {
    const { service, prisma } = makeService();
    prepareConfirmedEmergency(prisma, {
      tipo: 'HARDWARE_STATUS',
      schema_version: 2,
      device_id: 'ESP32_TSEA_01',
      esp32_on: true,
      emergencia_ativa: false,
    });
    prisma.processos.findUnique.mockResolvedValue({
      status_processo: 'CONFIGURADO',
      status_partida: 'NAO_INICIADA',
      partida_versao: 4,
      partida_tentativa: 1,
    });
    prisma.processos.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      (
        service as never as {
          beginStartup: (id: number, userId: number) => Promise<unknown>;
        }
      ).beginStartup(10, 7),
    ).resolves.toMatchObject({ version: 5, attempt: 2 });
    expect(prisma.processos.updateMany).toHaveBeenCalledTimes(1);
  });
});

function makeService() {
  const prisma = {
    processos: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      updateMany: jest.fn<(...args: unknown[]) => Promise<{ count: number }>>(),
    },
    valvulas: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    },
    bombas: {
      findMany: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    },
    mqttmensagens: {
      findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown[]>>(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback: unknown) =>
    (callback as (tx: typeof prisma) => Promise<unknown>)(prisma),
  );
  const repository = {
    applyLifecycleTransition:
      jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  const orchestrator = {
    prepareHardwareForStart:
      jest.fn<
        (
          context: ProcessoMqttCommandContext,
          hooks?: ProcessoMqttStartHooks,
        ) => Promise<ReturnType<typeof successResult>>
      >(),
    startVacuumOperation:
      jest.fn<
        (
          context: ProcessoMqttCommandContext,
          hooks?: ProcessoMqttStartHooks,
        ) => Promise<ReturnType<typeof successResult>>
      >(),
    shutdownAllActuators:
      jest.fn<
        (
          idProcesso: number,
          correlationPrefix?: string,
        ) => Promise<ReturnType<typeof successResult>>
      >(),
  };
  const service = new ProcessoStartupService(
    prisma as unknown as PrismaService,
    repository as unknown as ProcessosRepository,
    new ProcessoLifecycleService(),
    orchestrator as unknown as ProcessoMqttOrchestratorService,
  );
  return { service, prisma, repository, orchestrator };
}

function prepareConfirmedEmergency(
  prisma: ReturnType<typeof makeService>['prisma'],
  payload: unknown,
) {
  prisma.$queryRaw.mockResolvedValue([
    {
      id_mqtt_configuracao: 3,
      topico_status: 'tsea/status',
      credenciais_atualizacao_bloqueada_ate: null,
    },
  ]);
  prisma.processos.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
    id_processo: 9,
    status_encerramento_geral: 'CONCLUIDO',
    encerramento_geral_finalizado_em: new Date('2026-07-19T18:00:00.000Z'),
  });
  prisma.mqttmensagens.findFirst.mockResolvedValue({
    payload,
    recebido_em: new Date('2026-07-19T18:00:01.000Z'),
    enviado_em: new Date('2026-07-19T18:00:01.000Z'),
  });
}

function successResult() {
  return {
    success: true,
    message: 'ok',
    id_processo: 10,
  };
}

function user() {
  return {
    sub: 7,
    login: 'tecnico',
    id_nivel_acesso: 2,
    nivel_acesso: nivelacesso.TECNICO,
  };
}

function valve(
  id_tanque: number,
  tipo_bomba: tipobomba,
  status_valvula: StatusValvula,
  ultimo_acionamento: Date,
) {
  return {
    id_tanque,
    status_valvula,
    ultimo_acionamento,
    bombas: { tipo_bomba },
  };
}

function pump(
  tipo_bomba: tipobomba,
  ligada_hardware: boolean,
  ultimo_status_hardware_em: Date,
) {
  return { tipo_bomba, ligada_hardware, ultimo_status_hardware_em };
}
