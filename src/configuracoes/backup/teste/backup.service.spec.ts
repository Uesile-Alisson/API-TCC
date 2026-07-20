import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  origembackup,
  origemlogoperacional,
  Prisma,
  resultadooperacao,
  StatusValvula,
  statusbackup,
  statusbomba,
  statusconexaomqtt,
  statusgeralsistema,
  statustanque,
  TipoValvula,
  tipobackup,
  tipobomba,
  tipologoperacional,
  funcaovalvula,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Mock } from 'jest-mock';
import type { AuthenticatedUser } from '../../../auth/types/authenticated-user.type';
import { MqttConfigService } from '../../../mqtt-hardware/config/mqtt-config.service';
import { MqttClientService } from '../../../mqtt-hardware/connection/mqtt-client.service';
import { MqttHealthService } from '../../../mqtt-hardware/connection/mqtt-health.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { BackupService } from '../backup.service';

type AsyncMock<T = unknown> = Mock<(...args: unknown[]) => Promise<T>>;

type PrismaMock = {
  backups: {
    create: AsyncMock;
    findMany: AsyncMock;
    findUnique: AsyncMock;
    count: AsyncMock<number>;
    update: AsyncMock;
  };
  configuracoessistema: {
    findFirst: AsyncMock;
    update: AsyncMock;
    create: AsyncMock;
  };
  tanques: {
    findMany: AsyncMock;
    upsert: AsyncMock;
  };
  bombas: {
    findMany: AsyncMock;
    upsert: AsyncMock;
  };
  valvulas: {
    findMany: AsyncMock;
    upsert: AsyncMock;
  };
  mqttconfiguracoes: {
    findUnique: AsyncMock;
    upsert: AsyncMock;
  };
  mqttconfiguracoeshistorico: {
    create: AsyncMock;
  };
  logsoperacionais: {
    create: AsyncMock;
  };
  $transaction: AsyncMock;
};

type TransactionCallback = (tx: PrismaMock) => Promise<unknown>;

const asyncMock = <T = unknown>(): AsyncMock<T> =>
  jest.fn<(...args: unknown[]) => Promise<T>>();

describe('BackupService', () => {
  let service: BackupService;
  let prisma: PrismaMock;
  let mqttConfigService: {
    executeProtectedEquipmentMutation: AsyncMock;
  };
  let mqttClientService: { disconnect: AsyncMock };
  let mqttHealthService: { reloadHealthConfig: AsyncMock };
  let systemConfigCache: { invalidate: ReturnType<typeof jest.fn> };
  let readingContextCache: { invalidate: ReturnType<typeof jest.fn> };

  beforeEach(() => {
    prisma = createPrismaMock();
    currentPrisma = prisma;
    mqttConfigService = {
      executeProtectedEquipmentMutation: asyncMock(),
    };
    mqttConfigService.executeProtectedEquipmentMutation.mockImplementation(
      async (_action, mutation) => {
        const callback = mutation as (tx: PrismaMock) => Promise<unknown>;
        return await callback(prisma);
      },
    );
    mqttClientService = { disconnect: asyncMock() };
    mqttClientService.disconnect.mockResolvedValue({
      success: true,
      message: 'desconectado',
      timestamp: new Date(),
    });
    mqttHealthService = { reloadHealthConfig: asyncMock() };
    mqttHealthService.reloadHealthConfig.mockResolvedValue(undefined);
    systemConfigCache = { invalidate: jest.fn() };
    readingContextCache = { invalidate: jest.fn() };
    service = new BackupService(
      prisma as unknown as PrismaService,
      mqttConfigService as unknown as MqttConfigService,
      mqttClientService as unknown as MqttClientService,
      mqttHealthService as unknown as MqttHealthService,
      systemConfigCache as never,
      readingContextCache as never,
    );
  });

  it('gera backup SISTEMA sem incluir MQTT ou dados operacionais', async () => {
    arrangeSystemSnapshot();
    prisma.backups.create.mockImplementation((input) =>
      Promise.resolve(makeBackupRecordFromCreate(input)),
    );

    const result = await service.create(
      { tipo_backup: tipobackup.SISTEMA },
      makeCurrentUser(),
    );
    const createData = getDataFromFirstCall(prisma.backups.create);
    const snapshot = createData.snapshot as Record<string, unknown>;
    const sistema = snapshot.sistema as Record<string, unknown>;

    expect(prisma.configuracoessistema.findFirst).toHaveBeenCalled();
    expect(prisma.tanques.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          excluido_em: null,
          status_tanque: { not: statustanque.INATIVO },
        }),
      }),
    );
    expect(prisma.bombas.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_configuracao_sistema: 1 },
      }),
    );
    expect(prisma.valvulas.findMany).toHaveBeenCalled();
    expect(snapshot).toHaveProperty('sistema');
    expect(snapshot).not.toHaveProperty('mqtt');
    expect(sistema).toHaveProperty('configuracao_sistema');
    expect(sistema).toHaveProperty('tanques');
    expect(sistema).toHaveProperty('bombas');
    expect(sistema).toHaveProperty('valvulas');
    expect(JSON.stringify(snapshot)).not.toContain('processos');
    expect(JSON.stringify(snapshot)).not.toContain('leituras');
    expect(JSON.stringify(snapshot)).not.toContain('alarmes');
    expect(JSON.stringify(snapshot)).not.toContain('eventos');
    expect(JSON.stringify(snapshot)).not.toContain('relatorios');
    expect(createData).toMatchObject({
      tipo_backup: tipobackup.SISTEMA,
      status_backup: statusbackup.GERADO,
      storage_provider: 'POSTGRES_JSON',
      content_type: 'application/json',
      caminho_arquivo: null,
    });
    expect(createData.hash_arquivo).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof createData.tamanho_bytes).toBe('bigint');
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo_log: tipologoperacional.BACKUP,
        acao: 'GERAR_BACKUP',
        resultado: resultadooperacao.SUCESSO,
      }),
    });
    expect(result).toMatchObject({ id_backup: 10 });
  });

  it('gera backup MQTT somente com indicadores de credenciais', async () => {
    arrangeMqttSnapshot();
    prisma.backups.create.mockImplementation((input) =>
      Promise.resolve(makeBackupRecordFromCreate(input)),
    );

    await service.create({ tipo_backup: tipobackup.MQTT }, makeCurrentUser());

    const createData = getDataFromFirstCall(prisma.backups.create);
    const snapshot = createData.snapshot as Record<string, unknown>;
    const serialized = JSON.stringify(snapshot);

    expect(prisma.mqttconfiguracoes.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chave_configuracao: 'MQTT_PRINCIPAL' },
      }),
    );
    expect(snapshot).toHaveProperty('mqtt');
    expect(snapshot).not.toHaveProperty('sistema');
    expect(serialized).toContain('mqtt://localhost');
    expect(serialized).toContain('topico_leituras');
    expect(serialized).toContain('usuario_mqtt_configurado');
    expect(serialized).toContain('senha_mqtt_configurada');
    expect(serialized).toContain('credenciais_mqtt_nao_incluidas');
    expect(serialized).not.toContain('usuario-mqtt');
    expect(serialized).not.toContain('senha_mqtt_hash');
    expect(serialized).not.toContain('senha-secreta');
    expect(createData).toMatchObject({
      tipo_backup: tipobackup.MQTT,
      status_backup: statusbackup.GERADO,
    });
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ acao: 'GERAR_BACKUP' }),
    });
  });

  it('gera backup COMPLETO com blocos de sistema e MQTT sanitizado', async () => {
    arrangeSystemSnapshot();
    arrangeMqttSnapshot();
    prisma.backups.create.mockImplementation((input) =>
      Promise.resolve(makeBackupRecordFromCreate(input)),
    );

    await service.create(
      { tipo_backup: tipobackup.COMPLETO, origem_backup: origembackup.MANUAL },
      makeCurrentUser(),
    );

    const createData = getDataFromFirstCall(prisma.backups.create);
    const snapshot = createData.snapshot as Record<string, unknown>;
    const serialized = JSON.stringify(snapshot);

    expect(snapshot).toHaveProperty('sistema');
    expect(snapshot).toHaveProperty('mqtt');
    expect(serialized).toContain('tanques');
    expect(serialized).toContain('bombas');
    expect(serialized).toContain('valvulas');
    expect(serialized).not.toContain('senha_mqtt_hash');
    expect(serialized).not.toContain('senha-secreta');
    expect(createData.hash_arquivo).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof createData.tamanho_bytes).toBe('bigint');
  });

  it('registra falha controlada quando configuracao do sistema nao existe', async () => {
    prisma.configuracoessistema.findFirst.mockResolvedValue(null);

    await expect(
      service.create({ tipo_backup: tipobackup.SISTEMA }, makeCurrentUser()),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.backups.create).not.toHaveBeenCalled();
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acao: 'GERAR_BACKUP',
        resultado: resultadooperacao.FALHA,
        origem: origemlogoperacional.BACKEND,
      }),
    });
  });

  it('nao retorna erro bruto do Prisma em falha inesperada de geracao', async () => {
    arrangeSystemSnapshot();
    prisma.backups.create.mockRejectedValue(
      new Error('Prisma stack trace xpto'),
    );

    await expect(
      service.create({ tipo_backup: tipobackup.SISTEMA }, makeCurrentUser()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('findAll aplica filtros, intervalo, paginacao e ordenacao', async () => {
    const record = makeBackupRecord();
    prisma.backups.findMany.mockResolvedValue([record]);
    prisma.backups.count.mockResolvedValue(1);

    const result = await service.findAll({
      tipo_backup: tipobackup.MQTT,
      status_backup: statusbackup.GERADO,
      data_inicio: '2026-06-01T00:00:00.000Z',
      data_fim: '2026-06-26T23:59:59.999Z',
      page: 2,
      limit: 10,
    });

    expect(prisma.backups.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tipo_backup: tipobackup.MQTT,
          status_backup: statusbackup.GERADO,
          criado_em: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
        orderBy: { criado_em: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.data[0]).toMatchObject({ tamanho_bytes: '1200' });
  });

  it('findOne retorna detalhe sanitizado e NotFound quando ausente', async () => {
    prisma.backups.findUnique.mockResolvedValue(
      makeBackupRecord({
        snapshot: {
          mqtt: {
            configuracao_mqtt: {
              senha_mqtt_hash: 'hash-secreto',
              senha: 'senha-secreta',
            },
          },
        },
      }),
    );

    const result = await service.findOne(10);

    expect(JSON.stringify(result)).not.toContain('hash-secreto');
    expect(JSON.stringify(result)).not.toContain('senha-secreta');

    prisma.backups.findUnique.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restore SISTEMA exige confirmacao, valida hash e restaura em transacao', async () => {
    const snapshot = makeSystemBackupSnapshot();
    const backup = makeBackupRecord({
      tipo_backup: tipobackup.SISTEMA,
      snapshot,
      hash_arquivo: hashSnapshot(snapshot),
    });
    prisma.backups.findUnique.mockResolvedValue(backup);
    prisma.configuracoessistema.findFirst.mockResolvedValue({
      id_configuracao_sistema: 1,
    });
    prisma.configuracoessistema.update.mockResolvedValue({
      id_configuracao_sistema: 1,
    });
    prisma.tanques.upsert.mockResolvedValue({ id_tanque: 51 });
    prisma.bombas.upsert.mockResolvedValue({ id_bomba: 61 });
    prisma.backups.update.mockImplementation((input) =>
      Promise.resolve(
        makeBackupRecord({
          ...backup,
          status_backup: statusbackup.RESTAURADO,
          restaurado_em: new Date('2026-06-26T12:00:00Z'),
          ...getData(input),
        }),
      ),
    );

    await expect(
      service.restore(10, { confirmar_restauracao: true }, makeCurrentUser()),
    ).resolves.toMatchObject({
      id_backup: 10,
      status_backup: statusbackup.RESTAURADO,
    });

    expect(prisma.configuracoessistema.update).toHaveBeenCalled();
    expect(prisma.tanques.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nome: 'Tanque A' } }),
    );
    expect(prisma.bombas.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nome: 'Bomba A' } }),
    );
    expect(prisma.valvulas.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_bomba_numero_saida_manifold: {
            id_bomba: 61,
            numero_saida_manifold: 1,
          },
        },
      }),
    );
    const valveUpsert = prisma.valvulas.upsert.mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(valveUpsert.create).toMatchObject({
      status_valvula: StatusValvula.DESCONHECIDA,
      ultimo_acionamento: null,
    });
    expect(valveUpsert.update).not.toHaveProperty('status_valvula');
    expect(valveUpsert.update).not.toHaveProperty('ultimo_acionamento');
    expect(prisma.mqttconfiguracoes.upsert).not.toHaveBeenCalled();
    expect(prisma.backups.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_backup: statusbackup.RESTAURADO,
          id_usuario_restauracao: 1,
          restaurado_em: expect.any(Date),
        }),
      }),
    );
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ acao: 'RESTAURAR_BACKUP' }),
    });
    expect(
      mqttConfigService.executeProtectedEquipmentMutation,
    ).toHaveBeenCalledWith('RESTORE_BACKUP', expect.any(Function));
    expect(systemConfigCache.invalidate).toHaveBeenCalledTimes(1);
    expect(readingContextCache.invalidate).toHaveBeenCalledTimes(1);
    expect(mqttClientService.disconnect).not.toHaveBeenCalled();
  });

  it('permite restaurar novamente backup ja RESTAURADO e cria novo log de sucesso', async () => {
    const snapshot = makeSystemBackupSnapshot();
    const backup = makeBackupRecord({
      tipo_backup: tipobackup.SISTEMA,
      status_backup: statusbackup.RESTAURADO,
      restaurado_em: new Date('2026-06-25T12:00:00Z'),
      id_usuario_restauracao: 99,
      snapshot,
      hash_arquivo: hashSnapshot(snapshot),
    });
    prisma.backups.findUnique.mockResolvedValue(backup);
    prisma.configuracoessistema.findFirst.mockResolvedValue({
      id_configuracao_sistema: 1,
    });
    prisma.configuracoessistema.update.mockResolvedValue({
      id_configuracao_sistema: 1,
    });
    prisma.tanques.upsert.mockResolvedValue({ id_tanque: 51 });
    prisma.bombas.upsert.mockResolvedValue({ id_bomba: 61 });
    prisma.backups.update.mockResolvedValue(
      makeBackupRecord({
        ...backup,
        status_backup: statusbackup.RESTAURADO,
        restaurado_em: new Date('2026-06-26T12:00:00Z'),
        id_usuario_restauracao: 1,
      }),
    );

    await service.restore(
      10,
      { confirmar_restauracao: true },
      makeCurrentUser(),
    );

    expect(prisma.configuracoessistema.update).toHaveBeenCalled();
    expect(prisma.backups.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_backup: statusbackup.RESTAURADO,
          restaurado_em: expect.any(Date),
          id_usuario_restauracao: 1,
        }),
      }),
    );
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acao: 'RESTAURAR_BACKUP',
        resultado: resultadooperacao.SUCESSO,
      }),
    });
  });

  it('restore MQTT reseta os indicadores externos sem aceitar credenciais', async () => {
    const snapshot = makeMqttBackupSnapshot();
    const backup = makeBackupRecord({
      tipo_backup: tipobackup.MQTT,
      snapshot,
      hash_arquivo: hashSnapshot(snapshot),
    });
    prisma.backups.findUnique.mockResolvedValue(backup);

    prisma.mqttconfiguracoes.upsert.mockResolvedValue({
      ...makeMqttConfig(),
      usuario_mqtt_configurado: false,
      senha_mqtt_configurada: false,
      credenciais_verificadas_em: null,
      ultima_falha_credenciais: null,
      status_conexao: statusconexaomqtt.DESCONECTADO,
    });
    prisma.backups.update.mockResolvedValue(
      makeBackupRecord({
        ...backup,
        status_backup: statusbackup.RESTAURADO,
        restaurado_em: new Date('2026-06-26T12:00:00Z'),
      }),
    );

    const result = await service.restore(
      10,
      { confirmar_restauracao: true },
      makeCurrentUser(),
    );

    expect(prisma.mqttconfiguracoes.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          usuario_mqtt_configurado: false,
          senha_mqtt_configurada: false,
          credenciais_verificadas_em: null,
          ultima_falha_credenciais: null,
          status_conexao: statusconexaomqtt.DESCONECTADO,
          ultima_conexao: null,
        }),
        update: expect.objectContaining({
          usuario_mqtt_configurado: false,
          senha_mqtt_configurada: false,
          credenciais_verificadas_em: null,
          ultima_falha_credenciais: null,
          status_conexao: statusconexaomqtt.DESCONECTADO,
          ultima_conexao: null,
        }),
      }),
    );
    expect(result.warnings).toContain(
      'As credenciais MQTT externas nao fazem parte do backup e devem ser configuradas e verificadas novamente.',
    );
    expect(mqttClientService.disconnect).toHaveBeenCalledTimes(1);
    expect(mqttHealthService.reloadHealthConfig).toHaveBeenCalledTimes(1);
    expect(systemConfigCache.invalidate).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).not.toContain('senha_mqtt_hash');
    expect(JSON.stringify(snapshot)).not.toContain('usuario-mqtt');
  });

  it('mantem o backup restaurado e avisa quando a reconciliacao MQTT pos-commit falha', async () => {
    const snapshot = makeMqttBackupSnapshot();
    const backup = makeBackupRecord({
      tipo_backup: tipobackup.MQTT,
      snapshot,
      hash_arquivo: hashSnapshot(snapshot),
    });
    prisma.backups.findUnique.mockResolvedValue(backup);
    prisma.mqttconfiguracoes.upsert.mockResolvedValue(makeMqttConfig());
    prisma.backups.update.mockResolvedValue(
      makeBackupRecord({
        ...backup,
        status_backup: statusbackup.RESTAURADO,
      }),
    );
    mqttClientService.disconnect.mockRejectedValue(
      new Error('cliente nao respondeu'),
    );

    const result = await service.restore(
      10,
      { confirmar_restauracao: true },
      makeCurrentUser(),
    );

    expect(result.status_backup).toBe(statusbackup.RESTAURADO);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('desconexao do cliente falhou'),
      ]),
    );
    expect(mqttHealthService.reloadHealthConfig).toHaveBeenCalledTimes(1);
    expect(prisma.backups.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_backup: statusbackup.FALHA_RESTAURACAO,
        }),
      }),
    );
  });

  it('falha com confirmar_restauracao false, registra log e nao restaura nada', async () => {
    await expect(
      service.restore(10, { confirmar_restauracao: false }, makeCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.backups.findUnique).not.toHaveBeenCalled();
    expect(prisma.configuracoessistema.update).not.toHaveBeenCalled();
    expect(prisma.mqttconfiguracoes.upsert).not.toHaveBeenCalled();
    expect(prisma.backups.update).not.toHaveBeenCalled();
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acao: 'RESTAURAR_BACKUP',
        resultado: resultadooperacao.FALHA,
        descricao: expect.stringContaining('confirmar_restauracao'),
      }),
    });
  });

  it('restore COMPLETO restaura sistema e MQTT na mesma transacao', async () => {
    const snapshot = {
      ...makeSystemBackupSnapshot(),
      mqtt: makeMqttBackupSnapshot().mqtt,
      tipo_backup: tipobackup.COMPLETO,
    };
    const backup = makeBackupRecord({
      tipo_backup: tipobackup.COMPLETO,
      snapshot,
      hash_arquivo: hashSnapshot(snapshot),
    });
    prisma.backups.findUnique.mockResolvedValue(backup);
    prisma.configuracoessistema.findFirst.mockResolvedValue({
      id_configuracao_sistema: 1,
    });
    prisma.configuracoessistema.update.mockResolvedValue({
      id_configuracao_sistema: 1,
    });
    prisma.tanques.upsert.mockResolvedValue({ id_tanque: 51 });
    prisma.bombas.upsert.mockResolvedValue({ id_bomba: 61 });
    prisma.mqttconfiguracoes.upsert.mockResolvedValue(makeMqttConfig());
    prisma.backups.update.mockResolvedValue(
      makeBackupRecord({
        ...backup,
        status_backup: statusbackup.RESTAURADO,
        restaurado_em: new Date('2026-06-26T12:00:00Z'),
      }),
    );

    await service.restore(
      10,
      { confirmar_restauracao: true },
      makeCurrentUser(),
    );

    expect(prisma.configuracoessistema.update).toHaveBeenCalled();
    expect(prisma.mqttconfiguracoes.upsert).toHaveBeenCalled();
    expect(
      mqttConfigService.executeProtectedEquipmentMutation,
    ).toHaveBeenCalledWith('RESTORE_BACKUP', expect.any(Function));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('bloqueia restauracao pelo interlock sem marcar o backup como falha', async () => {
    mqttConfigService.executeProtectedEquipmentMutation.mockRejectedValue(
      new ConflictException({
        code: 'EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE',
      }),
    );

    await expect(
      service.restore(10, { confirmar_restauracao: true }, makeCurrentUser()),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.backups.findUnique).not.toHaveBeenCalled();
    expect(prisma.configuracoessistema.update).not.toHaveBeenCalled();
    expect(prisma.mqttconfiguracoes.upsert).not.toHaveBeenCalled();
    expect(prisma.backups.update).not.toHaveBeenCalled();
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acao: 'RESTAURAR_BACKUP',
        resultado: resultadooperacao.FALHA,
      }),
    });
  });

  it('marca falha quando a restauracao falha depois de iniciar as escritas', async () => {
    const snapshot = makeSystemBackupSnapshot();
    prisma.backups.findUnique.mockResolvedValue(
      makeBackupRecord({
        tipo_backup: tipobackup.SISTEMA,
        snapshot,
        hash_arquivo: hashSnapshot(snapshot),
      }),
    );
    prisma.configuracoessistema.findFirst.mockResolvedValue({
      id_configuracao_sistema: 1,
    });
    prisma.configuracoessistema.update.mockRejectedValue(
      new Error('falha de escrita'),
    );

    await expect(
      service.restore(10, { confirmar_restauracao: true }, makeCurrentUser()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(prisma.backups.update).toHaveBeenCalledWith({
      where: { id_backup: 10 },
      data: expect.objectContaining({
        status_backup: statusbackup.FALHA_RESTAURACAO,
        id_usuario_restauracao: 1,
        erro: expect.stringContaining('falha de escrita'),
      }),
    });
  });

  it('recria os warnings quando o callback protegido e repetido', async () => {
    const snapshot = makeMqttBackupSnapshot();
    const backup = makeBackupRecord({
      tipo_backup: tipobackup.MQTT,
      snapshot,
      hash_arquivo: hashSnapshot(snapshot),
    });
    prisma.backups.findUnique.mockResolvedValue(backup);
    prisma.mqttconfiguracoes.upsert.mockResolvedValue(makeMqttConfig());
    prisma.backups.update.mockResolvedValue(
      makeBackupRecord({
        ...backup,
        status_backup: statusbackup.RESTAURADO,
      }),
    );
    mqttConfigService.executeProtectedEquipmentMutation.mockImplementation(
      async (_action, mutation) => {
        const callback = mutation as (tx: PrismaMock) => Promise<unknown>;
        await callback(prisma);
        return await callback(prisma);
      },
    );

    const result = await service.restore(
      10,
      { confirmar_restauracao: true },
      makeCurrentUser(),
    );

    expect(prisma.backups.findUnique).toHaveBeenCalledTimes(2);
    expect(
      result.warnings.filter((warning) =>
        warning.includes('credenciais MQTT externas'),
      ),
    ).toHaveLength(1);
  });

  it('bloqueia hash invalido e status invalido para restauracao', async () => {
    prisma.backups.findUnique.mockResolvedValue(
      makeBackupRecord({
        tipo_backup: tipobackup.SISTEMA,
        snapshot: makeSystemBackupSnapshot(),
        hash_arquivo: 'hash-invalido',
      }),
    );

    await expect(
      service.restore(10, { confirmar_restauracao: true }, makeCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.configuracoessistema.update).not.toHaveBeenCalled();
    expect(prisma.mqttconfiguracoes.upsert).not.toHaveBeenCalled();
    expect(prisma.backups.update).not.toHaveBeenCalled();
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acao: 'RESTAURAR_BACKUP',
        resultado: resultadooperacao.FALHA,
        descricao: expect.stringContaining('Hash do snapshot nao confere'),
      }),
    });

    prisma.backups.update.mockClear();
    prisma.logsoperacionais.create.mockClear();
    prisma.backups.findUnique.mockResolvedValue(
      makeBackupRecord({
        tipo_backup: tipobackup.SISTEMA,
        status_backup: statusbackup.INVALIDO,
        snapshot: makeSystemBackupSnapshot(),
        hash_arquivo: hashSnapshot(makeSystemBackupSnapshot()),
      }),
    );

    await expect(
      service.restore(10, { confirmar_restauracao: true }, makeCurrentUser()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.backups.update).not.toHaveBeenCalled();
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acao: 'RESTAURAR_BACKUP',
        resultado: resultadooperacao.FALHA,
        descricao: expect.stringContaining('nao pode ser restaurado'),
      }),
    });
  });
});

function createPrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    backups: {
      create: asyncMock(),
      findMany: asyncMock(),
      findUnique: asyncMock(),
      count: asyncMock<number>(),
      update: asyncMock(),
    },
    configuracoessistema: {
      findFirst: asyncMock(),
      update: asyncMock(),
      create: asyncMock(),
    },
    tanques: {
      findMany: asyncMock(),
      upsert: asyncMock(),
    },
    bombas: {
      findMany: asyncMock(),
      upsert: asyncMock(),
    },
    valvulas: {
      findMany: asyncMock(),
      upsert: asyncMock(),
    },
    mqttconfiguracoes: {
      findUnique: asyncMock(),
      upsert: asyncMock(),
    },
    mqttconfiguracoeshistorico: {
      create: asyncMock(),
    },
    logsoperacionais: {
      create: asyncMock(),
    },
    $transaction: asyncMock(),
  };

  mock.$transaction.mockImplementation(async (input) => {
    if (typeof input === 'function') {
      const callback = input as TransactionCallback;
      return await callback(mock);
    }

    if (Array.isArray(input)) {
      const promises = input as Promise<unknown>[];
      return await Promise.all(promises);
    }

    return await Promise.resolve(input);
  });

  mock.logsoperacionais.create.mockResolvedValue({ id_log_operacional: 1 });
  mock.valvulas.upsert.mockResolvedValue({ id_valvula: 1 });
  mock.mqttconfiguracoeshistorico.create.mockResolvedValue({
    id_mqtt_configuracao_historico: 1,
  });

  return mock;
}

function arrangeSystemSnapshot(): void {
  prismaGlobal().configuracoessistema.findFirst.mockResolvedValue(
    makeSystemConfig(),
  );
  prismaGlobal().tanques.findMany.mockResolvedValue([makeTank()]);
  prismaGlobal().bombas.findMany.mockResolvedValue([makePump()]);
  prismaGlobal().valvulas.findMany.mockResolvedValue([makeValve()]);
}

function arrangeMqttSnapshot(): void {
  prismaGlobal().mqttconfiguracoes.findUnique.mockResolvedValue(
    makeMqttConfig(),
  );
}

let currentPrisma: PrismaMock | null = null;

function prismaGlobal(): PrismaMock {
  if (!currentPrisma) {
    throw new Error('Prisma mock nao inicializado.');
  }

  return currentPrisma;
}

function makeCurrentUser(): AuthenticatedUser {
  return {
    id_usuario: 1,
    login: 'admin',
    nome: 'Administrador',
    email: 'admin@local',
    nivel_acesso: { nome: 'ADMINISTRADOR' },
    primeiro_acesso: false,
  };
}

function makeSystemConfig() {
  return {
    id_configuracao_sistema: 1,
    id_usuario_alteracao: 1,
    tempo_maximo_padrao: 60,
    encerramento_automatico: true,
    limite_seguranca_vacuo: new Prisma.Decimal('90.000'),
    vacuo_padrao: new Prisma.Decimal('70.000'),
    quantidade_maxima_tanques: 4,
    status_geral_sistema: statusgeralsistema.OPERACIONAL,
    versao_sistema: '1.0.0',
    criado_em: new Date('2026-06-01T00:00:00Z'),
    atualizado_em: new Date('2026-06-20T00:00:00Z'),
    tolerancia_vacuo_percentual: new Prisma.Decimal('10.00'),
    limite_nivel_maximo_percentual: new Prisma.Decimal('95.00'),
    tolerancia_volume_percentual: new Prisma.Decimal('5.00'),
    vazao_minima_l_min: new Prisma.Decimal('0.100'),
    vazao_maxima_l_min: new Prisma.Decimal('5.000'),
  };
}

function makeTank() {
  return {
    id_tanque: 5,
    nome: 'Tanque A',
    volume: new Prisma.Decimal('100.00'),
    unidade_volume: 'L',
    vacuo_padrao: new Prisma.Decimal('70.000'),
    status_tanque: statustanque.ATIVO,
    criado_em: new Date('2026-06-01T00:00:00Z'),
    atualizado_em: new Date('2026-06-20T00:00:00Z'),
    excluido_em: null,
  };
}

function makePump() {
  return {
    id_bomba: 6,
    id_configuracao_sistema: 1,
    id_usuario_alteracao: 1,
    nome: 'Bomba A',
    tipo_bomba: tipobomba.PRINCIPAL,
    status_padrao: statusbomba.ATIVA,
    entrada_por_pressao: true,
    entrada_por_tempo: false,
    encerramento_automatico: true,
    criado_em: new Date('2026-06-01T00:00:00Z'),
    atualizado_em: new Date('2026-06-20T00:00:00Z'),
  };
}

function makeValve() {
  return {
    id_valvula: 7,
    id_bomba: 6,
    numero_saida_manifold: 1,
    nome_valvula: 'Valvula A',
    tipo_valvula: TipoValvula.SOLENOIDE,
    status_valvula: StatusValvula.FECHADA,
    ativo: true,
    ultimo_acionamento: null,
    criado_em: new Date('2026-06-01T00:00:00Z'),
    atualizado_em: new Date('2026-06-20T00:00:00Z'),
    funcao_valvula: funcaovalvula.FLUIDO,
    id_tanque: 5,
  };
}

function makeMqttConfig() {
  return {
    id_mqtt_configuracao: 3,
    id_usuario_alteracao: 1,
    broker_url: 'mqtt://localhost',
    porta: 1883,
    usuario_mqtt_configurado: true,
    senha_mqtt_configurada: true,
    credenciais_verificadas_em: new Date('2026-06-26T08:55:00Z'),
    ultima_falha_credenciais: null,
    topico_leituras: 'tsea/leituras',
    topico_comandos: 'tsea/comandos',
    topico_status: 'tsea/status',
    topico_alarmes: 'tsea/alarmes',
    topico_heartbeat: 'tsea/heartbeat',
    topico_acoplamentos: 'tsea/acoplamentos',
    reconexao_automatica: true,
    timeout_comunicacao: 5000,
    status_conexao: statusconexaomqtt.CONECTADO,
    ultima_conexao: new Date('2026-06-26T09:00:00Z'),
    ultima_sincronizacao: new Date('2026-06-26T09:10:00Z'),
    ultima_falha: null,
    ativo: true,
    criado_em: new Date('2026-06-01T00:00:00Z'),
    atualizado_em: new Date('2026-06-20T00:00:00Z'),
    chave_configuracao: 'MQTT_PRINCIPAL',
    mqttconfiguracoeshistorico: [
      {
        id_mqtt_configuracao_historico: 4,
      },
    ],
  };
}

function makeBackupRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_backup: 10,
    id_usuario: 1,
    id_usuario_restauracao: null,
    id_configuracao_sistema: 1,
    id_mqtt_configuracao: null,
    id_mqtt_configuracao_historico: null,
    tipo_backup: tipobackup.SISTEMA,
    origem_backup: origembackup.MANUAL,
    status_backup: statusbackup.GERADO,
    nome_arquivo: 'tsea-backup-sistema.json',
    caminho_arquivo: null,
    snapshot: makeSystemBackupSnapshot(),
    hash_arquivo: hashSnapshot(makeSystemBackupSnapshot()),
    tamanho_bytes: BigInt(1200),
    content_type: 'application/json',
    storage_provider: 'POSTGRES_JSON',
    metadados: null,
    erro: null,
    restaurado_em: null,
    criado_em: new Date('2026-06-26T10:00:00Z'),
    usuario_criacao: {
      id_usuario: 1,
      nome: 'Admin',
      login: 'admin',
    },
    usuario_restauracao: null,
    ...overrides,
  };
}

function makeBackupRecordFromCreate(input: unknown) {
  const data = getData(input);

  return makeBackupRecord({
    ...data,
    id_backup: 10,
    criado_em: new Date('2026-06-26T10:00:00Z'),
    usuario_criacao: {
      id_usuario: 1,
      nome: 'Admin',
      login: 'admin',
    },
    usuario_restauracao: null,
  });
}

function makeSystemBackupSnapshot() {
  return {
    versao_snapshot: '1.0.0',
    tipo_backup: tipobackup.SISTEMA,
    gerado_em: '2026-06-26T10:00:00.000Z',
    sistema: {
      configuracao_sistema: serializeRecord(makeSystemConfig()),
      tanques: [serializeRecord(makeTank())],
      bombas: [serializeRecord(makePump())],
      valvulas: [serializeRecord(makeValve())],
    },
  };
}

function makeMqttBackupSnapshot() {
  const mqtt = makeMqttConfig();

  return {
    versao_snapshot: '1.0.0',
    tipo_backup: tipobackup.MQTT,
    gerado_em: '2026-06-26T10:00:00.000Z',
    mqtt: {
      configuracao_mqtt: {
        id_mqtt_configuracao: mqtt.id_mqtt_configuracao,
        id_usuario_alteracao: mqtt.id_usuario_alteracao,
        broker_url: mqtt.broker_url,
        porta: mqtt.porta,
        usuario_mqtt_configurado: mqtt.usuario_mqtt_configurado,
        senha_mqtt_configurada: mqtt.senha_mqtt_configurada,
        credenciais_verificadas_em:
          mqtt.credenciais_verificadas_em.toISOString(),
        ultima_falha_credenciais: mqtt.ultima_falha_credenciais,
        topico_leituras: mqtt.topico_leituras,
        topico_comandos: mqtt.topico_comandos,
        topico_status: mqtt.topico_status,
        topico_alarmes: mqtt.topico_alarmes,
        topico_heartbeat: mqtt.topico_heartbeat,
        topico_acoplamentos: mqtt.topico_acoplamentos,
        topico_configuracoes: 'tsea/config',
        topico_acks: 'tsea/acks',
        reconexao_automatica: mqtt.reconexao_automatica,
        timeout_comunicacao: mqtt.timeout_comunicacao,
        status_conexao: mqtt.status_conexao,
        ultima_conexao: mqtt.ultima_conexao.toISOString(),
        ultima_sincronizacao: mqtt.ultima_sincronizacao.toISOString(),
        ultima_falha: null,
        ativo: mqtt.ativo,
        criado_em: mqtt.criado_em.toISOString(),
        atualizado_em: mqtt.atualizado_em.toISOString(),
        chave_configuracao: mqtt.chave_configuracao,
      },
      credenciais_mqtt_nao_incluidas: true,
    },
  };
}

function serializeRecord(value: Record<string, unknown>) {
  const serialized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (entry instanceof Date) {
      serialized[key] = entry.toISOString();
    } else if (entry instanceof Prisma.Decimal) {
      serialized[key] = entry.toString();
    } else {
      serialized[key] = entry;
    }
  }

  return serialized;
}

function getData(input: unknown): Record<string, unknown> {
  return (input as { data: Record<string, unknown> }).data;
}

function getDataFromFirstCall(mock: AsyncMock): Record<string, unknown> {
  const [input] = mock.mock.calls[0] ?? [];
  return getData(input);
}

function hashSnapshot(snapshot: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(snapshot)).digest('hex');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }

  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key]);
    }

    return sorted;
  }

  return value;
}
