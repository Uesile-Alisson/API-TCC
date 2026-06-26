import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  origembackup,
  origemlogoperacional,
  Prisma,
  StatusValvula,
  statusbomba,
  resultadooperacao,
  statusbackup,
  statusconexaomqtt,
  statusgeralsistema,
  statustanque,
  TipoValvula,
  tipobackup,
  tipobomba,
  tipologoperacional,
  funcaovalvula,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { BackupMapper, backupSelect } from './backup.mapper';
import { BackupQueryDto } from './dto/backup-query.dto';
import { CreateBackupDto } from './dto/create-backup.dto';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import { canRestoreStatus } from './validators/backup-status.validator';
import {
  isMqttBackupType,
  isSystemBackupType,
} from './validators/backup-type.validator';
import { validateBackupDateRange } from './validators/backup-date-range.validator';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonRecord | JsonValue[];
type JsonRecord = { [key: string]: JsonValue };

type BackupRecord = Prisma.backupsGetPayload<{
  select: typeof backupSelect;
}>;

type BackupCreateContext = {
  snapshot: JsonRecord;
  id_configuracao_sistema: number | null;
  id_mqtt_configuracao: number | null;
  id_mqtt_configuracao_historico: number | null;
  resumo: JsonRecord;
};

type RestoreContext = {
  warnings: string[];
  userId: number;
};

@Injectable()
export class BackupService {
  private readonly snapshotVersion = '1.0.0';

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBackupDto, currentUser: AuthenticatedUser) {
    const userId = this.getUserId(currentUser);

    try {
      const context = await this.buildBackupContext(dto.tipo_backup);
      const serialized = this.stableStringify(context.snapshot);
      const hash_arquivo = this.sha256(serialized);
      const tamanho_bytes = BigInt(Buffer.byteLength(serialized, 'utf8'));
      const nome_arquivo = this.buildFileName(dto.tipo_backup);
      const metadados = this.toJsonInput({
        versao_snapshot: this.snapshotVersion,
        observacao: this.optionalText(dto.observacao),
        resumo: context.resumo,
      });

      const created = await this.prisma.$transaction(async (tx) => {
        const backup = await tx.backups.create({
          data: {
            id_usuario: userId,
            id_configuracao_sistema: context.id_configuracao_sistema,
            id_mqtt_configuracao: context.id_mqtt_configuracao,
            id_mqtt_configuracao_historico:
              context.id_mqtt_configuracao_historico,
            tipo_backup: dto.tipo_backup,
            origem_backup: dto.origem_backup ?? origembackup.MANUAL,
            status_backup: statusbackup.GERADO,
            nome_arquivo,
            caminho_arquivo: null,
            snapshot: this.toJsonInput(context.snapshot),
            hash_arquivo,
            tamanho_bytes,
            content_type: 'application/json',
            storage_provider: 'POSTGRES_JSON',
            metadados,
            erro: null,
          },
          select: backupSelect,
        });

        await this.createOperationalLog(tx, {
          userId,
          action: 'GERAR_BACKUP',
          result: resultadooperacao.SUCESSO,
          origin: origemlogoperacional.USUARIO,
          description: `Backup ${backup.tipo_backup} gerado com sucesso.`,
        });

        return backup;
      });

      return BackupMapper.toDetail(created);
    } catch (error) {
      await this.tryLogFailure(userId, 'GERAR_BACKUP', error);
      throw this.toHttpException(error, 'Falha ao gerar backup.');
    }
  }

  async findAll(query: BackupQueryDto) {
    const { page, limit, skip, take } = this.buildPagination(query);
    const range = validateBackupDateRange(query);
    const where: Prisma.backupsWhereInput = {
      tipo_backup: query.tipo_backup,
      status_backup: query.status_backup,
      criado_em:
        range.data_inicio || range.data_fim
          ? {
              gte: range.data_inicio,
              lte: range.data_fim,
            }
          : undefined,
    };

    const [records, total] = await this.prisma.$transaction([
      this.prisma.backups.findMany({
        where,
        orderBy: { criado_em: 'desc' },
        skip,
        take,
        select: backupSelect,
      }),
      this.prisma.backups.count({ where }),
    ]);

    return {
      data: records.map((record) => BackupMapper.toListItem(record)),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id_backup: number) {
    const backup = await this.findBackupOrFail(id_backup);
    return BackupMapper.toDetail(backup);
  }

  async restore(
    id_backup: number,
    dto: RestoreBackupDto,
    currentUser: AuthenticatedUser,
  ) {
    const userId = this.getUserId(currentUser);
    let transactionStarted = false;

    try {
      if (dto.confirmar_restauracao !== true) {
        throw new BadRequestException(
          'confirmar_restauracao deve ser true para restaurar um backup.',
        );
      }

      const backup = await this.findBackupOrFail(id_backup);
      const snapshot = this.requireSnapshotRecord(backup.snapshot);

      this.validateRestoreBackup(backup, snapshot, dto);

      const context: RestoreContext = {
        warnings: [],
        userId,
      };

      transactionStarted = true;
      const restored = await this.prisma.$transaction(async (tx) => {
        if (isSystemBackupType(backup.tipo_backup)) {
          await this.restoreSystemSnapshot(tx, snapshot, context);
        }

        if (isMqttBackupType(backup.tipo_backup)) {
          await this.restoreMqttSnapshot(tx, snapshot, dto, context);
        }

        const updated = await tx.backups.update({
          where: { id_backup },
          data: {
            status_backup: statusbackup.RESTAURADO,
            restaurado_em: new Date(),
            id_usuario_restauracao: userId,
            erro: null,
            metadados: this.toJsonInput({
              ...this.jsonToRecord(backup.metadados),
              ultima_restauracao: {
                motivo: this.optionalText(dto.motivo),
                warnings: context.warnings,
              },
            }),
          },
          select: backupSelect,
        });

        await this.createOperationalLog(tx, {
          userId,
          action: 'RESTAURAR_BACKUP',
          result: resultadooperacao.SUCESSO,
          origin: origemlogoperacional.USUARIO,
          description: `Backup ${backup.id_backup} restaurado com sucesso.`,
        });

        return updated;
      });

      return BackupMapper.toRestoreResult(restored, context.warnings);
    } catch (error) {
      if (transactionStarted) {
        await this.markRestoreFailure(id_backup, userId, error);
      } else {
        await this.logRestoreFailure(id_backup, userId, error);
      }
      throw this.toHttpException(error, 'Falha ao restaurar backup.');
    }
  }

  private async buildBackupContext(
    tipo_backup: tipobackup,
  ): Promise<BackupCreateContext> {
    const base: BackupCreateContext = {
      snapshot: {
        versao_snapshot: this.snapshotVersion,
        tipo_backup,
        gerado_em: new Date().toISOString(),
      },
      id_configuracao_sistema: null,
      id_mqtt_configuracao: null,
      id_mqtt_configuracao_historico: null,
      resumo: {},
    };

    if (isSystemBackupType(tipo_backup)) {
      const system = await this.buildSystemSnapshot();
      base.snapshot.sistema = system.snapshot;
      base.id_configuracao_sistema = system.id_configuracao_sistema;
      base.resumo.sistema = system.resumo;
    }

    if (isMqttBackupType(tipo_backup)) {
      const mqtt = await this.buildMqttSnapshot();
      base.snapshot.mqtt = mqtt.snapshot;
      base.id_mqtt_configuracao = mqtt.id_mqtt_configuracao;
      base.id_mqtt_configuracao_historico = mqtt.id_mqtt_configuracao_historico;
      base.resumo.mqtt = mqtt.resumo;
    }

    return base;
  }

  private async buildSystemSnapshot() {
    const config = await this.prisma.configuracoessistema.findFirst({
      orderBy: { id_configuracao_sistema: 'asc' },
    });

    if (!config) {
      throw new NotFoundException('Configuracao do sistema nao cadastrada.');
    }

    const [tanques, bombas, valvulas] = await this.prisma.$transaction([
      this.prisma.tanques.findMany({
        where: {
          excluido_em: null,
          status_tanque: { not: statustanque.INATIVO },
        },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.bombas.findMany({
        where: { id_configuracao_sistema: config.id_configuracao_sistema },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.valvulas.findMany({
        where: {
          bombas: {
            id_configuracao_sistema: config.id_configuracao_sistema,
          },
        },
        orderBy: [{ id_bomba: 'asc' }, { numero_saida_manifold: 'asc' }],
      }),
    ]);

    const snapshot: JsonRecord = {
      configuracao_sistema: this.normalizeJson(config),
      tanques: this.normalizeJson(tanques),
      bombas: this.normalizeJson(bombas),
      valvulas: this.normalizeJson(valvulas),
    };

    return {
      snapshot,
      id_configuracao_sistema: config.id_configuracao_sistema,
      resumo: {
        tanques: tanques.length,
        bombas: bombas.length,
        valvulas: valvulas.length,
      },
    };
  }

  private async buildMqttSnapshot() {
    const config = await this.prisma.mqttconfiguracoes.findUnique({
      where: { chave_configuracao: 'MQTT_PRINCIPAL' },
      select: {
        id_mqtt_configuracao: true,
        id_usuario_alteracao: true,
        broker_url: true,
        porta: true,
        usuario_mqtt: true,
        topico_leituras: true,
        topico_comandos: true,
        topico_status: true,
        topico_alarmes: true,
        topico_heartbeat: true,
        topico_acoplamentos: true,
        reconexao_automatica: true,
        timeout_comunicacao: true,
        status_conexao: true,
        ultima_conexao: true,
        ultima_sincronizacao: true,
        ultima_falha: true,
        ativo: true,
        criado_em: true,
        atualizado_em: true,
        chave_configuracao: true,
        mqttconfiguracoeshistorico: {
          orderBy: { registrado_em: 'desc' },
          take: 1,
          select: { id_mqtt_configuracao_historico: true },
        },
      },
    });

    if (!config) {
      throw new NotFoundException('Configuracao MQTT nao cadastrada.');
    }

    const latestHistory = config.mqttconfiguracoeshistorico[0] ?? null;
    const snapshot: JsonRecord = {
      configuracao_mqtt: this.normalizeJson({
        id_mqtt_configuracao: config.id_mqtt_configuracao,
        id_usuario_alteracao: config.id_usuario_alteracao,
        broker_url: config.broker_url,
        porta: config.porta,
        usuario_mqtt: config.usuario_mqtt,
        topico_leituras: config.topico_leituras,
        topico_comandos: config.topico_comandos,
        topico_status: config.topico_status,
        topico_alarmes: config.topico_alarmes,
        topico_heartbeat: config.topico_heartbeat,
        topico_acoplamentos: config.topico_acoplamentos,
        reconexao_automatica: config.reconexao_automatica,
        timeout_comunicacao: config.timeout_comunicacao,
        status_conexao: config.status_conexao,
        ultima_conexao: config.ultima_conexao,
        ultima_sincronizacao: config.ultima_sincronizacao,
        ultima_falha: config.ultima_falha,
        ativo: config.ativo,
        criado_em: config.criado_em,
        atualizado_em: config.atualizado_em,
        chave_configuracao: config.chave_configuracao,
      }),
      senha_mqtt_omitida: true,
    };

    return {
      snapshot,
      id_mqtt_configuracao: config.id_mqtt_configuracao,
      id_mqtt_configuracao_historico:
        latestHistory?.id_mqtt_configuracao_historico ?? null,
      resumo: {
        chave_configuracao: config.chave_configuracao,
        senha_mqtt_omitida: true,
      },
    };
  }

  private async restoreSystemSnapshot(
    tx: Prisma.TransactionClient,
    snapshot: JsonRecord,
    context: RestoreContext,
  ): Promise<void> {
    const system = this.requireRecord(snapshot.sistema, 'snapshot.sistema');
    const config = this.requireRecord(
      system.configuracao_sistema,
      'snapshot.sistema.configuracao_sistema',
    );
    const id_configuracao_sistema = await this.restoreSystemConfig(
      tx,
      config,
      context.userId,
    );
    const tanqueIdMap = await this.restoreTanques(
      tx,
      this.getRecordArray(system.tanques),
    );
    const bombaIdMap = await this.restoreBombas(
      tx,
      this.getRecordArray(system.bombas),
      id_configuracao_sistema,
      context.userId,
    );

    await this.restoreValvulas(
      tx,
      this.getRecordArray(system.valvulas),
      bombaIdMap,
      tanqueIdMap,
      context,
    );
  }

  private async restoreSystemConfig(
    tx: Prisma.TransactionClient,
    record: JsonRecord,
    userId: number,
  ): Promise<number> {
    const data = {
      id_usuario_alteracao: userId,
      tempo_maximo_padrao: this.numberValue(record.tempo_maximo_padrao),
      encerramento_automatico: this.booleanValue(
        record.encerramento_automatico,
      ),
      limite_seguranca_vacuo: this.stringValue(record.limite_seguranca_vacuo),
      vacuo_padrao: this.stringValue(record.vacuo_padrao),
      quantidade_maxima_tanques: this.numberValue(
        record.quantidade_maxima_tanques,
      ),
      status_geral_sistema: this.enumValue(
        record.status_geral_sistema,
        statusgeralsistema,
        'status_geral_sistema',
      ),
      versao_sistema: this.stringValue(record.versao_sistema),
      tolerancia_vacuo_percentual: this.stringValue(
        record.tolerancia_vacuo_percentual,
      ),
      limite_nivel_maximo_percentual: this.stringValue(
        record.limite_nivel_maximo_percentual,
      ),
      tolerancia_volume_percentual: this.stringValue(
        record.tolerancia_volume_percentual,
      ),
      vazao_minima_l_min: this.stringValue(record.vazao_minima_l_min),
      vazao_maxima_l_min: this.stringValue(record.vazao_maxima_l_min),
      atualizado_em: new Date(),
    } satisfies Prisma.configuracoessistemaUncheckedUpdateInput;

    const current = await tx.configuracoessistema.findFirst({
      orderBy: { id_configuracao_sistema: 'asc' },
      select: { id_configuracao_sistema: true },
    });

    if (current) {
      const updated = await tx.configuracoessistema.update({
        where: {
          id_configuracao_sistema: current.id_configuracao_sistema,
        },
        data,
        select: { id_configuracao_sistema: true },
      });

      return updated.id_configuracao_sistema;
    }

    const created = await tx.configuracoessistema.create({
      data: {
        ...data,
        criado_em: new Date(),
      },
      select: { id_configuracao_sistema: true },
    });

    return created.id_configuracao_sistema;
  }

  private async restoreTanques(
    tx: Prisma.TransactionClient,
    records: JsonRecord[],
  ): Promise<Map<number, number>> {
    const idMap = new Map<number, number>();

    for (const record of records) {
      const oldId = this.numberValue(record.id_tanque);
      const nome = this.stringValue(record.nome).trim();
      const restored = await tx.tanques.upsert({
        where: { nome },
        create: {
          nome,
          volume: this.stringValue(record.volume),
          unidade_volume: this.stringValue(record.unidade_volume),
          vacuo_padrao: this.stringValue(record.vacuo_padrao),
          status_tanque: this.enumValue(
            record.status_tanque,
            statustanque,
            'status_tanque',
          ),
          criado_em: this.dateValue(record.criado_em) ?? new Date(),
          atualizado_em: new Date(),
          excluido_em: this.dateValue(record.excluido_em),
        },
        update: {
          volume: this.stringValue(record.volume),
          unidade_volume: this.stringValue(record.unidade_volume),
          vacuo_padrao: this.stringValue(record.vacuo_padrao),
          status_tanque: this.enumValue(
            record.status_tanque,
            statustanque,
            'status_tanque',
          ),
          atualizado_em: new Date(),
          excluido_em: this.dateValue(record.excluido_em),
        },
        select: { id_tanque: true },
      });

      idMap.set(oldId, restored.id_tanque);
    }

    return idMap;
  }

  private async restoreBombas(
    tx: Prisma.TransactionClient,
    records: JsonRecord[],
    id_configuracao_sistema: number,
    userId: number,
  ): Promise<Map<number, number>> {
    const idMap = new Map<number, number>();

    for (const record of records) {
      const oldId = this.numberValue(record.id_bomba);
      const nome = this.stringValue(record.nome).trim();
      const restored = await tx.bombas.upsert({
        where: { nome },
        create: {
          id_configuracao_sistema,
          id_usuario_alteracao: userId,
          nome,
          tipo_bomba: this.enumValue(
            record.tipo_bomba,
            tipobomba,
            'tipo_bomba',
          ),
          status_padrao: this.enumValue(
            record.status_padrao,
            statusbomba,
            'status_padrao',
          ),
          entrada_por_pressao: this.booleanValue(record.entrada_por_pressao),
          entrada_por_tempo: this.booleanValue(record.entrada_por_tempo),
          encerramento_automatico: this.booleanValue(
            record.encerramento_automatico,
          ),
          criado_em: this.dateValue(record.criado_em) ?? new Date(),
          atualizado_em: new Date(),
        },
        update: {
          id_configuracao_sistema,
          id_usuario_alteracao: userId,
          tipo_bomba: this.enumValue(
            record.tipo_bomba,
            tipobomba,
            'tipo_bomba',
          ),
          status_padrao: this.enumValue(
            record.status_padrao,
            statusbomba,
            'status_padrao',
          ),
          entrada_por_pressao: this.booleanValue(record.entrada_por_pressao),
          entrada_por_tempo: this.booleanValue(record.entrada_por_tempo),
          encerramento_automatico: this.booleanValue(
            record.encerramento_automatico,
          ),
          atualizado_em: new Date(),
        },
        select: { id_bomba: true },
      });

      idMap.set(oldId, restored.id_bomba);
    }

    return idMap;
  }

  private async restoreValvulas(
    tx: Prisma.TransactionClient,
    records: JsonRecord[],
    bombaIdMap: Map<number, number>,
    tanqueIdMap: Map<number, number>,
    context: RestoreContext,
  ): Promise<void> {
    for (const record of records) {
      const oldBombaId = this.numberValue(record.id_bomba);
      const newBombaId = bombaIdMap.get(oldBombaId);

      if (!newBombaId) {
        const nomeValvula =
          typeof record.nome_valvula === 'string'
            ? record.nome_valvula
            : 'sem nome';
        context.warnings.push(
          `Valvula ${nomeValvula} ignorada: bomba ausente no backup.`,
        );
        continue;
      }

      const oldTanqueId = this.optionalNumberValue(record.id_tanque);
      const newTanqueId =
        oldTanqueId === null ? null : (tanqueIdMap.get(oldTanqueId) ?? null);

      await tx.valvulas.upsert({
        where: {
          id_bomba_numero_saida_manifold: {
            id_bomba: newBombaId,
            numero_saida_manifold: this.numberValue(
              record.numero_saida_manifold,
            ),
          },
        },
        create: {
          id_bomba: newBombaId,
          numero_saida_manifold: this.numberValue(record.numero_saida_manifold),
          nome_valvula: this.stringValue(record.nome_valvula),
          tipo_valvula: this.enumValue(
            record.tipo_valvula,
            TipoValvula,
            'tipo_valvula',
          ),
          status_valvula: this.enumValue(
            record.status_valvula,
            StatusValvula,
            'status_valvula',
          ),
          ativo: this.booleanValue(record.ativo),
          ultimo_acionamento: this.dateValue(record.ultimo_acionamento),
          criado_em: this.dateValue(record.criado_em) ?? new Date(),
          atualizado_em: new Date(),
          funcao_valvula: this.enumValue(
            record.funcao_valvula,
            funcaovalvula,
            'funcao_valvula',
          ),
          id_tanque: newTanqueId,
        },
        update: {
          nome_valvula: this.stringValue(record.nome_valvula),
          tipo_valvula: this.enumValue(
            record.tipo_valvula,
            TipoValvula,
            'tipo_valvula',
          ),
          status_valvula: this.enumValue(
            record.status_valvula,
            StatusValvula,
            'status_valvula',
          ),
          ativo: this.booleanValue(record.ativo),
          ultimo_acionamento: this.dateValue(record.ultimo_acionamento),
          atualizado_em: new Date(),
          funcao_valvula: this.enumValue(
            record.funcao_valvula,
            funcaovalvula,
            'funcao_valvula',
          ),
          id_tanque: newTanqueId,
        },
      });
    }
  }

  private async restoreMqttSnapshot(
    tx: Prisma.TransactionClient,
    snapshot: JsonRecord,
    dto: RestoreBackupDto,
    context: RestoreContext,
  ): Promise<void> {
    const mqtt = this.requireRecord(snapshot.mqtt, 'snapshot.mqtt');
    const config = this.requireRecord(
      mqtt.configuracao_mqtt,
      'snapshot.mqtt.configuracao_mqtt',
    );
    const senhaHash = await bcrypt.hash(
      this.stringValue(dto.nova_senha_mqtt),
      10,
    );
    const chave_configuracao =
      this.optionalText(this.stringValue(config.chave_configuracao)) ??
      'MQTT_PRINCIPAL';

    const restored = await tx.mqttconfiguracoes.upsert({
      where: { chave_configuracao },
      create: {
        id_usuario_alteracao: context.userId,
        broker_url: this.stringValue(config.broker_url),
        porta: this.numberValue(config.porta),
        usuario_mqtt: this.optionalText(config.usuario_mqtt),
        senha_mqtt_hash: senhaHash,
        topico_leituras: this.stringValue(config.topico_leituras),
        topico_comandos: this.stringValue(config.topico_comandos),
        topico_status: this.stringValue(config.topico_status),
        topico_alarmes: this.stringValue(config.topico_alarmes),
        topico_heartbeat: this.stringValue(config.topico_heartbeat),
        topico_acoplamentos: this.stringValue(config.topico_acoplamentos),
        reconexao_automatica: this.booleanValue(config.reconexao_automatica),
        timeout_comunicacao: this.numberValue(config.timeout_comunicacao),
        status_conexao: statusconexaomqtt.DESCONECTADO,
        ultima_conexao: null,
        ultima_sincronizacao: null,
        ultima_falha: null,
        ativo: this.booleanValue(config.ativo),
        chave_configuracao,
        criado_em: this.dateValue(config.criado_em) ?? new Date(),
        atualizado_em: new Date(),
      },
      update: {
        id_usuario_alteracao: context.userId,
        broker_url: this.stringValue(config.broker_url),
        porta: this.numberValue(config.porta),
        usuario_mqtt: this.optionalText(config.usuario_mqtt),
        senha_mqtt_hash: senhaHash,
        topico_leituras: this.stringValue(config.topico_leituras),
        topico_comandos: this.stringValue(config.topico_comandos),
        topico_status: this.stringValue(config.topico_status),
        topico_alarmes: this.stringValue(config.topico_alarmes),
        topico_heartbeat: this.stringValue(config.topico_heartbeat),
        topico_acoplamentos: this.stringValue(config.topico_acoplamentos),
        reconexao_automatica: this.booleanValue(config.reconexao_automatica),
        timeout_comunicacao: this.numberValue(config.timeout_comunicacao),
        status_conexao: statusconexaomqtt.DESCONECTADO,
        ultima_conexao: null,
        ultima_sincronizacao: null,
        ultima_falha: null,
        ativo: this.booleanValue(config.ativo),
        atualizado_em: new Date(),
      },
      select: {
        id_mqtt_configuracao: true,
        id_usuario_alteracao: true,
        broker_url: true,
        porta: true,
        usuario_mqtt: true,
        senha_mqtt_hash: true,
        topico_leituras: true,
        topico_comandos: true,
        topico_status: true,
        topico_alarmes: true,
        topico_heartbeat: true,
        topico_acoplamentos: true,
        reconexao_automatica: true,
        timeout_comunicacao: true,
        status_conexao: true,
        ultima_conexao: true,
        ultima_sincronizacao: true,
        ultima_falha: true,
        ativo: true,
        criado_em: true,
        atualizado_em: true,
      },
    });

    await tx.mqttconfiguracoeshistorico.create({
      data: {
        ...restored,
        registrado_em: new Date(),
      },
    });
  }

  private validateRestoreBackup(
    backup: BackupRecord,
    snapshot: JsonRecord,
    dto: RestoreBackupDto,
  ): void {
    if (!canRestoreStatus(backup.status_backup)) {
      throw new BadRequestException(
        `Backup com status ${backup.status_backup} nao pode ser restaurado.`,
      );
    }

    if (isMqttBackupType(backup.tipo_backup) && !dto.nova_senha_mqtt) {
      throw new BadRequestException(
        'nova_senha_mqtt e obrigatoria para restaurar backup MQTT ou COMPLETO.',
      );
    }

    if (backup.hash_arquivo) {
      const currentHash = this.sha256(this.stableStringify(snapshot));

      if (currentHash !== backup.hash_arquivo) {
        throw new BadRequestException('Hash do snapshot nao confere.');
      }
    }
  }

  private async findBackupOrFail(id_backup: number): Promise<BackupRecord> {
    const backup = await this.prisma.backups.findUnique({
      where: { id_backup },
      select: backupSelect,
    });

    if (!backup) {
      throw new NotFoundException('Backup nao encontrado.');
    }

    return backup;
  }

  private async markRestoreFailure(
    id_backup: number,
    userId: number,
    error: unknown,
  ): Promise<void> {
    const erro = this.summarizeError(error);

    try {
      await this.prisma.backups.update({
        where: { id_backup },
        data: {
          status_backup: statusbackup.FALHA_RESTAURACAO,
          id_usuario_restauracao: userId,
          erro,
        },
      });
    } catch {
      // O log de auditoria abaixo ainda deve ser tentado mesmo se o status falhar.
    }

    await this.logRestoreFailure(id_backup, userId, error);
  }

  private async logRestoreFailure(
    id_backup: number,
    userId: number,
    error: unknown,
  ): Promise<void> {
    const erro = this.summarizeError(error);

    try {
      await this.createOperationalLog(this.prisma, {
        userId,
        action: 'RESTAURAR_BACKUP',
        result: resultadooperacao.FALHA,
        origin: origemlogoperacional.USUARIO,
        description: `Falha ao restaurar backup #${id_backup}: ${erro}`,
      });
    } catch {
      return;
    }
  }

  private async tryLogFailure(
    userId: number,
    action: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.createOperationalLog(this.prisma, {
        userId,
        action,
        result: resultadooperacao.FALHA,
        origin: origemlogoperacional.BACKEND,
        description: this.summarizeError(error),
      });
    } catch {
      return;
    }
  }

  private async createOperationalLog(
    client: Pick<PrismaService, 'logsoperacionais'> | Prisma.TransactionClient,
    input: {
      userId: number;
      action: string;
      result: resultadooperacao;
      origin: origemlogoperacional;
      description: string;
    },
  ): Promise<void> {
    await client.logsoperacionais.create({
      data: {
        id_usuario: input.userId,
        tipo_log: tipologoperacional.BACKUP,
        acao: input.action,
        descricao: input.description,
        origem: input.origin,
        resultado: input.result,
      },
    });
  }

  private buildPagination(query: BackupQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    return { page, limit, skip, take: limit };
  }

  private buildFileName(tipo_backup: tipobackup): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `tsea-backup-${tipo_backup.toLowerCase()}-${timestamp}.json`;
  }

  private getUserId(currentUser: AuthenticatedUser): number {
    if (
      !Number.isInteger(currentUser.id_usuario) ||
      currentUser.id_usuario <= 0
    ) {
      throw new UnauthorizedException(
        'Usuario autenticado sem identificador valido.',
      );
    }

    return currentUser.id_usuario;
  }

  private normalizeJson(value: unknown): JsonValue {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Prisma.Decimal) {
      return value.toString();
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeJson(item));
    }

    if (typeof value === 'object') {
      const normalized: JsonRecord = {};

      for (const [key, entry] of Object.entries(value)) {
        normalized[key] = this.normalizeJson(entry);
      }

      return normalized;
    }

    return null;
  }

  private sortJson(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortJson(item));
    }

    if (this.isJsonRecord(value)) {
      const sorted: JsonRecord = {};

      for (const key of Object.keys(value).sort()) {
        sorted[key] = this.sortJson(value[key]);
      }

      return sorted;
    }

    return value;
  }

  private stableStringify(value: JsonValue): string {
    return JSON.stringify(this.sortJson(value));
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private requireSnapshotRecord(value: Prisma.JsonValue): JsonRecord {
    const normalized = this.normalizeJson(value);

    if (!this.isJsonRecord(normalized)) {
      throw new BadRequestException('Snapshot do backup esta invalido.');
    }

    return normalized;
  }

  private requireRecord(
    value: JsonValue | undefined,
    label: string,
  ): JsonRecord {
    if (!this.isJsonRecord(value)) {
      throw new BadRequestException(`${label} esta invalido.`);
    }

    return value;
  }

  private getRecordArray(value: JsonValue | undefined): JsonRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is JsonRecord => this.isJsonRecord(item));
  }

  private isJsonRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private jsonToRecord(value: Prisma.JsonValue | null): JsonRecord {
    const normalized = this.normalizeJson(value);
    return this.isJsonRecord(normalized) ? normalized : {};
  }

  private toJsonInput(value: JsonValue): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private stringValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    throw new BadRequestException('Snapshot contem valor textual invalido.');
  }

  private optionalText(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const text = this.stringValue(value).trim();
    return text.length > 0 ? text : null;
  }

  private numberValue(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('Snapshot contem valor numerico invalido.');
    }

    return parsed;
  }

  private optionalNumberValue(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    return this.numberValue(value);
  }

  private booleanValue(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    throw new BadRequestException('Snapshot contem valor booleano invalido.');
  }

  private enumValue<T extends string>(
    value: unknown,
    enumObject: Record<string, T>,
    fieldName: string,
  ): T {
    const text = this.stringValue(value);
    const allowedValues = Object.values(enumObject);

    if (!allowedValues.includes(text as T)) {
      throw new BadRequestException(
        `Snapshot contem valor invalido para ${fieldName}.`,
      );
    }

    return text as T;
  }

  private dateValue(value: unknown): Date | null {
    if (value === null || value === undefined) {
      return null;
    }

    const date = new Date(this.stringValue(value));

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  private summarizeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message.slice(0, 1000);
    }

    return 'Erro desconhecido.'.slice(0, 1000);
  }

  private toHttpException(error: unknown, fallbackMessage: string): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException ||
      error instanceof UnauthorizedException
    ) {
      return error;
    }

    return new InternalServerErrorException(fallbackMessage);
  }
}
