import {
  BadRequestException,
  ConflictException,
  ValidationPipe,
} from '@nestjs/common';
import { Prisma, statusconexaomqtt } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMqttConfigDTO } from '../dto/create-mqtt-config.dto';
import type { ActiveMqttConfig } from '../interfaces/active-mqtt-config.interface';
import { MqttConfigService } from './mqtt-config.service';

type AsyncMock<T = unknown> = Mock<(...args: unknown[]) => Promise<T>>;

type PrismaMock = {
  mqttconfiguracoes: {
    count: AsyncMock<number>;
    findUnique: AsyncMock;
    create: AsyncMock;
    update: AsyncMock;
    updateMany: AsyncMock<{ count: number }>;
  };
  processos: {
    findFirst: AsyncMock;
  };
  mqttmensagens: {
    create: AsyncMock;
    findFirst: AsyncMock;
  };
  mqttconfiguracoeshistorico: {
    create: AsyncMock;
    findMany: AsyncMock;
  };
  processosmqttconfiguracoeshistorico: {
    create: AsyncMock;
    findFirst: AsyncMock;
    update: AsyncMock;
  };
  $transaction: AsyncMock;
  $queryRaw: AsyncMock;
};

const asyncMock = <T = unknown>(): AsyncMock<T> =>
  jest.fn<(...args: unknown[]) => Promise<T>>();

describe('MqttConfigService - contrato de credenciais externas', () => {
  it('cria a configuracao com indicadores conservadores e replica no historico', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const created = makeConfig();
    prisma.mqttconfiguracoes.count.mockResolvedValue(0);
    prisma.mqttconfiguracoes.create.mockResolvedValue(created);
    prisma.mqttconfiguracoeshistorico.create.mockResolvedValue({
      id_mqtt_configuracao_historico: 1,
    });

    await service.createConfig(makeCreateDto(), 7);

    const createData = getCallData(prisma.mqttconfiguracoes.create);
    const historyData = getCallData(prisma.mqttconfiguracoeshistorico.create);
    expect(createData).toMatchObject({
      usuario_mqtt_configurado: false,
      senha_mqtt_configurada: false,
      credenciais_verificadas_em: null,
      ultima_falha_credenciais: null,
    });
    expect(createData).not.toHaveProperty('usuario_mqtt');
    expect(createData).not.toHaveProperty('senha_mqtt_hash');
    expect(historyData).toMatchObject({
      usuario_mqtt_configurado: false,
      senha_mqtt_configurada: false,
      credenciais_verificadas_em: null,
      ultima_falha_credenciais: null,
    });
  });

  it('atualiza somente parametros operacionais sem sobrescrever o estado das credenciais', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const verifiedAt = new Date('2026-07-17T12:00:00.000Z');
    const current = makeConfig({
      usuario_mqtt_configurado: true,
      senha_mqtt_configurada: true,
      credenciais_verificadas_em: verifiedAt,
    });
    prisma.mqttconfiguracoes.findUnique.mockResolvedValue(current);
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: 'config-lease-1',
        credenciais_atualizacao_bloqueada_ate: new Date(Date.now() + 60_000),
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue(null);
    prisma.mqttconfiguracoes.update.mockResolvedValue({
      ...current,
      broker_url: 'mqtt://localhost:1884',
      porta: 1884,
    });
    prisma.mqttconfiguracoeshistorico.create.mockResolvedValue({
      id_mqtt_configuracao_historico: 2,
    });

    await service.updateConfig({ porta: 1884 }, 7, 'config-lease-1');

    const updateData = getCallData(prisma.mqttconfiguracoes.update);
    const historyData = getCallData(prisma.mqttconfiguracoeshistorico.create);
    expect(updateData).not.toHaveProperty('usuario_mqtt_configurado');
    expect(updateData).not.toHaveProperty('senha_mqtt_configurada');
    expect(updateData).not.toHaveProperty('credenciais_verificadas_em');
    expect(updateData).not.toHaveProperty('ultima_falha_credenciais');
    expect(updateData).toMatchObject({
      broker_url: 'mqtt://localhost:1884',
      porta: 1884,
      status_conexao: statusconexaomqtt.DESCONECTADO,
    });
    expect(historyData).toMatchObject({
      usuario_mqtt_configurado: true,
      senha_mqtt_configurada: true,
      credenciais_verificadas_em: verifiedAt,
      ultima_falha_credenciais: null,
    });
  });

  it('rejeita usuario ou senha MQTT no DTO operacional legado', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      pipe.transform(
        {
          ...makeCreateDto(),
          usuario_mqtt: 'legado',
          senha_mqtt: 'nao-deve-entrar',
        },
        { type: 'body', metatype: CreateMqttConfigDTO },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita curingas em topicos operacionais usados para roteamento', () => {
    const service = new MqttConfigService(
      createPrismaMock() as unknown as PrismaService,
    );

    expect(() =>
      service.buildCandidateConfig(makeConfig(), {
        topico_leituras: 'tsea/+/leituras',
      }),
    ).toThrow(BadRequestException);
  });

  it('persiste apenas o estado das credenciais e registra historico quando solicitado', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const current = makeConfig();
    const verifiedAt = new Date('2026-07-17T13:00:00.000Z');
    prisma.mqttconfiguracoes.findUnique.mockResolvedValue(current);
    prisma.mqttconfiguracoes.update.mockResolvedValue({
      ...current,
      usuario_mqtt_configurado: true,
      senha_mqtt_configurada: true,
      credenciais_verificadas_em: verifiedAt,
    });
    prisma.mqttconfiguracoeshistorico.create.mockResolvedValue({
      id_mqtt_configuracao_historico: 3,
    });

    await service.updateCredentialState(
      {
        usuario_mqtt_configurado: true,
        senha_mqtt_configurada: true,
        credenciais_verificadas_em: verifiedAt,
        ultima_falha_credenciais: null,
      },
      {
        idUsuarioAlteracao: 7,
        recordHistory: true,
      },
    );

    const updateData = getCallData(prisma.mqttconfiguracoes.update);
    expect(updateData).toMatchObject({
      id_usuario_alteracao: 7,
      usuario_mqtt_configurado: true,
      senha_mqtt_configurada: true,
      credenciais_verificadas_em: verifiedAt,
      ultima_falha_credenciais: null,
    });
    expect(JSON.stringify(updateData)).not.toContain('usuario-arquivo');
    expect(JSON.stringify(updateData)).not.toContain('senha-arquivo');
    expect(prisma.mqttconfiguracoeshistorico.create).toHaveBeenCalledTimes(1);
  });

  it('adquire o lease somente depois de confirmar que nao existe processo operacional', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const now = new Date('2026-07-17T14:00:00.000Z');
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue(null);
    prisma.mqttconfiguracoes.update.mockResolvedValue(makeConfig());

    const expiresAt = await service.claimCredentialsUpdateLease(
      'lease-token-1',
      now,
    );

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.processos.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { status_processo: { in: ['EM_EXECUCAO', 'PAUSADO'] } },
            { status_partida: 'EM_ANDAMENTO' },
          ]),
        }),
      }),
    );
    expect(getCallData(prisma.mqttconfiguracoes.update)).toMatchObject({
      credenciais_atualizacao_token: 'lease-token-1',
      credenciais_atualizacao_bloqueada_ate: expiresAt,
    });
    expect(expiresAt).toEqual(new Date('2026-07-17T14:05:00.000Z'));
  });

  it('bloqueia a atualizacao antes do teste quando existe processo em execucao', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue({
      id_processo: 42,
      status_processo: 'EM_EXECUCAO',
      status_partida: 'CONCLUIDA',
    });

    await expect(
      service.claimCredentialsUpdateLease('lease-token-2'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.mqttconfiguracoes.update).not.toHaveBeenCalled();
  });

  it('identifica especificamente o bloqueio da configuracao por processo ativo', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue({
      id_processo: 44,
      status_processo: 'EM_EXECUCAO',
      status_partida: 'CONCLUIDA',
    });

    let response: unknown;
    try {
      await service.claimConfigurationUpdateLease('config-lease-active');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      response = (error as ConflictException).getResponse();
    }

    expect(response).toMatchObject({
      code: 'MQTT_CONFIG_UPDATE_BLOCKED_BY_ACTIVE_PROCESS',
      id_processo: 44,
    });
  });

  it('reserva uma operacao administrativa somente depois da verificacao operacional atomica', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const now = new Date('2026-07-19T18:00:00.000Z');
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue(null);
    prisma.mqttconfiguracoes.update.mockResolvedValue(makeConfig());

    await service.claimOperationalControlLease(
      'operational-lease-1',
      'CLOSE_ALL_VALVES',
      now,
    );

    const processQuery = prisma.processos.findFirst.mock.calls[0]?.[0];
    expect(JSON.stringify(processQuery)).toContain('status_encerramento_geral');
    expect(JSON.stringify(processQuery)).toContain('controle_bomba_expira_em');
    expect(JSON.stringify(processQuery)).toContain(
      'controle_valvula_expira_em',
    );
    expect(JSON.stringify(processQuery)).toContain('status_encerramento');
    expect(getCallData(prisma.mqttconfiguracoes.update)).toMatchObject({
      credenciais_atualizacao_token: 'operational-lease-1',
      credenciais_atualizacao_bloqueada_ate: new Date(
        '2026-07-19T18:05:00.000Z',
      ),
    });
  });

  it('executa mutacao de equipamento somente depois do lock e da revalidacao operacional', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const mutation = jest.fn<(...args: unknown[]) => Promise<string>>(() =>
      Promise.resolve('updated'),
    );
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue(null);

    await expect(
      service.executeProtectedEquipmentMutation('UPDATE_PUMP', mutation),
    ).resolves.toBe('updated');

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.processos.findFirst.mock.invocationCallOrder[0],
    );
    expect(prisma.processos.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      mutation.mock.invocationCallOrder[0],
    );
    expect(mutation).toHaveBeenCalledWith(prisma);
  });

  it('bloqueia mutacao de equipamento por todos os estados operacionais e nao chama o callback', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const mutation = jest.fn(() => Promise.resolve(undefined));
    const leaseExpiresAt = new Date(Date.now() + 60_000);
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue({
      id_processo: 71,
      status_processo: 'PAUSADO',
      status_partida: 'EM_ANDAMENTO',
      status_encerramento_geral: 'ENCERRANDO',
      processosauxiliares: {
        id_usuario_controle_bomba: 7,
        controle_bomba_expira_em: leaseExpiresAt,
      },
      processostanques: [
        {
          id_processo_tanque: 91,
          status_tanque_processo: 'VACUO_ESTABILIZADO',
          status_encerramento: 'VERIFICANDO_RETENCAO',
          processostanquesauxiliares: {
            id_usuario_controle_valvula: 8,
            controle_valvula_expira_em: leaseExpiresAt,
          },
        },
      ],
    });

    let response: unknown;
    try {
      await service.executeProtectedEquipmentMutation(
        'DEACTIVATE_SENSOR',
        mutation,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      response = (error as ConflictException).getResponse();
    }

    expect(response).toMatchObject({
      code: 'EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE',
      operacao: 'DEACTIVATE_SENSOR',
      id_processo: 71,
      bloqueios_operacionais: expect.arrayContaining([
        'PROCESS_ACTIVE_OR_PAUSED',
        'PROCESS_STARTUP_IN_PROGRESS',
        'GENERAL_CLOSURE_IN_PROGRESS',
        'TANK_LIFECYCLE_ACTIVE',
        'TANK_CLOSURE_IN_PROGRESS',
        'HUMAN_PUMP_LEASE_ACTIVE',
        'HUMAN_VALVE_LEASE_ACTIVE',
      ]),
    });
    expect(mutation).not.toHaveBeenCalled();
  });

  it('bloqueia mutacao de equipamento durante lease MQTT exclusivo', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const mutation = jest.fn(() => Promise.resolve(undefined));
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: 'mqtt-operation',
        credenciais_atualizacao_bloqueada_ate: new Date(Date.now() + 60_000),
      },
    ]);

    let response: unknown;
    try {
      await service.executeProtectedEquipmentMutation(
        'RESTORE_BACKUP',
        mutation,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      response = (error as ConflictException).getResponse();
    }

    expect(response).toMatchObject({
      code: 'EQUIPMENT_CONFIG_BLOCKED_BY_MQTT_EXCLUSIVE_OPERATION',
      operacao: 'RESTORE_BACKUP',
      bloqueios_operacionais: ['MQTT_EXCLUSIVE_OPERATION_IN_PROGRESS'],
    });
    expect(prisma.processos.findFirst).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
  });

  it('retorna todos os motivos que bloqueiam o comando administrativo', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const now = new Date('2026-07-19T18:00:00.000Z');
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue({
      id_processo: 51,
      status_processo: 'EM_EXECUCAO',
      status_partida: 'EM_ANDAMENTO',
      status_encerramento_geral: 'ENCERRANDO',
      processosauxiliares: {
        id_usuario_controle_bomba: 7,
        controle_bomba_expira_em: new Date('2026-07-19T18:01:00.000Z'),
      },
      processostanques: [
        {
          id_processo_tanque: 81,
          status_tanque_processo: 'GERANDO_VACUO',
          status_encerramento: 'VERIFICANDO_RETENCAO',
          processostanquesauxiliares: {
            id_usuario_controle_valvula: 8,
            controle_valvula_expira_em: new Date('2026-07-19T18:01:00.000Z'),
          },
        },
      ],
    });

    let response: unknown;
    try {
      await service.claimOperationalControlLease(
        'operational-lease-2',
        'OPEN_ALL_VALVES',
        now,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      response = (error as ConflictException).getResponse();
    }

    expect(response).toMatchObject({
      code: 'MQTT_OPERATION_BLOCKED_BY_PROCESS_STATE',
      operacao: 'OPEN_ALL_VALVES',
      id_processo: 51,
      bloqueios_operacionais: expect.arrayContaining([
        'PROCESS_ACTIVE_OR_PAUSED',
        'PROCESS_STARTUP_IN_PROGRESS',
        'GENERAL_CLOSURE_IN_PROGRESS',
        'TANK_LIFECYCLE_ACTIVE',
        'TANK_CLOSURE_IN_PROGRESS',
        'HUMAN_PUMP_LEASE_ACTIVE',
        'HUMAN_VALVE_LEASE_ACTIVE',
      ]),
    });
    expect(prisma.mqttconfiguracoes.update).not.toHaveBeenCalled();
  });

  it('impede duas operacoes administrativas MQTT simultaneas', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const now = new Date('2026-07-19T18:00:00.000Z');
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: 'outra-operacao',
        credenciais_atualizacao_bloqueada_ate: new Date(
          '2026-07-19T18:01:00.000Z',
        ),
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue(null);

    let response: unknown;
    try {
      await service.claimOperationalControlLease(
        'operational-lease-3',
        'DISCONNECT',
        now,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      response = (error as ConflictException).getResponse();
    }

    expect(response).toMatchObject({
      code: 'MQTT_EXCLUSIVE_OPERATION_ALREADY_IN_PROGRESS',
    });
    expect(prisma.mqttconfiguracoes.update).not.toHaveBeenCalled();
  });

  it('nao confunde lease humano expirado com bloqueio ativo', () => {
    const service = new MqttConfigService(
      createPrismaMock() as unknown as PrismaService,
    );
    const blockers = (
      service as never as {
        buildOperationalBlockers: (
          process: Record<string, unknown>,
          now: Date,
        ) => string[];
      }
    ).buildOperationalBlockers(
      {
        id_processo: 52,
        status_processo: 'CONFIGURADO',
        status_partida: 'CONCLUIDA',
        status_encerramento_geral: 'INATIVO',
        processosauxiliares: {
          id_usuario_controle_bomba: 7,
          controle_bomba_expira_em: new Date('2026-07-19T17:59:59.000Z'),
        },
        processostanques: [
          {
            id_processo_tanque: 82,
            status_tanque_processo: 'CONFIGURADO',
            status_encerramento: 'INATIVO',
            processostanquesauxiliares: {
              id_usuario_controle_valvula: 8,
              controle_valvula_expira_em: new Date('2026-07-19T17:59:59.000Z'),
            },
          },
        ],
      },
      new Date('2026-07-19T18:00:00.000Z'),
    );

    expect(blockers).toEqual([]);
  });

  it('bloqueia configuracao enquanto a emergencia nao tem confirmacao fisica', () => {
    const service = new MqttConfigService(
      createPrismaMock() as unknown as PrismaService,
    );
    const blockers = (
      service as never as {
        buildOperationalBlockers: (
          process: Record<string, unknown>,
          now: Date,
        ) => string[];
      }
    ).buildOperationalBlockers(
      {
        id_processo: 53,
        status_processo: 'INTERROMPIDO',
        parada_emergencia: true,
        status_partida: 'INATIVA',
        status_encerramento_geral: 'CONFIRMANDO_HARDWARE',
        processosauxiliares: null,
        processostanques: [],
      },
      new Date('2026-07-19T18:00:00.000Z'),
    );

    expect(blockers).toContain('EMERGENCY_STOP_HARDWARE_UNCONFIRMED');
  });

  it('libera configuracao depois da confirmacao global mesmo com closure historica de tanque bloqueada', () => {
    const service = new MqttConfigService(
      createPrismaMock() as unknown as PrismaService,
    );
    const blockers = (
      service as never as {
        buildOperationalBlockers: (
          process: Record<string, unknown>,
          now: Date,
        ) => string[];
      }
    ).buildOperationalBlockers(
      {
        id_processo: 54,
        status_processo: 'INTERROMPIDO',
        parada_emergencia: true,
        status_partida: 'INATIVA',
        status_encerramento_geral: 'CONCLUIDO',
        processosauxiliares: null,
        processostanques: [
          {
            id_processo_tanque: 84,
            status_tanque_processo: 'INTERROMPIDO',
            status_encerramento: 'BLOQUEADO',
            processostanquesauxiliares: null,
          },
        ],
      },
      new Date('2026-07-19T18:00:00.000Z'),
    );

    expect(blockers).toEqual([]);
  });

  it('mantem configuracao bloqueada depois da confirmacao enquanto o latch do ESP32 nao foi resetado', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const confirmedAt = new Date('2026-07-19T18:00:00.000Z');
    const mutation = jest.fn<(...args: unknown[]) => Promise<string>>(() =>
      Promise.resolve('updated'),
    );
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id_processo: 54,
        status_processo: 'INTERROMPIDO',
        parada_emergencia: true,
        status_partida: 'FALHA',
        status_encerramento_geral: 'CONCLUIDO',
        encerramento_geral_finalizado_em: confirmedAt,
      });
    prisma.mqttconfiguracoes.findUnique.mockResolvedValue(makeConfig());
    prisma.mqttmensagens.findFirst.mockResolvedValue({
      payload: {
        tipo: 'HARDWARE_STATUS',
        schema_version: 2,
        device_id: 'ESP32_TSEA_01',
        esp32_on: true,
        emergencia_ativa: true,
      },
      recebido_em: new Date('2026-07-19T18:00:01.000Z'),
      enviado_em: new Date('2026-07-19T18:00:01.000Z'),
    });

    await expect(
      service.executeProtectedEquipmentMutation('UPDATE_PUMP', mutation),
    ).rejects.toMatchObject({
      response: {
        code: 'EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE',
        id_processo: 54,
        bloqueios_operacionais: ['EMERGENCY_LATCH_RESET_REQUIRED'],
      },
    });
    expect(mutation).not.toHaveBeenCalled();
  });

  it('libera configuracao somente apos snapshot fresco com o latch resetado', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const confirmedAt = new Date('2026-07-19T18:00:00.000Z');
    const mutation = jest.fn<(...args: unknown[]) => Promise<string>>(() =>
      Promise.resolve('updated'),
    );
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id_processo: 54,
        status_processo: 'INTERROMPIDO',
        parada_emergencia: true,
        status_partida: 'FALHA',
        status_encerramento_geral: 'CONCLUIDO',
        encerramento_geral_finalizado_em: confirmedAt,
      });
    prisma.mqttconfiguracoes.findUnique.mockResolvedValue(makeConfig());
    prisma.mqttmensagens.findFirst.mockResolvedValue({
      payload: {
        tipo: 'HARDWARE_STATUS',
        schema_version: 2,
        device_id: 'ESP32_TSEA_01',
        esp32_on: true,
        emergencia_ativa: false,
      },
      recebido_em: new Date('2026-07-19T18:00:01.000Z'),
      enviado_em: new Date('2026-07-19T18:00:01.000Z'),
    });

    await expect(
      service.executeProtectedEquipmentMutation('UPDATE_PUMP', mutation),
    ).resolves.toBe('updated');
    expect(mutation).toHaveBeenCalledWith(prisma);
  });

  it('repete a transacao serializavel quando o Prisma retorna P2034', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('write conflict', {
        code: 'P2034',
        clientVersion: '7.8.0',
      }),
    );
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue(null);
    prisma.mqttconfiguracoes.update.mockResolvedValue(makeConfig());

    await expect(
      service.claimConfigurationUpdateLease('config-lease-retry'),
    ).resolves.toBeInstanceOf(Date);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('revalida o processo ativo ao renovar o lease antes da gravacao', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: 'lease-token-3',
        credenciais_atualizacao_bloqueada_ate: new Date(
          '2026-07-17T14:05:00.000Z',
        ),
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue({
      id_processo: 43,
      status_processo: 'PAUSADO',
      status_partida: 'CONCLUIDA',
    });

    await expect(
      service.renewCredentialsUpdateLease(
        'lease-token-3',
        new Date('2026-07-17T14:01:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.mqttconfiguracoes.updateMany).not.toHaveBeenCalled();
  });

  it('nao libera o lease de uma atualizacao concorrente', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    prisma.mqttconfiguracoes.updateMany.mockResolvedValue({ count: 0 });

    await service.releaseCredentialsUpdateLease('lease-token-antigo');

    expect(prisma.mqttconfiguracoes.updateMany).toHaveBeenCalledWith({
      where: {
        chave_configuracao: 'MQTT_PRINCIPAL',
        credenciais_atualizacao_token: 'lease-token-antigo',
      },
      data: {
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    });
  });

  it('nao grava a configuracao se o lease expirou antes da persistencia', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    prisma.mqttconfiguracoes.findUnique.mockResolvedValue(makeConfig());
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: 'config-lease-expirado',
        credenciais_atualizacao_bloqueada_ate: new Date(Date.now() - 1_000),
      },
    ]);

    await expect(
      service.updateConfig({ porta: 1884 }, 7, 'config-lease-expirado'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.mqttconfiguracoes.update).not.toHaveBeenCalled();
  });

  it('restaura o snapshot operacional usando o mesmo lease e registra historico', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const previous = makeConfig({
      broker_url: 'mqtt://broker-anterior:1883',
      topico_comandos: 'anterior/comandos',
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        id_mqtt_configuracao: 1,
        credenciais_atualizacao_token: 'config-lease-rollback',
        credenciais_atualizacao_bloqueada_ate: new Date(Date.now() + 60_000),
      },
    ]);
    prisma.processos.findFirst.mockResolvedValue(null);
    prisma.mqttconfiguracoes.update.mockResolvedValue(previous);
    prisma.mqttconfiguracoeshistorico.create.mockResolvedValue({
      id_mqtt_configuracao_historico: 4,
    });

    await service.restoreOperationalConfig(
      previous,
      7,
      'config-lease-rollback',
    );

    expect(getCallData(prisma.mqttconfiguracoes.update)).toMatchObject({
      broker_url: 'mqtt://broker-anterior:1883',
      topico_comandos: 'anterior/comandos',
      status_conexao: statusconexaomqtt.DESCONECTADO,
    });
    expect(prisma.mqttconfiguracoeshistorico.create).toHaveBeenCalledTimes(1);
  });

  it('ignora estado atrasado de um cliente cuja configuracao ja foi substituida', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const oldConfig = makeConfig({
      broker_url: 'mqtt://broker-antigo:1883',
    });
    prisma.mqttconfiguracoes.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateConnectionStatus(
        statusconexaomqtt.DESCONECTADO,
        undefined,
        oldConfig,
      ),
    ).resolves.toBe(false);

    expect(prisma.mqttconfiguracoes.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          broker_url: 'mqtt://broker-antigo:1883',
          porta: 1883,
          topico_comandos: 'tsea/comandos',
        }),
      }),
    );
  });

  it('preserva a ultima falha durante estados intermediarios e limpa ao conectar', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const config = makeConfig();
    prisma.mqttconfiguracoes.updateMany.mockResolvedValue({ count: 1 });

    await service.updateConnectionStatus(
      statusconexaomqtt.FALHA,
      'Broker indisponivel',
      config,
    );
    await service.updateConnectionStatus(
      statusconexaomqtt.DESCONECTADO,
      undefined,
      config,
    );
    await service.updateConnectionStatus(
      statusconexaomqtt.CONECTADO,
      undefined,
      config,
    );

    const writes = prisma.mqttconfiguracoes.updateMany.mock.calls.map(
      ([input]) =>
        (input as { data: { ultima_falha?: string | null } }).data.ultima_falha,
    );
    expect(writes).toEqual(['Broker indisponivel', undefined, null]);
  });

  it('registra snapshot de status recebido vinculado a configuracao principal', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const receivedAt = new Date('2026-07-19T18:00:01.000Z');
    const statusAt = new Date('2026-07-19T18:00:00.000Z');
    prisma.mqttconfiguracoes.findUnique.mockResolvedValue(makeConfig());
    prisma.mqttmensagens.create.mockResolvedValue({ id_mqtt_mensagem: 15 });

    await service.registerHardwareStatusSnapshot({
      topic: 'tsea/status',
      payload: {
        tipo: 'HARDWARE_STATUS',
        esp32_on: true,
        emergencia_ativa: true,
      },
      receivedAt,
      statusAt,
    });

    expect(prisma.mqttmensagens.create).toHaveBeenCalledWith({
      data: {
        id_mqtt_configuracao: 1,
        topico: 'tsea/status',
        payload: {
          tipo: 'HARDWARE_STATUS',
          esp32_on: true,
          emergencia_ativa: true,
        },
        direcao: 'RECEBIDA',
        origem: 'ESP32',
        recebido_em: receivedAt,
        enviado_em: statusAt,
      },
    });
  });

  it('le somente o snapshot mais recente estritamente posterior ao marcador', async () => {
    const prisma = createPrismaMock();
    const service = new MqttConfigService(prisma as unknown as PrismaService);
    const marker = new Date('2026-07-19T18:00:00.000Z');
    const receivedAt = new Date('2026-07-19T18:00:00.001Z');
    prisma.mqttconfiguracoes.findUnique.mockResolvedValue(makeConfig());
    prisma.mqttmensagens.findFirst.mockResolvedValue({
      id_mqtt_mensagem: 16,
      topico: 'tsea/status',
      payload: { tipo: 'HARDWARE_STATUS' },
      recebido_em: receivedAt,
      enviado_em: marker,
    });

    await expect(
      service.findLatestHardwareStatusSnapshotAfter(marker),
    ).resolves.toMatchObject({ id: 16, receivedAt });
    expect(prisma.mqttmensagens.findFirst).toHaveBeenCalledWith({
      where: {
        id_mqtt_configuracao: 1,
        topico: 'tsea/status',
        direcao: 'RECEBIDA',
        origem: 'ESP32',
        recebido_em: { gt: marker },
        payload: { path: ['tipo'], equals: 'HARDWARE_STATUS' },
      },
      orderBy: [{ recebido_em: 'desc' }, { id_mqtt_mensagem: 'desc' }],
      select: {
        id_mqtt_mensagem: true,
        topico: true,
        payload: true,
        recebido_em: true,
        enviado_em: true,
      },
    });
  });
});

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    mqttconfiguracoes: {
      count: asyncMock<number>(),
      findUnique: asyncMock(),
      create: asyncMock(),
      update: asyncMock(),
      updateMany: asyncMock<{ count: number }>(),
    },
    processos: {
      findFirst: asyncMock(),
    },
    mqttmensagens: {
      create: asyncMock(),
      findFirst: asyncMock(),
    },
    mqttconfiguracoeshistorico: {
      create: asyncMock(),
      findMany: asyncMock(),
    },
    processosmqttconfiguracoeshistorico: {
      create: asyncMock(),
      findFirst: asyncMock(),
      update: asyncMock(),
    },
    $transaction: asyncMock(),
    $queryRaw: asyncMock(),
  };

  prisma.$transaction.mockImplementation((callback) =>
    (callback as (tx: PrismaMock) => Promise<unknown>)(prisma),
  );

  return prisma;
}

function makeCreateDto(): CreateMqttConfigDTO {
  return {
    broker_url: 'mqtt://localhost',
    porta: 1883,
    topico_leituras: 'tsea/leituras',
    topico_comandos: 'tsea/comandos',
    topico_status: 'tsea/status',
    topico_alarmes: 'tsea/alarmes',
    topico_heartbeat: 'tsea/heartbeat',
    topico_acoplamentos: 'tsea/acoplamentos',
    topico_configuracoes: 'tsea/config',
    topico_acks: 'tsea/acks',
    retain_padrao: false,
    reconexao_automatica: true,
    timeout_comunicacao: 10_000,
    ativo: true,
    criado_em: '2026-07-17T00:00:00.000Z',
  };
}

function makeConfig(
  overrides: Partial<ActiveMqttConfig> = {},
): ActiveMqttConfig {
  return {
    id_mqtt_configuracao: 1,
    chave_configuracao: 'MQTT_PRINCIPAL',
    id_usuario_alteracao: null,
    broker_url: 'mqtt://localhost',
    porta: 1883,
    usuario_mqtt_configurado: false,
    senha_mqtt_configurada: false,
    credenciais_verificadas_em: null,
    ultima_falha_credenciais: null,
    topico_leituras: 'tsea/leituras',
    topico_comandos: 'tsea/comandos',
    topico_alarmes: 'tsea/alarmes',
    topico_heartbeat: 'tsea/heartbeat',
    topico_status: 'tsea/status',
    topico_acoplamentos: 'tsea/acoplamentos',
    topico_configuracoes: 'tsea/config',
    topico_acks: 'tsea/acks',
    reconexao_automatica: true,
    timeout_comunicacao: 10_000,
    status_conexao: statusconexaomqtt.DESCONECTADO,
    ultima_conexao: null,
    ultima_sincronizacao: null,
    ultima_falha: null,
    criado_em: new Date('2026-07-17T00:00:00.000Z'),
    atualizado_em: new Date('2026-07-17T00:00:00.000Z'),
    ativo: true,
    ...overrides,
  };
}

function getCallData(mock: AsyncMock): Record<string, unknown> {
  const input = mock.mock.calls[0][0] as {
    data: Record<string, unknown>;
  };

  return input.data;
}
