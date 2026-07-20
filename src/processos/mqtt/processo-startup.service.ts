import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  direcaomqtt,
  etapapartidaprocesso,
  origemmqtt,
  Prisma,
  statusencerramentoprocesso,
  statuspartidaprocesso,
  statusprocesso,
  StatusValvula,
  tipobomba,
} from '@prisma/client';
import {
  isControllerEmergencyLatchResetSnapshot,
  isControllerStatusTimestampFresh,
} from '../../mqtt-hardware/config/mqtt-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserPayload } from '../interfaces';
import { ProcessoLifecycleService } from '../lifecycle';
import {
  type ProcessoPersistAudit,
  ProcessosRepository,
} from '../processos.repository';
import {
  ProcessoMqttCommandContext,
  ProcessoMqttOperationResult,
  ProcessoMqttStartupStage,
} from './processo-mqtt.types';
import { ProcessoMqttOrchestratorService } from './processo-mqtt-orchestrator.service';

const STARTUP_LEASE_MS = 45_000;
const RECOVERY_RETRY_MS = 5_000;
const HARDWARE_CONFIRMATION_TIMEOUT_MS = 15_000;
const HARDWARE_POLL_INTERVAL_MS = 250;

interface StartupClaim {
  version: number;
  attempt: number;
  marker: Date;
}

type MqttUpdateInterlockState = {
  id_mqtt_configuracao: number;
  topico_status: string;
  credenciais_atualizacao_bloqueada_ate: Date | null;
};

@Injectable()
export class ProcessoStartupService {
  private readonly logger = new Logger(ProcessoStartupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: ProcessosRepository,
    private readonly lifecycleService: ProcessoLifecycleService,
    private readonly orchestrator: ProcessoMqttOrchestratorService,
  ) {}

  async execute(input: {
    id_processo: number;
    user: CurrentUserPayload;
    mqttContext: ProcessoMqttCommandContext;
    persistAudit?: ProcessoPersistAudit;
  }) {
    const idUsuario = this.resolveUserId(input.user);
    const claim = await this.beginStartup(input.id_processo, idUsuario);
    let version = claim.version;
    const correlationPrefix =
      `process-startup-p${input.id_processo}` + `-r${claim.attempt}`;

    try {
      const prepare = await this.orchestrator.prepareHardwareForStart(
        input.mqttContext,
        {
          correlationPrefix,
          onStage: async (stage) => {
            version = await this.touchStage(input.id_processo, version, stage);
            if (stage === 'SINCRONIZANDO_HARDWARE') {
              await this.waitForHardwareState(
                input.id_processo,
                claim.marker,
                'SAFE',
              );
            }
          },
        },
      );
      this.assertSuccess(prepare);

      const start = await this.orchestrator.startVacuumOperation(
        input.mqttContext,
        {
          correlationPrefix,
          onStage: async (stage) => {
            version = await this.touchStage(input.id_processo, version, stage);
          },
        },
      );
      this.assertSuccess(start);

      version = await this.touchStage(
        input.id_processo,
        version,
        'CONFIRMANDO_TELEMETRIA',
      );
      await this.waitForHardwareState(
        input.id_processo,
        claim.marker,
        'RUNNING',
      );

      const completedAt = new Date();
      return await this.repository.applyLifecycleTransition({
        id_processo: input.id_processo,
        transition: this.lifecycleService.buildStartTransition({
          now: completedAt,
        }),
        startupCompletion: {
          expectedVersion: version,
          completedAt,
        },
        ...(input.persistAudit ? { persistAudit: input.persistAudit } : {}),
      });
    } catch (error) {
      await this.rollbackOrScheduleRetry({
        idProcesso: input.id_processo,
        version,
        correlationPrefix: `${correlationPrefix}-rollback`,
        originalError: error,
      });
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_SECOND, {
    name: 'processo-startup-recovery',
    waitForCompletion: true,
    disabled:
      process.env.NODE_ENV === 'test' ||
      process.env.PROCESS_STARTUP_RECOVERY_DISABLED === 'true',
  })
  async recoverExpiredStartups(now = new Date()): Promise<void> {
    const expired = await this.prisma.processos.findMany({
      where: {
        status_partida: statuspartidaprocesso.EM_ANDAMENTO,
        OR: [
          { partida_execucao_bloqueada_ate: null },
          { partida_execucao_bloqueada_ate: { lte: now } },
        ],
      },
      select: {
        id_processo: true,
        partida_versao: true,
        partida_tentativa: true,
        partida_ultimo_erro: true,
      },
      orderBy: { id_processo: 'asc' },
    });

    for (const process of expired) {
      const claimed = await this.prisma.processos.updateMany({
        where: {
          id_processo: process.id_processo,
          status_partida: statuspartidaprocesso.EM_ANDAMENTO,
          partida_versao: process.partida_versao,
          OR: [
            { partida_execucao_bloqueada_ate: null },
            { partida_execucao_bloqueada_ate: { lte: now } },
          ],
        },
        data: {
          etapa_partida: etapapartidaprocesso.EXECUTANDO_ROLLBACK,
          partida_execucao_bloqueada_ate: new Date(
            now.getTime() + STARTUP_LEASE_MS,
          ),
          partida_versao: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        continue;
      }

      const version = process.partida_versao + 1;
      const reason =
        process.partida_ultimo_erro ??
        'Partida interrompida por queda ou reinicializacao da API.';
      try {
        await this.rollbackOrScheduleRetry({
          idProcesso: process.id_processo,
          version,
          correlationPrefix:
            `process-startup-p${process.id_processo}` +
            `-r${process.partida_tentativa}-recovery`,
          originalError: new Error(reason),
        });
      } catch (error) {
        this.logger.error(
          `Recuperacao da partida ${process.id_processo} falhou: ${this.errorMessage(error)}`,
        );
      }
    }
  }

  private async beginStartup(
    idProcesso: number,
    idUsuario: number,
  ): Promise<StartupClaim> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const mqttConfig = await this.assertNoMqttUpdateInProgress(
            tx,
            new Date(),
          );
          await this.assertNoUnconfirmedEmergencyStop(tx);
          await this.assertEmergencyLatchWasReset(tx, mqttConfig);

          const current = await tx.processos.findUnique({
            where: { id_processo: idProcesso },
            select: {
              status_processo: true,
              status_partida: true,
              partida_versao: true,
              partida_tentativa: true,
            },
          });
          if (!current) {
            throw new ConflictException(
              `Processo ${idProcesso} nao existe para iniciar.`,
            );
          }
          if (current.status_processo !== statusprocesso.CONFIGURADO) {
            throw new ConflictException(
              `Processo ${idProcesso} nao esta CONFIGURADO.`,
            );
          }
          if (current.status_partida === statuspartidaprocesso.EM_ANDAMENTO) {
            throw new ConflictException(
              `Processo ${idProcesso} ja possui partida em andamento.`,
            );
          }

          const marker = new Date();
          const claimed = await tx.processos.updateMany({
            where: {
              id_processo: idProcesso,
              status_processo: statusprocesso.CONFIGURADO,
              status_partida: { not: statuspartidaprocesso.EM_ANDAMENTO },
              partida_versao: current.partida_versao,
            },
            data: {
              status_partida: statuspartidaprocesso.EM_ANDAMENTO,
              etapa_partida: etapapartidaprocesso.PREPARANDO_ESTADO_SEGURO,
              partida_iniciada_em: marker,
              partida_finalizada_em: null,
              partida_confirmacao_iniciada_em: marker,
              partida_execucao_bloqueada_ate: new Date(
                marker.getTime() + STARTUP_LEASE_MS,
              ),
              partida_tentativa: { increment: 1 },
              partida_comando_tentativas: 0,
              partida_ultimo_erro: null,
              partida_id_usuario: idUsuario,
              partida_versao: { increment: 1 },
            },
          });
          if (claimed.count !== 1) {
            throw new ConflictException(
              `Processo ${idProcesso} foi alterado por outra requisicao.`,
            );
          }

          return {
            version: current.partida_versao + 1,
            attempt: current.partida_tentativa + 1,
            marker,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException(
          'Ja existe outro processo em partida, execucao ou pausa.',
        );
      }
      throw error;
    }
  }

  private async assertNoMqttUpdateInProgress(
    tx: Prisma.TransactionClient,
    now: Date,
  ): Promise<MqttUpdateInterlockState> {
    const [mqttConfig] = await tx.$queryRaw<MqttUpdateInterlockState[]>`
      SELECT
        "id_mqtt_configuracao",
        "topico_status",
        "credenciais_atualizacao_bloqueada_ate"
      FROM "mqttconfiguracoes"
      WHERE "chave_configuracao" = 'MQTT_PRINCIPAL'
      FOR UPDATE
    `;

    if (!mqttConfig) {
      throw new ServiceUnavailableException(
        'Configuracao MQTT principal nao encontrada para iniciar o processo.',
      );
    }

    if (
      mqttConfig.credenciais_atualizacao_bloqueada_ate &&
      mqttConfig.credenciais_atualizacao_bloqueada_ate > now
    ) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PROCESS_START_BLOCKED_BY_MQTT_UPDATE',
        message:
          'O processo nao pode ser iniciado enquanto uma atualizacao ou operacao administrativa MQTT exclusiva esta em andamento.',
      });
    }

    return mqttConfig;
  }

  private async assertNoUnconfirmedEmergencyStop(
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const emergency = await tx.processos.findFirst({
      where: {
        parada_emergencia: true,
        status_encerramento_geral: {
          not: statusencerramentoprocesso.CONCLUIDO,
        },
      },
      select: {
        id_processo: true,
        status_encerramento_geral: true,
        encerramento_geral_ultimo_erro: true,
      },
      orderBy: { id_processo: 'asc' },
    });

    if (!emergency) {
      return;
    }

    throw new ConflictException({
      statusCode: 409,
      code: 'PROCESS_START_BLOCKED_BY_UNCONFIRMED_EMERGENCY_STOP',
      message:
        `Uma nova partida nao e permitida enquanto a parada de emergencia ` +
        `do processo ${emergency.id_processo} nao possuir confirmacao do ` +
        `latch e das saidas logicas do controlador.`,
      id_processo_bloqueante: emergency.id_processo,
      status_confirmacao: emergency.status_encerramento_geral,
      ultimo_erro: emergency.encerramento_geral_ultimo_erro,
    });
  }

  private async assertEmergencyLatchWasReset(
    tx: Prisma.TransactionClient,
    mqttConfig: MqttUpdateInterlockState,
  ): Promise<void> {
    const emergency = await tx.processos.findFirst({
      where: {
        parada_emergencia: true,
        status_encerramento_geral: statusencerramentoprocesso.CONCLUIDO,
        encerramento_geral_finalizado_em: { not: null },
      },
      select: {
        id_processo: true,
        status_encerramento_geral: true,
        encerramento_geral_finalizado_em: true,
      },
      orderBy: [
        { encerramento_geral_finalizado_em: 'desc' },
        { id_processo: 'desc' },
      ],
    });

    if (!emergency?.encerramento_geral_finalizado_em) {
      return;
    }

    const snapshot = await tx.mqttmensagens.findFirst({
      where: {
        id_mqtt_configuracao: mqttConfig.id_mqtt_configuracao,
        topico: mqttConfig.topico_status,
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
    });

    if (
      snapshot?.recebido_em &&
      isControllerEmergencyLatchResetSnapshot(snapshot.payload) &&
      isControllerStatusTimestampFresh({
        marker: emergency.encerramento_geral_finalizado_em,
        receivedAt: snapshot.recebido_em,
        statusAt: snapshot.enviado_em,
      })
    ) {
      return;
    }

    throw new ConflictException({
      statusCode: 409,
      code: 'PROCESS_START_BLOCKED_BY_EMERGENCY_LATCH_RESET_REQUIRED',
      message:
        `Uma nova partida exige um snapshot do controlador posterior a parada de ` +
        `emergencia do processo ${emergency.id_processo}, com o ESP32 ` +
        `online e o latch de emergencia desativado.`,
      id_processo_bloqueante: emergency.id_processo,
      status_confirmacao: emergency.status_encerramento_geral,
      encerramento_confirmado_em: emergency.encerramento_geral_finalizado_em,
      ultimo_status_hardware_em: snapshot?.recebido_em ?? null,
      ultimo_status_controlador_em: snapshot?.enviado_em ?? null,
    });
  }

  private async touchStage(
    idProcesso: number,
    expectedVersion: number,
    stage: ProcessoMqttStartupStage | 'CONFIRMANDO_TELEMETRIA',
  ): Promise<number> {
    const now = new Date();
    const updated = await this.prisma.processos.updateMany({
      where: {
        id_processo: idProcesso,
        status_partida: statuspartidaprocesso.EM_ANDAMENTO,
        partida_versao: expectedVersion,
      },
      data: {
        etapa_partida: etapapartidaprocesso[stage],
        partida_execucao_bloqueada_ate: new Date(
          now.getTime() + STARTUP_LEASE_MS,
        ),
        partida_comando_tentativas: { increment: 1 },
        partida_versao: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        `Partida ${idProcesso} perdeu a exclusao de execucao.`,
      );
    }
    return expectedVersion + 1;
  }

  private async rollbackOrScheduleRetry(input: {
    idProcesso: number;
    version: number;
    correlationPrefix: string;
    originalError: unknown;
  }): Promise<void> {
    let claimedVersion: number;
    try {
      claimedVersion = await this.claimRollback(
        input.idProcesso,
        input.version,
        input.originalError,
      );
    } catch (error) {
      const emergencyOwnsProcess = await this.isEmergencyStopPersisted(
        input.idProcesso,
      );
      if (!emergencyOwnsProcess) {
        throw error;
      }

      const emergencyRollback = await this.orchestrator.shutdownAllActuators(
        input.idProcesso,
        `${input.correlationPrefix}-emergency-race`,
      );
      if (!emergencyRollback.success) {
        throw new ServiceUnavailableException(
          `A parada de emergencia invalidou a partida, mas o rollback concorrente dos atuadores falhou: ${emergencyRollback.message}`,
        );
      }
      return;
    }
    const rollback = await this.orchestrator.shutdownAllActuators(
      input.idProcesso,
      input.correlationPrefix,
    );

    if (!rollback.success) {
      await this.scheduleRollbackRetry(
        input.idProcesso,
        claimedVersion,
        `${this.errorMessage(input.originalError)} Rollback: ${rollback.message}`,
      );
      throw new ServiceUnavailableException(
        `Partida falhou e a parada segura ainda nao foi confirmada: ${rollback.message}`,
      );
    }

    await this.finishFailedStartup(
      input.idProcesso,
      claimedVersion,
      this.errorMessage(input.originalError),
    );
  }

  private async isEmergencyStopPersisted(idProcesso: number): Promise<boolean> {
    const process = await this.prisma.processos.findUnique({
      where: { id_processo: idProcesso },
      select: {
        parada_emergencia: true,
        status_processo: true,
      },
    });

    return Boolean(
      process?.parada_emergencia &&
      process.status_processo === statusprocesso.INTERROMPIDO,
    );
  }

  private async claimRollback(
    idProcesso: number,
    expectedVersion: number,
    error: unknown,
  ): Promise<number> {
    const now = new Date();
    const claimed = await this.prisma.processos.updateMany({
      where: {
        id_processo: idProcesso,
        status_partida: statuspartidaprocesso.EM_ANDAMENTO,
        partida_versao: expectedVersion,
      },
      data: {
        etapa_partida: etapapartidaprocesso.EXECUTANDO_ROLLBACK,
        partida_ultimo_erro: this.errorMessage(error),
        partida_execucao_bloqueada_ate: new Date(
          now.getTime() + STARTUP_LEASE_MS,
        ),
        partida_versao: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw new ConflictException(
        `Rollback concorrente detectado na partida ${idProcesso}.`,
      );
    }
    return expectedVersion + 1;
  }

  private async finishFailedStartup(
    idProcesso: number,
    expectedVersion: number,
    error: string,
  ): Promise<void> {
    const completed = await this.prisma.processos.updateMany({
      where: {
        id_processo: idProcesso,
        status_partida: statuspartidaprocesso.EM_ANDAMENTO,
        partida_versao: expectedVersion,
      },
      data: {
        status_partida: statuspartidaprocesso.FALHA,
        etapa_partida: etapapartidaprocesso.FALHA,
        partida_finalizada_em: new Date(),
        partida_execucao_bloqueada_ate: null,
        partida_ultimo_erro: error,
        partida_versao: { increment: 1 },
      },
    });
    if (completed.count !== 1) {
      throw new ConflictException(
        `Falha ao finalizar rollback da partida ${idProcesso}.`,
      );
    }
  }

  private async scheduleRollbackRetry(
    idProcesso: number,
    expectedVersion: number,
    error: string,
  ): Promise<void> {
    await this.prisma.processos.updateMany({
      where: {
        id_processo: idProcesso,
        status_partida: statuspartidaprocesso.EM_ANDAMENTO,
        partida_versao: expectedVersion,
      },
      data: {
        etapa_partida: etapapartidaprocesso.EXECUTANDO_ROLLBACK,
        partida_ultimo_erro: error,
        partida_execucao_bloqueada_ate: new Date(
          Date.now() + RECOVERY_RETRY_MS,
        ),
        partida_versao: { increment: 1 },
      },
    });
  }

  private async waitForHardwareState(
    idProcesso: number,
    marker: Date,
    mode: 'SAFE' | 'RUNNING',
  ): Promise<void> {
    const deadline = Date.now() + HARDWARE_CONFIRMATION_TIMEOUT_MS;
    while (Date.now() <= deadline) {
      if (await this.hardwareStateMatches(idProcesso, marker, mode)) {
        return;
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, HARDWARE_POLL_INTERVAL_MS),
      );
    }

    throw new ServiceUnavailableException(
      mode === 'SAFE'
        ? 'Timeout aguardando telemetria nova de todas as valvulas fechadas e bombas desligadas.'
        : 'Timeout aguardando telemetria nova da partida fisica completa.',
    );
  }

  private async hardwareStateMatches(
    idProcesso: number,
    marker: Date,
    mode: 'SAFE' | 'RUNNING',
  ): Promise<boolean> {
    const process = await this.prisma.processos.findUnique({
      where: { id_processo: idProcesso },
      select: {
        processostanques: {
          select: { id_tanque: true },
        },
      },
    });
    if (!process || process.processostanques.length === 0) {
      return false;
    }
    const selectedTankIds = new Set(
      process.processostanques.map((tank) => tank.id_tanque),
    );
    const [valves, pumps] = await Promise.all([
      this.prisma.valvulas.findMany({
        where: {
          ativo: true,
          bombas: {
            tipo_bomba: {
              in: [tipobomba.PRINCIPAL, tipobomba.AUXILIAR],
            },
          },
        },
        select: {
          id_tanque: true,
          status_valvula: true,
          ultimo_acionamento: true,
          bombas: { select: { tipo_bomba: true } },
        },
      }),
      this.prisma.bombas.findMany({
        where: {
          tipo_bomba: { in: [tipobomba.PRINCIPAL, tipobomba.AUXILIAR] },
        },
        select: {
          tipo_bomba: true,
          ligada_hardware: true,
          ultimo_status_hardware_em: true,
        },
      }),
    ]);

    const freshValve = (date: Date | null) =>
      Boolean(date && date.getTime() >= marker.getTime());
    const freshPump = (date: Date | null) =>
      Boolean(date && date.getTime() >= marker.getTime());
    if (valves.length === 0 || pumps.length < 2) {
      return false;
    }
    if (mode === 'SAFE') {
      return (
        valves.every(
          (valve) =>
            valve.status_valvula === StatusValvula.FECHADA &&
            freshValve(valve.ultimo_acionamento),
        ) &&
        pumps.every(
          (pump) =>
            pump.ligada_hardware === false &&
            freshPump(pump.ultimo_status_hardware_em),
        )
      );
    }

    const selectedValves = valves.filter(
      (valve) =>
        valve.id_tanque !== null && selectedTankIds.has(valve.id_tanque),
    );
    const hasExpectedValves = [...selectedTankIds].every((idTank) => {
      const tankValves = selectedValves.filter(
        (valve) => valve.id_tanque === idTank,
      );
      const main = tankValves.filter(
        (valve) => valve.bombas.tipo_bomba === tipobomba.PRINCIPAL,
      );
      const auxiliary = tankValves.filter(
        (valve) => valve.bombas.tipo_bomba === tipobomba.AUXILIAR,
      );
      return (
        main.length === 1 &&
        auxiliary.length === 1 &&
        main[0].status_valvula === StatusValvula.ABERTA &&
        auxiliary[0].status_valvula === StatusValvula.FECHADA &&
        freshValve(main[0].ultimo_acionamento) &&
        freshValve(auxiliary[0].ultimo_acionamento)
      );
    });
    const mainPumps = pumps.filter(
      (pump) => pump.tipo_bomba === tipobomba.PRINCIPAL,
    );
    const auxiliaryPumps = pumps.filter(
      (pump) => pump.tipo_bomba === tipobomba.AUXILIAR,
    );

    return (
      hasExpectedValves &&
      mainPumps.length === 1 &&
      auxiliaryPumps.length === 1 &&
      mainPumps[0].ligada_hardware === true &&
      auxiliaryPumps[0].ligada_hardware === false &&
      freshPump(mainPumps[0].ultimo_status_hardware_em) &&
      freshPump(auxiliaryPumps[0].ultimo_status_hardware_em)
    );
  }

  private assertSuccess(result: ProcessoMqttOperationResult): void {
    if (!result.success) {
      throw new ServiceUnavailableException(result.message);
    }
  }

  private resolveUserId(user: CurrentUserPayload): number {
    const candidate = Number(user.sub);
    if (!Number.isInteger(candidate) || candidate <= 0) {
      throw new ConflictException('Usuario invalido para iniciar processo.');
    }
    return candidate;
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
