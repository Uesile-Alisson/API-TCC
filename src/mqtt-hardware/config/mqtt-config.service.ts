import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  direcaomqtt,
  origemmqtt,
  Prisma,
  statusconexaomqtt,
  statusencerramentoprocesso,
  statusencerramentotanque,
  statuspartidaprocesso,
  statusprocesso,
  statustanqueprocesso,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMqttConfigDTO } from '../dto/create-mqtt-config.dto';
import { UpdateMqttConfigDTO } from '../dto/update-mqtt-config.dto';
import { TopicValidator } from '../topics/topic-validator';
import { ActiveMqttConfig } from '../interfaces/active-mqtt-config.interface';
import { normalizeMqttBrokerUrl } from './mqtt-broker-url.util';

const DEFAULT_CONFIG_TOPIC = 'tsea/config';
const DEFAULT_ACK_TOPIC = 'tsea/acks';
const MQTT_CONFIG_KEY = 'MQTT_PRINCIPAL';
const CREDENTIALS_UPDATE_LEASE_MS = 5 * 60 * 1000;

type MqttUpdateKind = 'CREDENTIALS' | 'CONFIGURATION' | 'OPERATIONAL_CONTROL';

export type MqttOperationalControlAction =
  | 'RECONNECT'
  | 'DISCONNECT'
  | 'SYNC_HARDWARE'
  | 'RESTART_COMMUNICATION'
  | 'OPEN_ALL_VALVES'
  | 'CLOSE_ALL_VALVES'
  | 'SHUTDOWN_ALL_PUMPS';

export type EquipmentConfigurationMutation =
  | 'CREATE_PUMP'
  | 'UPDATE_PUMP'
  | 'ACTIVATE_PUMP'
  | 'DEACTIVATE_PUMP'
  | 'CREATE_TANK'
  | 'UPDATE_TANK'
  | 'ACTIVATE_TANK'
  | 'DEACTIVATE_TANK'
  | 'CREATE_SENSOR'
  | 'UPDATE_SENSOR'
  | 'START_SENSOR_CALIBRATION'
  | 'FINISH_SENSOR_CALIBRATION'
  | 'ACTIVATE_SENSOR'
  | 'DEACTIVATE_SENSOR'
  | 'UPDATE_SYSTEM_CONFIGURATION'
  | 'RESTORE_BACKUP';

const ACTIVE_TANK_LIFECYCLE_STATES: statustanqueprocesso[] = [
  statustanqueprocesso.EM_EXECUCAO,
  statustanqueprocesso.AGUARDANDO,
  statustanqueprocesso.GERANDO_VACUO,
  statustanqueprocesso.VACUO_ATINGIDO,
  statustanqueprocesso.VACUO_ESTABILIZADO,
  statustanqueprocesso.ALIMENTANDO,
  statustanqueprocesso.CHEIO,
];

const TERMINAL_TANK_CLOSURE_STATES: statusencerramentotanque[] = [
  statusencerramentotanque.INATIVO,
  statusencerramentotanque.CONCLUIDO,
];

const TERMINAL_GENERAL_CLOSURE_STATES: statusencerramentoprocesso[] = [
  statusencerramentoprocesso.INATIVO,
  statusencerramentoprocesso.CONCLUIDO,
];

type LockedMqttCredentialUpdateState = {
  id_mqtt_configuracao: number;
  credenciais_atualizacao_token: string | null;
  credenciais_atualizacao_bloqueada_ate: Date | null;
};

type OperationalProcessState = {
  id_processo: number;
  status_processo: statusprocesso;
  parada_emergencia: boolean;
  emergency_latch_reset_required?: boolean;
  status_partida: statuspartidaprocesso;
  status_encerramento_geral: statusencerramentoprocesso;
  processosauxiliares: {
    id_usuario_controle_bomba: number | null;
    controle_bomba_expira_em: Date | null;
  } | null;
  processostanques: Array<{
    id_processo_tanque: number;
    status_tanque_processo: statustanqueprocesso;
    status_encerramento: statusencerramentotanque;
    processostanquesauxiliares: {
      id_usuario_controle_valvula: number | null;
      controle_valvula_expira_em: Date | null;
    } | null;
  }>;
};

export type MqttCredentialStateUpdate = {
  usuario_mqtt_configurado: boolean;
  senha_mqtt_configurada: boolean;
  credenciais_verificadas_em: Date | null;
  ultima_falha_credenciais: string | null;
};

export type MqttCredentialStateUpdateOptions = {
  idUsuarioAlteracao?: number;
  recordHistory?: boolean;
  force?: boolean;
};

export type HardwareStatusSnapshotInput = {
  topic: string;
  payload: Prisma.InputJsonObject;
  receivedAt: Date;
  statusAt: Date;
};

export type HardwareStatusSnapshot = {
  id: number;
  topic: string;
  payload: Prisma.JsonValue;
  receivedAt: Date;
  statusAt: Date | null;
};

export const CONTROLLER_STATUS_CLOCK_TOLERANCE_MS = 5_000;

export function isControllerStatusTimestampFresh(input: {
  marker: Date;
  receivedAt: Date;
  statusAt: Date | null;
}): boolean {
  if (!input.statusAt || input.receivedAt.getTime() <= input.marker.getTime()) {
    return false;
  }

  const earliestAcceptedStatus =
    input.marker.getTime() - CONTROLLER_STATUS_CLOCK_TOLERANCE_MS;
  const latestAcceptedStatus =
    input.receivedAt.getTime() + CONTROLLER_STATUS_CLOCK_TOLERANCE_MS;

  return (
    input.statusAt.getTime() >= earliestAcceptedStatus &&
    input.statusAt.getTime() <= latestAcceptedStatus
  );
}

export function isControllerEmergencyLatchResetSnapshot(
  payload: Prisma.JsonValue,
): boolean {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    return false;
  }

  return (
    payload.tipo === 'HARDWARE_STATUS' &&
    payload.schema_version === 2 &&
    typeof payload.device_id === 'string' &&
    payload.device_id.trim().length > 0 &&
    payload.esp32_on === true &&
    payload.emergencia_ativa === false
  );
}

@Injectable()
export class MqttConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<ActiveMqttConfig> {
    const config = await this.prisma.mqttconfiguracoes.findUnique({
      where: {
        chave_configuracao: 'MQTT_PRINCIPAL',
      },
    });

    if (!config) {
      throw new NotFoundException('Nenhuma configuração mqtt foi encontrada.');
    }

    this.validateConfig(config);
    return config;
  }

  async createConfig(
    dto: CreateMqttConfigDTO,
    idUsuarioAlteracao?: number,
  ): Promise<ActiveMqttConfig> {
    await this.ensureConfigDoesMotExist();

    this.validateDtoTopics(dto);

    const createdConfig = await this.prisma.$transaction(async (tx) => {
      const brokerUrl = normalizeMqttBrokerUrl(dto.broker_url, dto.porta, true);
      const config = await tx.mqttconfiguracoes.create({
        data: {
          id_usuario_alteracao: idUsuarioAlteracao ?? null,
          broker_url: brokerUrl,
          porta: dto.porta,
          usuario_mqtt_configurado: false,
          senha_mqtt_configurada: false,
          credenciais_verificadas_em: null,
          ultima_falha_credenciais: null,
          topico_leituras: dto.topico_leituras,
          topico_comandos: dto.topico_comandos,
          topico_status: dto.topico_status,
          topico_alarmes: dto.topico_alarmes,
          topico_heartbeat: dto.topico_heartbeat,
          topico_acoplamentos: dto.topico_acoplamentos,
          topico_configuracoes:
            dto.topico_configuracoes ?? DEFAULT_CONFIG_TOPIC,
          topico_acks: dto.topico_acks ?? DEFAULT_ACK_TOPIC,
          reconexao_automatica: dto.reconexao_automatica,
          timeout_comunicacao: dto.timeout_comunicacao,
          status_conexao: statusconexaomqtt.DESCONECTADO,
          criado_em: new Date(),
          ultima_conexao: null,
          ultima_sincronizacao: null,
          ultima_falha: null,
          ativo: true,
        },
      });

      await this.createHistorySnapshot(tx, config);

      return config;
    });

    this.validateConfig(createdConfig);
    return createdConfig;
  }

  async updateConfig(
    dto: UpdateMqttConfigDTO,
    idUsuarioAlteracao: number,
    updateLeaseToken: string,
  ): Promise<ActiveMqttConfig> {
    const currentConfig = await this.getConfig();
    const candidate = this.buildCandidateConfig(currentConfig, dto);

    return await this.persistOperationalConfig(
      candidate,
      idUsuarioAlteracao,
      updateLeaseToken,
    );
  }

  buildCandidateConfig(
    currentConfig: ActiveMqttConfig,
    dto: UpdateMqttConfigDTO,
  ): ActiveMqttConfig {
    this.validateDtoTopics(dto);
    const port = dto.porta ?? currentConfig.porta;
    const brokerUrl = normalizeMqttBrokerUrl(
      dto.broker_url ?? currentConfig.broker_url,
      port,
      true,
    );
    const candidate: ActiveMqttConfig = {
      ...currentConfig,
      broker_url: brokerUrl,
      porta: port,
      topico_alarmes: dto.topico_alarmes ?? currentConfig.topico_alarmes,
      topico_comandos: dto.topico_comandos ?? currentConfig.topico_comandos,
      topico_heartbeat: dto.topico_heartbeat ?? currentConfig.topico_heartbeat,
      topico_leituras: dto.topico_leituras ?? currentConfig.topico_leituras,
      topico_status: dto.topico_status ?? currentConfig.topico_status,
      topico_acoplamentos:
        dto.topico_acoplamentos ?? currentConfig.topico_acoplamentos,
      topico_configuracoes:
        dto.topico_configuracoes ?? currentConfig.topico_configuracoes,
      topico_acks: dto.topico_acks ?? currentConfig.topico_acks,
      reconexao_automatica:
        dto.reconexao_automatica ?? currentConfig.reconexao_automatica,
      timeout_comunicacao:
        dto.timeout_comunicacao ?? currentConfig.timeout_comunicacao,
      ativo: dto.ativo ?? currentConfig.ativo,
      status_conexao: statusconexaomqtt.DESCONECTADO,
      ultima_conexao: null,
      ultima_falha: null,
      ultima_sincronizacao: null,
    };

    this.validateConfig(candidate);
    return candidate;
  }

  async restoreOperationalConfig(
    previousConfig: ActiveMqttConfig,
    idUsuarioAlteracao: number,
    updateLeaseToken: string,
  ): Promise<ActiveMqttConfig> {
    return await this.persistOperationalConfig(
      previousConfig,
      idUsuarioAlteracao,
      updateLeaseToken,
    );
  }

  async claimCredentialsUpdateLease(
    token: string,
    now = new Date(),
  ): Promise<Date> {
    return await this.claimMqttUpdateLease(token, 'CREDENTIALS', now);
  }

  async claimConfigurationUpdateLease(
    token: string,
    now = new Date(),
  ): Promise<Date> {
    return await this.claimMqttUpdateLease(token, 'CONFIGURATION', now);
  }

  async claimOperationalControlLease(
    token: string,
    action: MqttOperationalControlAction,
    now = new Date(),
  ): Promise<Date> {
    return await this.claimMqttUpdateLease(
      token,
      'OPERATIONAL_CONTROL',
      now,
      action,
    );
  }

  private async claimMqttUpdateLease(
    token: string,
    kind: MqttUpdateKind,
    now: Date,
    action?: MqttOperationalControlAction,
  ): Promise<Date> {
    this.validateCredentialsUpdateToken(token);
    const expiresAt = new Date(now.getTime() + CREDENTIALS_UPDATE_LEASE_MS);

    return await this.executeSerializable(async (tx) => {
      const lockedConfig = await this.lockCredentialUpdateState(tx);
      const activeProcess = await this.findOperationalProcess(tx, now);

      if (activeProcess) {
        const blockers = this.buildOperationalBlockers(activeProcess, now);
        throw new ConflictException({
          statusCode: 409,
          code: this.updateBlockedByProcessCode(kind),
          message:
            `${this.updateSubject(kind)} nao pode ser executado enquanto o processo ` +
            `${activeProcess.id_processo} possui estado operacional protegido.`,
          ...(action ? { operacao: action } : {}),
          bloqueios_operacionais: blockers,
          id_processo: activeProcess.id_processo,
          status_processo: activeProcess.status_processo,
          status_partida: activeProcess.status_partida,
          status_encerramento_geral: activeProcess.status_encerramento_geral,
        });
      }

      if (
        lockedConfig.credenciais_atualizacao_token &&
        lockedConfig.credenciais_atualizacao_bloqueada_ate &&
        lockedConfig.credenciais_atualizacao_bloqueada_ate > now
      ) {
        throw new ConflictException({
          statusCode: 409,
          code:
            kind === 'OPERATIONAL_CONTROL'
              ? 'MQTT_EXCLUSIVE_OPERATION_ALREADY_IN_PROGRESS'
              : 'MQTT_UPDATE_ALREADY_IN_PROGRESS',
          message:
            'Ja existe uma atualizacao ou operacao MQTT exclusiva em andamento.',
        });
      }

      await tx.mqttconfiguracoes.update({
        where: { chave_configuracao: MQTT_CONFIG_KEY },
        data: {
          credenciais_atualizacao_token: token,
          credenciais_atualizacao_bloqueada_ate: expiresAt,
        },
      });

      return expiresAt;
    });
  }

  async renewCredentialsUpdateLease(
    token: string,
    now = new Date(),
  ): Promise<Date> {
    return await this.renewMqttUpdateLease(token, 'CREDENTIALS', now);
  }

  async renewConfigurationUpdateLease(
    token: string,
    now = new Date(),
  ): Promise<Date> {
    return await this.renewMqttUpdateLease(token, 'CONFIGURATION', now);
  }

  private async renewMqttUpdateLease(
    token: string,
    kind: MqttUpdateKind,
    now: Date,
  ): Promise<Date> {
    this.validateCredentialsUpdateToken(token);
    const expiresAt = new Date(now.getTime() + CREDENTIALS_UPDATE_LEASE_MS);

    return await this.executeSerializable(async (tx) => {
      const lockedConfig = await this.lockCredentialUpdateState(tx);

      if (lockedConfig.credenciais_atualizacao_token !== token) {
        throw new ConflictException({
          statusCode: 409,
          code: 'MQTT_UPDATE_LEASE_LOST',
          message: 'A atualizacao MQTT perdeu a exclusao operacional.',
        });
      }

      const activeProcess = await this.findOperationalProcess(tx);
      if (activeProcess) {
        throw new ConflictException({
          statusCode: 409,
          code: this.updateBlockedByProcessCode(kind),
          message:
            `${this.updateSubject(kind)} nao pode ser gravado enquanto o processo ` +
            `${activeProcess.id_processo} esta em partida, execucao ou pausa.`,
          id_processo: activeProcess.id_processo,
          status_processo: activeProcess.status_processo,
          status_partida: activeProcess.status_partida,
        });
      }

      const renewed = await tx.mqttconfiguracoes.updateMany({
        where: {
          chave_configuracao: MQTT_CONFIG_KEY,
          credenciais_atualizacao_token: token,
        },
        data: { credenciais_atualizacao_bloqueada_ate: expiresAt },
      });
      if (renewed.count !== 1) {
        throw new ConflictException(
          'A atualizacao MQTT perdeu a exclusao operacional.',
        );
      }

      return expiresAt;
    });
  }

  async releaseCredentialsUpdateLease(token: string): Promise<void> {
    await this.releaseMqttUpdateLease(token);
  }

  async releaseConfigurationUpdateLease(token: string): Promise<void> {
    await this.releaseMqttUpdateLease(token);
  }

  async releaseOperationalControlLease(token: string): Promise<void> {
    await this.releaseMqttUpdateLease(token);
  }

  async executeProtectedEquipmentMutation<T>(
    action: EquipmentConfigurationMutation,
    mutation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return await this.executeSerializable(async (tx) => {
      const now = new Date();
      const lockedConfig = await this.lockCredentialUpdateState(tx);

      if (
        lockedConfig.credenciais_atualizacao_token &&
        lockedConfig.credenciais_atualizacao_bloqueada_ate &&
        lockedConfig.credenciais_atualizacao_bloqueada_ate > now
      ) {
        throw new ConflictException({
          statusCode: 409,
          code: 'EQUIPMENT_CONFIG_BLOCKED_BY_MQTT_EXCLUSIVE_OPERATION',
          message:
            'A configuracao do equipamento nao pode mudar durante uma operacao MQTT exclusiva.',
          operacao: action,
          bloqueios_operacionais: ['MQTT_EXCLUSIVE_OPERATION_IN_PROGRESS'],
        });
      }

      const activeProcess = await this.findOperationalProcess(tx, now);
      if (activeProcess) {
        throw new ConflictException({
          statusCode: 409,
          code: 'EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE',
          message:
            `A configuracao do equipamento nao pode mudar enquanto o processo ` +
            `${activeProcess.id_processo} possui estado operacional protegido.`,
          operacao: action,
          bloqueios_operacionais: this.buildOperationalBlockers(
            activeProcess,
            now,
          ),
          id_processo: activeProcess.id_processo,
          status_processo: activeProcess.status_processo,
          status_partida: activeProcess.status_partida,
          status_encerramento_geral: activeProcess.status_encerramento_geral,
        });
      }

      return await mutation(tx);
    });
  }

  private async releaseMqttUpdateLease(token: string): Promise<void> {
    this.validateCredentialsUpdateToken(token);
    await this.prisma.mqttconfiguracoes.updateMany({
      where: {
        chave_configuracao: MQTT_CONFIG_KEY,
        credenciais_atualizacao_token: token,
      },
      data: {
        credenciais_atualizacao_token: null,
        credenciais_atualizacao_bloqueada_ate: null,
      },
    });
  }

  private async persistOperationalConfig(
    candidate: ActiveMqttConfig,
    idUsuarioAlteracao: number,
    updateLeaseToken: string,
  ): Promise<ActiveMqttConfig> {
    this.validateCredentialsUpdateToken(updateLeaseToken);
    this.validateConfig(candidate);

    return await this.executeSerializable(async (tx) => {
      const now = new Date();
      const lockedConfig = await this.lockCredentialUpdateState(tx);
      if (
        lockedConfig.credenciais_atualizacao_token !== updateLeaseToken ||
        !lockedConfig.credenciais_atualizacao_bloqueada_ate ||
        lockedConfig.credenciais_atualizacao_bloqueada_ate <= now
      ) {
        throw new ConflictException({
          statusCode: 409,
          code: 'MQTT_UPDATE_LEASE_LOST',
          message: 'A atualizacao MQTT perdeu a exclusao operacional.',
        });
      }

      const activeProcess = await this.findOperationalProcess(tx);
      if (activeProcess) {
        throw new ConflictException({
          statusCode: 409,
          code: 'MQTT_CONFIG_UPDATE_BLOCKED_BY_ACTIVE_PROCESS',
          message:
            `A configuracao MQTT nao pode ser gravada enquanto o processo ` +
            `${activeProcess.id_processo} esta em partida, execucao ou pausa.`,
          id_processo: activeProcess.id_processo,
          status_processo: activeProcess.status_processo,
          status_partida: activeProcess.status_partida,
        });
      }

      const config = await tx.mqttconfiguracoes.update({
        where: { chave_configuracao: MQTT_CONFIG_KEY },
        data: {
          id_usuario_alteracao: idUsuarioAlteracao,
          broker_url: candidate.broker_url,
          porta: candidate.porta,
          topico_alarmes: candidate.topico_alarmes,
          topico_comandos: candidate.topico_comandos,
          topico_heartbeat: candidate.topico_heartbeat,
          topico_leituras: candidate.topico_leituras,
          topico_status: candidate.topico_status,
          topico_acoplamentos: candidate.topico_acoplamentos,
          topico_configuracoes: candidate.topico_configuracoes,
          topico_acks: candidate.topico_acks,
          reconexao_automatica: candidate.reconexao_automatica,
          timeout_comunicacao: candidate.timeout_comunicacao,
          ativo: candidate.ativo,
          status_conexao: statusconexaomqtt.DESCONECTADO,
          ultima_conexao: null,
          ultima_falha: null,
          ultima_sincronizacao: null,
          atualizado_em: now,
        },
      });

      this.validateConfig(config);
      await this.createHistorySnapshot(tx, config);
      return config;
    });
  }

  private async executeSerializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !this.isSerializableWriteConflict(error) ||
          attempt === maxAttempts
        ) {
          throw error;
        }
      }
    }

    throw new ConflictException(
      'Nao foi possivel obter exclusao para a operacao de configuracao.',
    );
  }

  private isSerializableWriteConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }

  async updateConnectionStatus(
    status: statusconexaomqtt,
    ultima_falha?: string | null,
    expectedConfig?: ActiveMqttConfig,
  ): Promise<boolean> {
    const config = expectedConfig ?? (await this.getConfig());
    const updated = await this.prisma.mqttconfiguracoes.updateMany({
      where: {
        chave_configuracao: config.chave_configuracao,
        ...(expectedConfig
          ? {
              broker_url: expectedConfig.broker_url,
              porta: expectedConfig.porta,
              topico_leituras: expectedConfig.topico_leituras,
              topico_comandos: expectedConfig.topico_comandos,
              topico_status: expectedConfig.topico_status,
              topico_alarmes: expectedConfig.topico_alarmes,
              topico_heartbeat: expectedConfig.topico_heartbeat,
              topico_acoplamentos: expectedConfig.topico_acoplamentos,
              topico_configuracoes: expectedConfig.topico_configuracoes,
              topico_acks: expectedConfig.topico_acks,
              reconexao_automatica: expectedConfig.reconexao_automatica,
              timeout_comunicacao: expectedConfig.timeout_comunicacao,
              ativo: expectedConfig.ativo,
            }
          : {}),
      },
      data: {
        status_conexao: status,
        ultima_conexao:
          status === statusconexaomqtt.CONECTADO ? new Date() : undefined,
        ultima_falha:
          status === statusconexaomqtt.CONECTADO
            ? null
            : ultima_falha !== undefined
              ? ultima_falha
              : undefined,
        atualizado_em: new Date(),
      },
    });

    return updated.count === 1;
  }

  private async lockCredentialUpdateState(
    tx: Prisma.TransactionClient,
  ): Promise<LockedMqttCredentialUpdateState> {
    const [config] = await tx.$queryRaw<LockedMqttCredentialUpdateState[]>`
      SELECT
        "id_mqtt_configuracao",
        "credenciais_atualizacao_token",
        "credenciais_atualizacao_bloqueada_ate"
      FROM "mqttconfiguracoes"
      WHERE "chave_configuracao" = 'MQTT_PRINCIPAL'
      FOR UPDATE
    `;

    if (!config) {
      throw new NotFoundException('Nenhuma configuracao mqtt foi encontrada.');
    }

    return config;
  }

  private async findOperationalProcess(
    tx: Prisma.TransactionClient,
    now = new Date(),
  ): Promise<OperationalProcessState | null> {
    const operationalProcess = await tx.processos.findFirst({
      where: {
        OR: [
          {
            status_processo: {
              in: [statusprocesso.EM_EXECUCAO, statusprocesso.PAUSADO],
            },
          },
          { status_partida: statuspartidaprocesso.EM_ANDAMENTO },
          {
            status_encerramento_geral: {
              notIn: TERMINAL_GENERAL_CLOSURE_STATES,
            },
          },
          {
            parada_emergencia: true,
            status_encerramento_geral: {
              not: statusencerramentoprocesso.CONCLUIDO,
            },
          },
          {
            processosauxiliares: {
              is: {
                id_usuario_controle_bomba: { not: null },
                controle_bomba_expira_em: { gt: now },
              },
            },
          },
          {
            AND: [
              {
                status_processo: {
                  notIn: [
                    statusprocesso.CONCLUIDO,
                    statusprocesso.INTERROMPIDO,
                    statusprocesso.FALHA,
                  ],
                },
              },
              {
                processostanques: {
                  some: {
                    OR: [
                      {
                        status_tanque_processo: {
                          in: ACTIVE_TANK_LIFECYCLE_STATES,
                        },
                      },
                      {
                        status_encerramento: {
                          notIn: TERMINAL_TANK_CLOSURE_STATES,
                        },
                      },
                      {
                        processostanquesauxiliares: {
                          is: {
                            id_usuario_controle_valvula: { not: null },
                            controle_valvula_expira_em: { gt: now },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      select: {
        id_processo: true,
        status_processo: true,
        parada_emergencia: true,
        status_partida: true,
        status_encerramento_geral: true,
        processosauxiliares: {
          select: {
            id_usuario_controle_bomba: true,
            controle_bomba_expira_em: true,
          },
        },
        processostanques: {
          select: {
            id_processo_tanque: true,
            status_tanque_processo: true,
            status_encerramento: true,
            processostanquesauxiliares: {
              select: {
                id_usuario_controle_valvula: true,
                controle_valvula_expira_em: true,
              },
            },
          },
        },
      },
      orderBy: { id_processo: 'asc' },
    });

    if (operationalProcess) {
      return operationalProcess;
    }

    return this.findConfirmedEmergencyAwaitingLatchReset(tx);
  }

  private async findConfirmedEmergencyAwaitingLatchReset(
    tx: Prisma.TransactionClient,
  ): Promise<OperationalProcessState | null> {
    const emergency = await tx.processos.findFirst({
      where: {
        parada_emergencia: true,
        status_encerramento_geral: statusencerramentoprocesso.CONCLUIDO,
        encerramento_geral_finalizado_em: { not: null },
      },
      select: {
        id_processo: true,
        status_processo: true,
        parada_emergencia: true,
        status_partida: true,
        status_encerramento_geral: true,
        encerramento_geral_finalizado_em: true,
      },
      orderBy: [
        { encerramento_geral_finalizado_em: 'desc' },
        { id_processo: 'desc' },
      ],
    });

    if (!emergency?.encerramento_geral_finalizado_em) {
      return null;
    }

    const config = await tx.mqttconfiguracoes.findUnique({
      where: { chave_configuracao: MQTT_CONFIG_KEY },
      select: {
        id_mqtt_configuracao: true,
        topico_status: true,
      },
    });
    const snapshot = config
      ? await tx.mqttmensagens.findFirst({
          where: {
            id_mqtt_configuracao: config.id_mqtt_configuracao,
            topico: config.topico_status,
            direcao: direcaomqtt.RECEBIDA,
            origem: origemmqtt.ESP32,
            recebido_em: {
              gt: emergency.encerramento_geral_finalizado_em,
            },
            payload: {
              path: ['tipo'],
              equals: 'HARDWARE_STATUS',
            },
          },
          select: {
            payload: true,
            recebido_em: true,
            enviado_em: true,
          },
          orderBy: [{ recebido_em: 'desc' }, { id_mqtt_mensagem: 'desc' }],
        })
      : null;

    if (
      snapshot?.recebido_em &&
      isControllerEmergencyLatchResetSnapshot(snapshot.payload) &&
      isControllerStatusTimestampFresh({
        marker: emergency.encerramento_geral_finalizado_em,
        receivedAt: snapshot.recebido_em,
        statusAt: snapshot.enviado_em,
      })
    ) {
      return null;
    }

    return {
      id_processo: emergency.id_processo,
      status_processo: emergency.status_processo,
      parada_emergencia: true,
      emergency_latch_reset_required: true,
      status_partida: emergency.status_partida,
      status_encerramento_geral: emergency.status_encerramento_geral,
      processosauxiliares: null,
      processostanques: [],
    };
  }

  private buildOperationalBlockers(
    process: OperationalProcessState,
    now: Date,
  ): string[] {
    const blockers = new Set<string>();

    if (
      process.status_processo === statusprocesso.EM_EXECUCAO ||
      process.status_processo === statusprocesso.PAUSADO
    ) {
      blockers.add('PROCESS_ACTIVE_OR_PAUSED');
    }
    if (process.status_partida === statuspartidaprocesso.EM_ANDAMENTO) {
      blockers.add('PROCESS_STARTUP_IN_PROGRESS');
    }
    if (
      process.parada_emergencia &&
      process.status_encerramento_geral !== statusencerramentoprocesso.CONCLUIDO
    ) {
      blockers.add('EMERGENCY_STOP_HARDWARE_UNCONFIRMED');
    }
    if (process.emergency_latch_reset_required) {
      blockers.add('EMERGENCY_LATCH_RESET_REQUIRED');
    }
    if (
      !TERMINAL_GENERAL_CLOSURE_STATES.includes(
        process.status_encerramento_geral,
      )
    ) {
      blockers.add('GENERAL_CLOSURE_IN_PROGRESS');
    }

    const pumpLease = process.processosauxiliares;
    if (
      pumpLease?.id_usuario_controle_bomba != null &&
      pumpLease.controle_bomba_expira_em != null &&
      pumpLease.controle_bomba_expira_em > now
    ) {
      blockers.add('HUMAN_PUMP_LEASE_ACTIVE');
    }

    const inspectPersistedTankState =
      process.status_processo !== statusprocesso.CONCLUIDO &&
      process.status_processo !== statusprocesso.INTERROMPIDO &&
      process.status_processo !== statusprocesso.FALHA;

    for (const tank of process.processostanques ?? []) {
      if (
        inspectPersistedTankState &&
        ACTIVE_TANK_LIFECYCLE_STATES.includes(tank.status_tanque_processo)
      ) {
        blockers.add('TANK_LIFECYCLE_ACTIVE');
      }
      if (
        inspectPersistedTankState &&
        !TERMINAL_TANK_CLOSURE_STATES.includes(tank.status_encerramento)
      ) {
        blockers.add('TANK_CLOSURE_IN_PROGRESS');
      }

      const valveLease = tank.processostanquesauxiliares;
      if (
        valveLease?.id_usuario_controle_valvula != null &&
        valveLease.controle_valvula_expira_em != null &&
        valveLease.controle_valvula_expira_em > now
      ) {
        blockers.add('HUMAN_VALVE_LEASE_ACTIVE');
      }
    }

    return [...blockers];
  }

  private validateCredentialsUpdateToken(token: string): void {
    if (!token || token.length > 64) {
      throw new BadRequestException(
        'Token interno da atualizacao MQTT invalido.',
      );
    }
  }

  private updateBlockedByProcessCode(kind: MqttUpdateKind): string {
    if (kind === 'OPERATIONAL_CONTROL') {
      return 'MQTT_OPERATION_BLOCKED_BY_PROCESS_STATE';
    }
    return kind === 'CREDENTIALS'
      ? 'MQTT_CREDENTIALS_UPDATE_BLOCKED_BY_ACTIVE_PROCESS'
      : 'MQTT_CONFIG_UPDATE_BLOCKED_BY_ACTIVE_PROCESS';
  }

  private updateSubject(kind: MqttUpdateKind): string {
    if (kind === 'OPERATIONAL_CONTROL') {
      return 'A operacao administrativa MQTT';
    }
    return kind === 'CREDENTIALS'
      ? 'As credenciais MQTT'
      : 'A configuracao MQTT';
  }

  async updateLastSync(): Promise<void> {
    const config = await this.getConfig();

    await this.prisma.mqttconfiguracoes.update({
      where: {
        chave_configuracao: config.chave_configuracao,
      },
      data: {
        ultima_sincronizacao: new Date(),
        atualizado_em: new Date(),
      },
    });
  }

  /**
   * Persists the validated, canonical status received from the ESP32.
   * Retained-message filtering belongs to StatusHandler so that a retained
   * broker cache can never be journaled as a new physical observation.
   */
  async registerHardwareStatusSnapshot(
    input: HardwareStatusSnapshotInput,
  ): Promise<void> {
    const config = await this.getConfig();

    await this.prisma.mqttmensagens.create({
      data: {
        id_mqtt_configuracao: config.id_mqtt_configuracao,
        topico: input.topic,
        payload: input.payload,
        direcao: direcaomqtt.RECEBIDA,
        origem: origemmqtt.ESP32,
        recebido_em: input.receivedAt,
        enviado_em: input.statusAt,
      },
    });
  }

  /**
   * Returns only the newest non-retained HARDWARE_STATUS journal entry that
   * was observed strictly after the supplied safety-command marker.
   */
  async findLatestHardwareStatusSnapshotAfter(
    marker: Date,
  ): Promise<HardwareStatusSnapshot | null> {
    const config = await this.getConfig();
    const snapshot = await this.prisma.mqttmensagens.findFirst({
      where: {
        id_mqtt_configuracao: config.id_mqtt_configuracao,
        topico: config.topico_status,
        direcao: direcaomqtt.RECEBIDA,
        origem: origemmqtt.ESP32,
        recebido_em: { gt: marker },
        payload: {
          path: ['tipo'],
          equals: 'HARDWARE_STATUS',
        },
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

    if (!snapshot?.recebido_em) {
      return null;
    }

    return {
      id: snapshot.id_mqtt_mensagem,
      topic: snapshot.topico,
      payload: snapshot.payload,
      receivedAt: snapshot.recebido_em,
      statusAt: snapshot.enviado_em,
    };
  }

  async updateCredentialState(
    state: MqttCredentialStateUpdate,
    options: MqttCredentialStateUpdateOptions = {},
  ): Promise<ActiveMqttConfig> {
    const currentConfig = await this.getConfig();
    const normalizedState: MqttCredentialStateUpdate = {
      ...state,
      ultima_falha_credenciais: state.ultima_falha_credenciais
        ? state.ultima_falha_credenciais.trim().slice(0, 1000)
        : null,
    };

    if (
      !options.force &&
      this.hasSameCredentialState(currentConfig, normalizedState)
    ) {
      return currentConfig;
    }

    const updateData = {
      id_usuario_alteracao: options.idUsuarioAlteracao,
      ...normalizedState,
      atualizado_em: new Date(),
    };

    if (!options.recordHistory) {
      return await this.prisma.mqttconfiguracoes.update({
        where: {
          chave_configuracao: currentConfig.chave_configuracao,
        },
        data: updateData,
      });
    }

    return await this.prisma.$transaction(async (tx) => {
      const config = await tx.mqttconfiguracoes.update({
        where: {
          chave_configuracao: currentConfig.chave_configuracao,
        },
        data: updateData,
      });

      await this.createHistorySnapshot(tx, config);
      return config;
    });
  }

  async getConfigHitory(limit = 20) {
    return await this.prisma.mqttconfiguracoeshistorico.findMany({
      orderBy: {
        registrado_em: 'desc',
      },
      take: limit,
    });
  }

  async registerProcessConfigUsage(idProcesso: number): Promise<void> {
    const config = await this.getConfig();

    await this.prisma.$transaction(async (tx) => {
      const history = await this.createHistorySnapshot(tx, config);

      await tx.processosmqttconfiguracoeshistorico.create({
        data: {
          id_processo: idProcesso,
          id_mqtt_configuracao_historico:
            history.id_mqtt_configuracao_historico,
          usado_de: new Date(),
          usado_ate: null,
        },
      });

      return history;
    });
  }

  async finishProcessConfigUsage(idProcesso: number): Promise<void> {
    const activeUsage =
      await this.prisma.processosmqttconfiguracoeshistorico.findFirst({
        where: {
          id_processo: idProcesso,
          usado_ate: null,
        },
        orderBy: {
          usado_ate: 'desc',
        },
      });

    if (!activeUsage) {
      throw new NotFoundException(
        'Configuração MQTT do processo informado não foi achada.',
      );
    }

    await this.prisma.processosmqttconfiguracoeshistorico.update({
      where: {
        id_processo_mqtt_configuracao_historico:
          activeUsage.id_processo_mqtt_configuracao_historico,
      },
      data: {
        usado_ate: new Date(),
      },
    });
  }

  private validateConfig(config: ActiveMqttConfig): void {
    if (!config.broker_url || config.broker_url.trim().length === 0) {
      throw new BadRequestException('Broker MQTT não configurado');
    }

    if (
      !Number.isInteger(config.porta) ||
      config.porta < 1 ||
      config.porta > 65535
    ) {
      throw new BadRequestException('Porta Mqtt inválida.');
    }

    try {
      normalizeMqttBrokerUrl(config.broker_url, config.porta, true);
    } catch (error) {
      throw new BadRequestException(this.getErrorMessage(error));
    }

    TopicValidator.validateTopics(config.topico_alarmes, 'topico_alarmes');
    TopicValidator.validateTopics(config.topico_comandos, 'topico_comandos');
    TopicValidator.validateTopics(config.topico_heartbeat, 'topico_heartbeat');
    TopicValidator.validateTopics(config.topico_leituras, 'topico_leituras');
    TopicValidator.validateTopics(config.topico_status, 'topico_status');
    TopicValidator.validateTopics(
      config.topico_acoplamentos,
      'topico_acoplamentos',
    );
    TopicValidator.validateTopics(
      config.topico_configuracoes,
      'topico_configuracoes',
    );
    TopicValidator.validateTopics(config.topico_acks, 'topico_acks');

    if (
      !Number.isInteger(config.timeout_comunicacao) ||
      config.timeout_comunicacao < 1000 ||
      config.timeout_comunicacao > 120_000
    ) {
      throw new BadRequestException(
        'timeout_comunicacao deve ser um inteiro entre 1000 e 120000 ms',
      );
    }
  }

  private hasSameCredentialState(
    config: ActiveMqttConfig,
    state: MqttCredentialStateUpdate,
  ): boolean {
    return (
      config.usuario_mqtt_configurado === state.usuario_mqtt_configurado &&
      config.senha_mqtt_configurada === state.senha_mqtt_configurada &&
      (config.credenciais_verificadas_em?.getTime() ?? null) ===
        (state.credenciais_verificadas_em?.getTime() ?? null) &&
      config.ultima_falha_credenciais === state.ultima_falha_credenciais
    );
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Broker MQTT invalido.';
  }

  private async ensureConfigDoesMotExist(): Promise<void> {
    const count = await this.prisma.mqttconfiguracoes.count();

    if (count > 0) {
      throw new ConflictException(
        'Já existe uma configuração MQTT cadastrada. Utilize atualização em vez de criação.',
      );
    }
  }

  private validateDtoTopics(
    dto: Partial<CreateMqttConfigDTO | UpdateMqttConfigDTO>,
  ): void {
    if (dto.topico_leituras) {
      TopicValidator.validateTopics(dto.topico_leituras, 'topico_leituras');
    }

    if (dto.topico_comandos) {
      TopicValidator.validateTopics(dto.topico_comandos, 'topico_comandos');
    }

    if (dto.topico_status) {
      TopicValidator.validateTopics(dto.topico_status, 'topico_status');
    }

    if (dto.topico_alarmes) {
      TopicValidator.validateTopics(dto.topico_alarmes, 'topico_alarmes');
    }

    if (dto.topico_heartbeat) {
      TopicValidator.validateTopics(dto.topico_heartbeat, 'topico_heartbeat');
    }

    if (dto.topico_acoplamentos) {
      TopicValidator.validateTopics(
        dto.topico_acoplamentos,
        'topico_acoplamentos',
      );
    }

    if (dto.topico_configuracoes) {
      TopicValidator.validateTopics(
        dto.topico_configuracoes,
        'topico_configuracoes',
      );
    }

    if (dto.topico_acks) {
      TopicValidator.validateTopics(dto.topico_acks, 'topico_acks');
    }
  }

  private async createHistorySnapshot(
    tx: Prisma.TransactionClient,
    config: ActiveMqttConfig,
  ) {
    return await tx.mqttconfiguracoeshistorico.create({
      data: {
        id_mqtt_configuracao: config.id_mqtt_configuracao,
        id_usuario_alteracao: config.id_usuario_alteracao ?? null,
        broker_url: config.broker_url,
        porta: config.porta,
        usuario_mqtt_configurado: config.usuario_mqtt_configurado,
        senha_mqtt_configurada: config.senha_mqtt_configurada,
        credenciais_verificadas_em: config.credenciais_verificadas_em ?? null,
        ultima_falha_credenciais: config.ultima_falha_credenciais ?? null,
        topico_leituras: config.topico_leituras,
        topico_comandos: config.topico_comandos,
        topico_status: config.topico_status,
        topico_alarmes: config.topico_alarmes,
        topico_heartbeat: config.topico_heartbeat,
        topico_acoplamentos: config.topico_acoplamentos,
        topico_configuracoes: config.topico_configuracoes,
        topico_acks: config.topico_acks,
        reconexao_automatica: config.reconexao_automatica,
        timeout_comunicacao: config.timeout_comunicacao,
        status_conexao: config.status_conexao,
        ultima_conexao: config.ultima_conexao ?? null,
        ultima_sincronizacao: config.ultima_sincronizacao ?? null,
        ultima_falha: config.ultima_falha ?? null,
        criado_em: config.criado_em,
        atualizado_em: config.atualizado_em ?? null,
        registrado_em: new Date(),
      },
    });
  }
}
