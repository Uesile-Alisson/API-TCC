import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  etapaencerramentoprocesso,
  etapaencerramentotanque,
  etapapartidaprocesso,
  faseprocesso,
  motivoresolucaoalarme,
  origemalarme,
  origemevento,
  Prisma,
  resultadooperacao,
  severidadealarme,
  severidadeevento,
  statusauxiliotanque,
  statusencerramentoprocesso,
  statusencerramentotanque,
  statusalarme,
  statuspartidaprocesso,
  statusprocesso,
  statussubsistemaauxiliar,
  statustanqueprocesso,
  StatusAcoplamentoMangueira,
  StatusValvula,
  tipoalarme,
  tipoeventoprocesso,
} from '@prisma/client';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import {
  CommandName,
  MQTT_COMMANDS,
} from '../../mqtt-hardware/commands/interfaces/command-name.interface';
import { CommandResult } from '../../mqtt-hardware/commands/interfaces/command-result.interface';
import {
  isControllerStatusTimestampFresh,
  MqttConfigService,
} from '../../mqtt-hardware/config/mqtt-config.service';
import { Esp32StatusDTO } from '../../mqtt-hardware/dto/esp32-status.dto';
import { MqttPayloadValidator } from '../../mqtt-hardware/validators/mqtt-payload.validator';
import { PrismaService } from '../../prisma/prisma.service';
import { IniciarEncerramentoGeralDTO } from '../dto';
import {
  CurrentUserPayload,
  ProcessoEncerramentoGeralState,
  ProcessoParadaEmergenciaState,
} from '../interfaces';
import { ProcessoLogService } from '../logs';
import {
  ProcessoMetricReading,
  ProcessoMetricsInput,
  ProcessoMetricsService,
} from '../metrics';
import {
  type ProcessoPersistAudit,
  ProcessosRepository,
} from '../processos.repository';
import { ProcessosSocketGateway } from '../socket';

const SCHEDULER_NAME = 'processo-encerramento-geral';
const STEP_LEASE_MS = 60_000;
const COMMAND_RETRY_DELAY_MS = 5_000;
const HARDWARE_CONFIRMATION_TIMEOUT_MS = 15_000;
const MAX_SAFE_STATE_ATTEMPTS = 3;
const EMERGENCY_CONFIRMATION_ALARM_TITLE =
  'Parada de emergencia sem confirmacao do controlador';
const LEGACY_EMERGENCY_CONFIRMATION_ALARM_TITLE =
  'Parada de emergencia sem confirmacao fisica';

export interface ProcessoParadaEmergenciaResult {
  state: ProcessoParadaEmergenciaState;
  previous_status: statusprocesso;
  command_results?: CommandResult[];
  command_failures?: Array<{ comando: CommandName; message: string }>;
  idempotent: boolean;
}

export interface ProcessoParadaEmergenciaDispatchResult {
  escopo: 'PROCESSO' | 'HARDWARE_GLOBAL';
  id_processo: number | null;
  persistencia_confirmada: boolean;
  confirmacao_controlador: 'PENDENTE' | 'CONFIRMADA' | 'NAO_CONFIRMADA';
  processo: ProcessoParadaEmergenciaResult | null;
  command_results: CommandResult[];
  command_failures: Array<{ comando: CommandName; message: string }>;
}

const GENERAL_CLOSURE_SELECT = Prisma.validator<Prisma.processosSelect>()({
  id_processo: true,
  id_usuario: true,
  status_processo: true,
  parada_emergencia: true,
  status_partida: true,
  etapa_partida: true,
  partida_execucao_bloqueada_ate: true,
  partida_ultimo_erro: true,
  partida_versao: true,
  fase_processo: true,
  iniciado_em: true,
  tempo_execucao: true,
  encerramento_automatico: true,
  encerramento_versao: true,
  status_encerramento_geral: true,
  etapa_encerramento_geral: true,
  encerramento_geral_iniciado_em: true,
  encerramento_geral_finalizado_em: true,
  encerramento_geral_confirmacao_iniciada_em: true,
  encerramento_geral_proxima_tentativa_em: true,
  encerramento_geral_tentativa: true,
  encerramento_geral_comando_tentativas: true,
  encerramento_geral_ultimo_erro: true,
  encerramento_geral_id_usuario: true,
  processostanques: {
    orderBy: { id_processo_tanque: 'asc' },
    select: {
      id_processo_tanque: true,
      id_tanque: true,
      status_tanque_processo: true,
      status_encerramento: true,
      etapa_encerramento: true,
      tanques: {
        select: {
          sensoresacoplamentomangueiras: {
            select: {
              ativo: true,
              sinal_detectado: true,
              status_acoplamento: true,
            },
          },
          valvulas: {
            where: { ativo: true },
            orderBy: { id_valvula: 'asc' },
            select: {
              id_valvula: true,
              status_valvula: true,
              ultimo_acionamento: true,
              bombas: {
                select: {
                  id_bomba: true,
                  ligada_hardware: true,
                  ultimo_status_hardware_em: true,
                },
              },
            },
          },
        },
      },
    },
  },
});

type GeneralClosureContext = Prisma.processosGetPayload<{
  select: typeof GENERAL_CLOSURE_SELECT;
}>;

@Injectable()
export class ProcessoGeneralClosureService {
  private readonly logger = new Logger(ProcessoGeneralClosureService.name);
  private readonly processQueues = new Map<number, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandService: CommandService,
    private readonly repository: ProcessosRepository,
    private readonly metricsService: ProcessoMetricsService,
    private readonly processoLogService: ProcessoLogService,
    private readonly socketGateway: ProcessosSocketGateway,
    private readonly mqttConfigService: MqttConfigService,
  ) {}

  @Cron(CronExpression.EVERY_SECOND, {
    name: SCHEDULER_NAME,
    waitForCompletion: true,
    disabled:
      process.env.NODE_ENV === 'test' ||
      process.env.GENERAL_CLOSURE_SCHEDULER_DISABLED === 'true',
  })
  runScheduledCycle(): Promise<void> {
    return this.runOnce();
  }

  async runOnce(evaluatedAt = new Date()): Promise<void> {
    const processes = await this.prisma.processos.findMany({
      where: {
        OR: [
          {
            status_processo: statusprocesso.EM_EXECUCAO,
            status_encerramento_geral: {
              not: statusencerramentoprocesso.CONCLUIDO,
            },
          },
          {
            status_processo: statusprocesso.INTERROMPIDO,
            parada_emergencia: true,
            status_encerramento_geral: {
              in: [
                statusencerramentoprocesso.INATIVO,
                statusencerramentoprocesso.ENCERRANDO,
                statusencerramentoprocesso.CONFIRMANDO_HARDWARE,
              ],
            },
          },
        ],
      },
      orderBy: { id_processo: 'asc' },
      select: { id_processo: true },
    });

    for (const process of processes) {
      await this.enqueueProcess(process.id_processo, () =>
        this.runProcessOnce(process.id_processo, evaluatedAt),
      );
    }
  }

  startManual(input: {
    id_processo: number;
    dto: IniciarEncerramentoGeralDTO;
    user: CurrentUserPayload;
  }) {
    return this.enqueueProcess(input.id_processo, async () => {
      const context = await this.findContext(input.id_processo);
      if (!context) {
        throw new NotFoundException('Processo nao encontrado.');
      }
      if (context.encerramento_versao !== input.dto.expected_version) {
        throw new ConflictException(
          'Versao do encerramento geral foi alterada por outra operacao.',
        );
      }
      this.assertCanStart(context);

      const started = await this.claimClosureStart(
        context,
        input.user.sub,
        new Date(),
      );
      if (!started) {
        throw new ConflictException(
          'O encerramento geral foi alterado por outra operacao.',
        );
      }

      await this.safeRegisterLog({
        id_processo: input.id_processo,
        id_usuario: input.user.sub,
        action: 'ENCERRAMENTO_GERAL_INICIADO',
        description: `Encerramento geral solicitado manualmente. Motivo: ${input.dto.motivo}`,
      });
      await this.emitGeneralUpdate(
        input.id_processo,
        context.status_encerramento_geral,
        'Encerramento geral iniciado; validando isolamento dos tanques.',
      );

      return {
        success: true as const,
        message: 'Encerramento geral iniciado com sucesso.',
        id_processo: input.id_processo,
        encerramento: await this.getState(input.id_processo),
      };
    });
  }

  async getState(idProcesso: number): Promise<ProcessoEncerramentoGeralState> {
    const context = await this.findContext(idProcesso);
    if (!context) {
      throw new NotFoundException('Processo nao encontrado.');
    }
    return this.buildState(context);
  }

  async requestEmergencyStopForCurrent(input: {
    id_processo?: number;
    motivo: string;
    id_usuario: number | null;
    persistAudit?: ProcessoPersistAudit;
  }): Promise<ProcessoParadaEmergenciaDispatchResult> {
    const idProcesso =
      input.id_processo ??
      (await this.repository.findEmergencyTargetProcessId());

    if (idProcesso !== null) {
      const processResult = await this.requestEmergencyStop({
        id_processo: idProcesso,
        motivo: input.motivo,
        id_usuario: input.id_usuario,
        ...(input.persistAudit ? { persistAudit: input.persistAudit } : {}),
      });

      return {
        escopo: 'PROCESSO',
        id_processo: idProcesso,
        persistencia_confirmada: true,
        confirmacao_controlador: processResult.state.hardware_confirmado
          ? 'CONFIRMADA'
          : 'PENDENTE',
        processo: processResult,
        command_results: processResult.command_results ?? [],
        command_failures: processResult.command_failures ?? [],
      };
    }

    const outcome = await this.dispatchEmergencyCommands({
      id_processo: null,
      id_usuario: input.id_usuario,
      motivo: input.motivo,
      correlationPrefix: `hardware-global-emergency-${Date.now()}`,
    });

    return {
      escopo: 'HARDWARE_GLOBAL',
      id_processo: null,
      persistencia_confirmada: false,
      confirmacao_controlador: 'NAO_CONFIRMADA',
      processo: null,
      command_results: outcome.results,
      command_failures: outcome.failures,
    };
  }

  async reconcileControllerEmergency(input: {
    motivo: string;
  }): Promise<ProcessoParadaEmergenciaResult | null> {
    const idProcesso = await this.repository.findEmergencyTargetProcessId();
    if (idProcesso === null) {
      return null;
    }

    return await this.requestEmergencyStop({
      id_processo: idProcesso,
      motivo: input.motivo,
      id_usuario: null,
    });
  }

  requestEmergencyStop(input: {
    id_processo: number;
    motivo: string;
    id_usuario: number | null;
    persistAudit?: ProcessoPersistAudit;
  }): Promise<ProcessoParadaEmergenciaResult> {
    return this.enqueueProcess(input.id_processo, async () => {
      const requestedAt = new Date();
      let claim: Awaited<ReturnType<typeof this.claimEmergencyStop>>;
      try {
        claim = await this.claimEmergencyStop(input, requestedAt);
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }

        const fallback = await this.dispatchEmergencyCommands({
          id_processo: input.id_processo,
          id_usuario: input.id_usuario,
          motivo: input.motivo,
          correlationPrefix:
            `process-emergency-p${input.id_processo}` +
            `-persistence-fallback-${requestedAt.getTime()}`,
        });

        throw new ServiceUnavailableException({
          statusCode: 503,
          code: 'EMERGENCY_STOP_PERSISTENCE_UNAVAILABLE',
          message:
            'A API nao confirmou a persistencia da parada, mas tentou os tres comandos fisicos de estado seguro de forma best-effort.',
          id_processo: input.id_processo,
          persistencia_confirmada: false,
          confirmacao_controlador: 'DESCONHECIDA',
          erro_persistencia: this.errorMessage(error),
          command_results: fallback.results,
          command_failures: fallback.failures,
        });
      }

      if (claim.idempotent) {
        return {
          state: this.buildEmergencyState(claim.context),
          previous_status: claim.previousStatus,
          idempotent: true,
        };
      }

      const commandOutcome = await this.executeEmergencyCommandSequence(
        claim.context,
        input.motivo,
        false,
      );
      await this.safeRegisterLog({
        id_processo: input.id_processo,
        id_usuario: input.id_usuario ?? undefined,
        action: 'PARADA_EMERGENCIA_ACIONADA',
        description:
          'Parada de emergencia persistida antes dos comandos; sequencia enviada e confirmacao do controlador pendente.',
      });
      await this.emitEmergencyUpdate(
        input.id_processo,
        'Parada registrada e comandos de estado seguro enviados; aguardando confirmacao do controlador.',
      );
      const context =
        (await this.findContext(input.id_processo)) ?? claim.context;

      return {
        state: this.buildEmergencyState(context),
        previous_status: claim.previousStatus,
        command_results: commandOutcome.results,
        command_failures: commandOutcome.failures,
        idempotent: false,
      };
    });
  }

  async getEmergencyState(
    idProcesso: number,
  ): Promise<ProcessoParadaEmergenciaState> {
    const context = await this.findContext(idProcesso);
    if (!context) {
      throw new NotFoundException('Processo nao encontrado.');
    }
    return this.buildEmergencyState(context);
  }

  private async runProcessOnce(
    idProcesso: number,
    evaluatedAt: Date,
  ): Promise<void> {
    const context = await this.findContext(idProcesso);
    if (!context) {
      return;
    }

    if (
      context.parada_emergencia &&
      context.status_processo === statusprocesso.INTERROMPIDO
    ) {
      await this.runEmergencyOnce(context, evaluatedAt);
      return;
    }

    if (context.status_processo !== statusprocesso.EM_EXECUCAO) {
      return;
    }

    const allTanksCompleted = this.allTanksCompleted(context);
    if (!allTanksCompleted) {
      if (
        context.status_encerramento_geral ===
          statusencerramentoprocesso.ENCERRANDO ||
        context.status_encerramento_geral ===
          statusencerramentoprocesso.CONFIRMANDO_HARDWARE
      ) {
        await this.markFailure(
          context,
          'Um tanque deixou de estar concluido durante o encerramento geral.',
        );
        return;
      }
      await this.markWaitingForTanks(context);
      return;
    }

    if (!this.allHosesCoupled(context)) {
      await this.markFailure(
        context,
        'Mangueira desacoplada ou sem confirmacao fisica antes da liberacao final.',
      );
      return;
    }

    if (
      context.status_encerramento_geral ===
        statusencerramentoprocesso.INATIVO ||
      context.status_encerramento_geral ===
        statusencerramentoprocesso.AGUARDANDO_TANQUES
    ) {
      if (!context.encerramento_automatico) {
        await this.markWaitingForManualAction(context);
        return;
      }

      const started = await this.claimClosureStart(context, null, evaluatedAt);
      if (started) {
        await this.safeRegisterLog({
          id_processo: idProcesso,
          action: 'ENCERRAMENTO_GERAL_INICIADO',
          description:
            'Todos os tanques concluiram isolamento e retencao; encerramento geral automatico iniciado.',
        });
        await this.emitGeneralUpdate(
          idProcesso,
          context.status_encerramento_geral,
          'Todos os tanques concluidos; encerramento geral automatico iniciado.',
        );
      }
      return;
    }

    if (
      context.status_encerramento_geral ===
        statusencerramentoprocesso.AGUARDANDO_ACAO_MANUAL ||
      context.status_encerramento_geral === statusencerramentoprocesso.FALHA
    ) {
      return;
    }

    if (
      context.encerramento_geral_proxima_tentativa_em &&
      context.encerramento_geral_proxima_tentativa_em.getTime() >
        evaluatedAt.getTime()
    ) {
      return;
    }

    await this.advance(context, evaluatedAt);
  }

  private async advance(
    context: GeneralClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    switch (context.etapa_encerramento_geral) {
      case etapaencerramentoprocesso.VALIDANDO_ISOLAMENTO:
        await this.validateIsolation(context, evaluatedAt);
        return;
      case etapaencerramentoprocesso.CONFIRMANDO_ISOLAMENTO:
        await this.executeSafeCommand(
          context,
          evaluatedAt,
          etapaencerramentoprocesso.DESLIGANDO_BOMBAS,
          'Fechamento de todas as valvulas para confirmar isolamento antes de desligar as bombas.',
          (correlationId) =>
            this.commandService.fecharTodasValvulas(
              this.commandOptions(context, correlationId),
            ),
        );
        return;
      case etapaencerramentoprocesso.DESLIGANDO_BOMBAS:
        await this.executeSafeCommand(
          context,
          evaluatedAt,
          etapaencerramentoprocesso.RECONFIRMANDO_VALVULAS,
          'Desligamento de todas as bombas apos isolamento dos tanques.',
          (correlationId) =>
            this.commandService.desligarTodasBombas(
              this.commandOptions(context, correlationId),
            ),
        );
        return;
      case etapaencerramentoprocesso.RECONFIRMANDO_VALVULAS:
        await this.executeSafeCommand(
          context,
          evaluatedAt,
          etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA,
          'Reconfirmacao final de todas as valvulas fechadas.',
          (correlationId) =>
            this.commandService.fecharTodasValvulas(
              this.commandOptions(context, correlationId),
            ),
          statusencerramentoprocesso.CONFIRMANDO_HARDWARE,
        );
        return;
      case etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA:
        await this.confirmHardware(context, evaluatedAt);
        return;
      default:
        return;
    }
  }

  private async validateIsolation(
    context: GeneralClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    if (!this.allTanksCompleted(context) || !this.allHosesCoupled(context)) {
      await this.markFailure(
        context,
        'Evidencias de isolamento, retencao ou acoplamento deixaram de ser validas.',
      );
      return;
    }

    const updated = await this.prisma.processos.updateMany({
      where: {
        id_processo: context.id_processo,
        encerramento_versao: context.encerramento_versao,
        etapa_encerramento_geral:
          etapaencerramentoprocesso.VALIDANDO_ISOLAMENTO,
        status_processo: statusprocesso.EM_EXECUCAO,
      },
      data: {
        etapa_encerramento_geral:
          etapaencerramentoprocesso.CONFIRMANDO_ISOLAMENTO,
        encerramento_geral_confirmacao_iniciada_em: evaluatedAt,
        encerramento_geral_proxima_tentativa_em: null,
        encerramento_geral_ultimo_erro: null,
        encerramento_versao: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      await this.emitGeneralUpdate(
        context.id_processo,
        context.status_encerramento_geral,
        'Isolamento individual validado; confirmando todas as valvulas fechadas.',
      );
    }
  }

  private async executeSafeCommand(
    context: GeneralClosureContext,
    evaluatedAt: Date,
    nextStage: etapaencerramentoprocesso,
    description: string,
    execute: (correlationId: string) => Promise<CommandResult>,
    nextStatus: statusencerramentoprocesso = statusencerramentoprocesso.ENCERRANDO,
  ): Promise<void> {
    const claimed = await this.claimStep(context, evaluatedAt);
    if (!claimed) {
      return;
    }

    const correlationId = this.correlationId(claimed);
    try {
      const command = await execute(correlationId);
      const updated = await this.prisma.processos.updateMany({
        where: {
          id_processo: claimed.id_processo,
          encerramento_versao: claimed.encerramento_versao,
          etapa_encerramento_geral: claimed.etapa_encerramento_geral,
          status_processo: statusprocesso.EM_EXECUCAO,
        },
        data: {
          status_encerramento_geral: nextStatus,
          etapa_encerramento_geral: nextStage,
          encerramento_geral_comando_tentativas: 0,
          encerramento_geral_proxima_tentativa_em: null,
          encerramento_geral_ultimo_erro: null,
          encerramento_versao: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'ACK confirmado, mas o estado persistido do encerramento mudou.',
        );
      }

      await this.safeRegisterLog({
        id_processo: claimed.id_processo,
        action: 'ENCERRAMENTO_GERAL_COMANDO_CONFIRMADO',
        description: `${description} ACK ${command.correlation_id}.`,
      });
      await this.emitGeneralUpdate(
        claimed.id_processo,
        claimed.status_encerramento_geral,
        description,
      );
    } catch (error) {
      await this.recordSafeCommandFailure(
        claimed,
        `${description} ${this.errorMessage(error)}`,
        evaluatedAt,
      );
    }
  }

  private async confirmHardware(
    context: GeneralClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    if (!this.allHosesCoupled(context)) {
      await this.markFailure(
        context,
        'Mangueira desacoplada durante a confirmacao final do hardware.',
      );
      return;
    }

    if (this.isHardwareSafeAndFresh(context)) {
      await this.completeProcess(context, evaluatedAt);
      return;
    }

    const confirmationStarted =
      context.encerramento_geral_confirmacao_iniciada_em ?? evaluatedAt;
    if (
      evaluatedAt.getTime() - confirmationStarted.getTime() <
      HARDWARE_CONFIRMATION_TIMEOUT_MS
    ) {
      return;
    }

    const attempts = context.encerramento_geral_comando_tentativas + 1;
    if (attempts >= MAX_SAFE_STATE_ATTEMPTS) {
      await this.markFailure(
        context,
        'ACKs recebidos, mas a telemetria nao confirmou bombas desligadas e valvulas fechadas.',
      );
      return;
    }

    const updated = await this.prisma.processos.updateMany({
      where: {
        id_processo: context.id_processo,
        encerramento_versao: context.encerramento_versao,
        etapa_encerramento_geral:
          etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA,
      },
      data: {
        status_encerramento_geral: statusencerramentoprocesso.ENCERRANDO,
        etapa_encerramento_geral:
          etapaencerramentoprocesso.CONFIRMANDO_ISOLAMENTO,
        encerramento_geral_comando_tentativas: attempts,
        encerramento_geral_tentativa: { increment: 1 },
        encerramento_geral_confirmacao_iniciada_em: evaluatedAt,
        encerramento_geral_proxima_tentativa_em: new Date(
          evaluatedAt.getTime() + COMMAND_RETRY_DELAY_MS,
        ),
        encerramento_geral_ultimo_erro:
          'Telemetria final ausente, vencida ou em estado inseguro; repetindo sequencia segura.',
        encerramento_versao: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      await this.emitGeneralUpdate(
        context.id_processo,
        context.status_encerramento_geral,
        'Telemetria final ainda nao confirmou o estado seguro; sequencia sera repetida.',
      );
    }
  }

  private async completeProcess(
    context: GeneralClosureContext,
    completedAt: Date,
  ): Promise<void> {
    const metrics = await this.calculateMetrics(context, completedAt);
    const completed = await this.prisma.$transaction(async (tx) => {
      const process = await tx.processos.updateMany({
        where: {
          id_processo: context.id_processo,
          encerramento_versao: context.encerramento_versao,
          status_processo: statusprocesso.EM_EXECUCAO,
          etapa_encerramento_geral:
            etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA,
        },
        data: {
          status_processo: statusprocesso.CONCLUIDO,
          fase_processo: faseprocesso.FINALIZADO,
          finalizado_em: completedAt,
          tempo_execucao: metrics.tempo_execucao,
          vacuo_inicial: metrics.vacuo_inicial,
          vacuo_final: metrics.vacuo_final,
          vacuo_medio: metrics.vacuo_medio,
          eficiencia: metrics.eficiencia,
          status_encerramento_geral: statusencerramentoprocesso.CONCLUIDO,
          etapa_encerramento_geral: etapaencerramentoprocesso.CONCLUIDA,
          encerramento_geral_finalizado_em: completedAt,
          encerramento_geral_proxima_tentativa_em: null,
          encerramento_geral_ultimo_erro: null,
          encerramento_versao: { increment: 1 },
        },
      });
      if (process.count !== 1) {
        return false;
      }

      await tx.processosauxiliares.updateMany({
        where: { id_processo: context.id_processo },
        data: {
          status_subsistema: statussubsistemaauxiliar.INATIVO,
          id_processo_tanque_atual: null,
          id_usuario_controle_bomba: null,
          controle_bomba_assumido_em: null,
          controle_bomba_expira_em: null,
          motivo_bloqueio: null,
          ultimo_erro: null,
          atualizado_em: completedAt,
          versao: { increment: 1 },
        },
      });
      await tx.processostanquesauxiliares.updateMany({
        where: { processostanques: { id_processo: context.id_processo } },
        data: {
          status_auxilio: statusauxiliotanque.INATIVO,
          id_usuario_controle_valvula: null,
          controle_valvula_assumido_em: null,
          controle_valvula_expira_em: null,
          motivo_bloqueio: null,
          ultimo_erro: null,
          atualizado_em: completedAt,
          versao: { increment: 1 },
        },
      });
      await tx.eventos.create({
        data: {
          id_processo: context.id_processo,
          tipo_evento: tipoeventoprocesso.PROCESSO_CONCLUIDO,
          origem_evento: context.encerramento_geral_id_usuario
            ? origemevento.USUARIO
            : origemevento.SISTEMA,
          severidade_evento: severidadeevento.INFO,
        },
      });
      return true;
    });

    if (!completed) {
      return;
    }

    await this.safeRegisterLog({
      id_processo: context.id_processo,
      id_usuario: context.encerramento_geral_id_usuario ?? undefined,
      action: 'PROCESSO_CONCLUIDO',
      description:
        'Encerramento geral concluido: todos os tanques isolados, bombas desligadas e valvulas fechadas com telemetria confirmada.',
    });
    await this.emitGeneralUpdate(
      context.id_processo,
      context.status_encerramento_geral,
      'Hardware em estado seguro confirmado; processo concluido.',
    );
    this.socketGateway.emitProcessFinished({
      id_processo: context.id_processo,
      status_processo: statusprocesso.CONCLUIDO,
      message:
        'Processo concluido com bombas desligadas e valvulas fechadas confirmadas.',
      emitted_at: completedAt,
    });
    this.socketGateway.emitMetricsUpdated({
      id_processo: context.id_processo,
      metrics,
      emitted_at: completedAt,
    });
    this.socketGateway.emitStatusChanged({
      id_processo: context.id_processo,
      previous_status: statusprocesso.EM_EXECUCAO,
      status_processo: statusprocesso.CONCLUIDO,
      message: 'Status do processo alterado para concluido.',
      emitted_at: completedAt,
    });
  }

  private async claimEmergencyStop(
    input: {
      id_processo: number;
      motivo: string;
      id_usuario: number | null;
      persistAudit?: ProcessoPersistAudit;
    },
    requestedAt: Date,
  ): Promise<{
    context: GeneralClosureContext;
    previousStatus: statusprocesso;
    idempotent: boolean;
  }> {
    return await this.executeSerializable(async (tx) => {
      await this.lockMainMqttConfiguration(tx);
      const current = await tx.processos.findUnique({
        where: { id_processo: input.id_processo },
        select: GENERAL_CLOSURE_SELECT,
      });
      if (!current) {
        throw new NotFoundException('Processo nao encontrado.');
      }
      const previousStatus = current.status_processo;

      if (
        current.parada_emergencia &&
        current.status_processo === statusprocesso.INTERROMPIDO &&
        current.status_encerramento_geral ===
          statusencerramentoprocesso.CONCLUIDO
      ) {
        return {
          context: current,
          previousStatus,
          idempotent: true,
        };
      }

      const isEmergencyRetry =
        current.parada_emergencia &&
        current.status_processo === statusprocesso.INTERROMPIDO;
      const pendingEmergency =
        isEmergencyRetry &&
        new Set<statusencerramentoprocesso>([
          statusencerramentoprocesso.ENCERRANDO,
          statusencerramentoprocesso.CONFIRMANDO_HARDWARE,
        ]).has(current.status_encerramento_geral);
      if (
        pendingEmergency &&
        current.encerramento_geral_proxima_tentativa_em &&
        current.encerramento_geral_proxima_tentativa_em.getTime() >
          requestedAt.getTime()
      ) {
        return {
          context: current,
          previousStatus,
          idempotent: true,
        };
      }

      if (current.status_processo === statusprocesso.CONCLUIDO) {
        throw new ConflictException(
          'Processo concluido nao pode receber parada de emergencia.',
        );
      }

      const updated = await tx.processos.updateMany({
        where: {
          id_processo: current.id_processo,
          status_processo: current.status_processo,
          parada_emergencia: current.parada_emergencia,
          status_encerramento_geral: current.status_encerramento_geral,
          encerramento_versao: current.encerramento_versao,
        },
        data: {
          status_processo: statusprocesso.INTERROMPIDO,
          parada_emergencia: true,
          finalizado_em: requestedAt,
          status_encerramento_geral: statusencerramentoprocesso.ENCERRANDO,
          etapa_encerramento_geral:
            etapaencerramentoprocesso.CONFIRMANDO_ISOLAMENTO,
          encerramento_geral_iniciado_em: isEmergencyRetry
            ? (current.encerramento_geral_iniciado_em ?? requestedAt)
            : requestedAt,
          encerramento_geral_finalizado_em: null,
          encerramento_geral_confirmacao_iniciada_em: requestedAt,
          encerramento_geral_proxima_tentativa_em: requestedAt,
          encerramento_geral_tentativa: { increment: 1 },
          encerramento_geral_comando_tentativas: 0,
          encerramento_geral_ultimo_erro: null,
          encerramento_geral_id_usuario: input.id_usuario,
          encerramento_versao: { increment: 1 },
          ...(current.status_partida === statuspartidaprocesso.EM_ANDAMENTO
            ? {
                status_partida: statuspartidaprocesso.FALHA,
                etapa_partida: etapapartidaprocesso.FALHA,
                partida_execucao_bloqueada_ate: null,
                partida_ultimo_erro:
                  'Partida invalidada por parada de emergencia.',
                partida_versao: { increment: 1 },
              }
            : {}),
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'O processo foi alterado por outra requisicao de parada de emergencia.',
        );
      }

      await tx.processostanques.updateMany({
        where: { id_processo: current.id_processo },
        data: {
          status_tanque_processo: statustanqueprocesso.INTERROMPIDO,
          finalizado_em: requestedAt,
          status_encerramento: statusencerramentotanque.BLOQUEADO,
          etapa_encerramento: etapaencerramentotanque.NENHUMA,
          motivo_bloqueio_encerramento:
            'Parada de emergencia: hardware ainda nao confirmado.',
          encerramento_proxima_tentativa_em: null,
          encerramento_versao: { increment: 1 },
        },
      });
      await tx.alarmes.updateMany({
        where: {
          id_processo: current.id_processo,
          tipo_alarme: tipoalarme.ESTAGNACAO,
          status_alarme: statusalarme.ATIVO,
          resolvido_em: null,
          excluido_em: null,
        },
        data: {
          status_alarme: statusalarme.NORMALIZADO,
          normalizado_em: requestedAt,
          motivo_resolucao: motivoresolucaoalarme.FECHAMENTO_POS_PROCESSO,
        },
      });
      await tx.processosauxiliares.updateMany({
        where: { id_processo: current.id_processo },
        data: {
          status_subsistema: statussubsistemaauxiliar.BLOQUEADO,
          id_processo_tanque_atual: null,
          id_usuario_controle_bomba: null,
          controle_bomba_assumido_em: null,
          controle_bomba_expira_em: null,
          motivo_bloqueio:
            'Parada de emergencia: hardware ainda nao confirmado.',
          atualizado_em: requestedAt,
          versao: { increment: 1 },
        },
      });
      await tx.processostanquesauxiliares.updateMany({
        where: { processostanques: { id_processo: current.id_processo } },
        data: {
          status_auxilio: statusauxiliotanque.BLOQUEADO,
          id_usuario_controle_valvula: null,
          controle_valvula_assumido_em: null,
          controle_valvula_expira_em: null,
          motivo_bloqueio:
            'Parada de emergencia: hardware ainda nao confirmado.',
          atualizado_em: requestedAt,
          versao: { increment: 1 },
        },
      });

      await input.persistAudit?.(tx, current.id_processo);

      const claimed = await tx.processos.findUnique({
        where: { id_processo: current.id_processo },
        select: GENERAL_CLOSURE_SELECT,
      });
      if (!claimed) {
        throw new NotFoundException('Processo nao encontrado apos a parada.');
      }
      return {
        context: claimed,
        previousStatus,
        idempotent: false,
      };
    });
  }

  private async runEmergencyOnce(
    context: GeneralClosureContext,
    evaluatedAt: Date,
  ): Promise<void> {
    if (
      context.status_encerramento_geral ===
        statusencerramentoprocesso.CONCLUIDO ||
      context.status_encerramento_geral === statusencerramentoprocesso.FALHA
    ) {
      return;
    }

    if (
      context.status_encerramento_geral ===
        statusencerramentoprocesso.CONFIRMANDO_HARDWARE &&
      context.etapa_encerramento_geral ===
        etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA
    ) {
      const confirmation = await this.inspectGlobalHardware(
        context.encerramento_geral_confirmacao_iniciada_em,
      );
      if (confirmation.safe) {
        await this.confirmEmergencyHardware(context, evaluatedAt);
        return;
      }

      if (
        context.encerramento_geral_proxima_tentativa_em &&
        context.encerramento_geral_proxima_tentativa_em.getTime() >
          evaluatedAt.getTime()
      ) {
        return;
      }

      if (
        context.encerramento_geral_comando_tentativas >= MAX_SAFE_STATE_ATTEMPTS
      ) {
        await this.markEmergencyFailure(
          context,
          `Telemetria global nao confirmou o estado seguro apos ${MAX_SAFE_STATE_ATTEMPTS} sequencias. ${confirmation.reason}`,
        );
        return;
      }
    } else if (
      context.encerramento_geral_proxima_tentativa_em &&
      context.encerramento_geral_proxima_tentativa_em.getTime() >
        evaluatedAt.getTime()
    ) {
      return;
    }

    const claimed = await this.claimEmergencySequence(context, evaluatedAt);
    if (!claimed) {
      return;
    }
    await this.executeEmergencyCommandSequence(
      claimed,
      'Recuperacao persistente da parada de emergencia.',
    );
  }

  private async claimEmergencySequence(
    context: GeneralClosureContext,
    evaluatedAt: Date,
  ): Promise<GeneralClosureContext | null> {
    const updated = await this.prisma.processos.updateMany({
      where: {
        id_processo: context.id_processo,
        status_processo: statusprocesso.INTERROMPIDO,
        parada_emergencia: true,
        encerramento_versao: context.encerramento_versao,
        status_encerramento_geral: context.status_encerramento_geral,
        etapa_encerramento_geral: context.etapa_encerramento_geral,
        OR: [
          { encerramento_geral_proxima_tentativa_em: null },
          { encerramento_geral_proxima_tentativa_em: { lte: evaluatedAt } },
        ],
      },
      data: {
        status_encerramento_geral: statusencerramentoprocesso.ENCERRANDO,
        etapa_encerramento_geral:
          etapaencerramentoprocesso.CONFIRMANDO_ISOLAMENTO,
        encerramento_geral_confirmacao_iniciada_em: evaluatedAt,
        encerramento_geral_proxima_tentativa_em: evaluatedAt,
        encerramento_versao: { increment: 1 },
      },
    });
    return updated.count === 1 ? this.findContext(context.id_processo) : null;
  }

  private async executeEmergencyCommandSequence(
    context: GeneralClosureContext,
    motivo: string,
    emitUpdate = true,
  ): Promise<{
    results: CommandResult[];
    failures: Array<{ comando: CommandName; message: string }>;
  }> {
    const sequenceAttempt = context.encerramento_geral_comando_tentativas + 1;
    const correlationPrefix =
      `process-emergency-p${context.id_processo}` +
      `-r${context.encerramento_geral_tentativa}` +
      `-c${sequenceAttempt}`;
    const { results, failures } = await this.dispatchEmergencyCommands({
      id_processo: context.id_processo,
      id_usuario: context.encerramento_geral_id_usuario,
      motivo,
      correlationPrefix,
    });
    const confirmationStartedAt = new Date();

    const failureMessage =
      failures.length === 0
        ? null
        : `ACKs ausentes ou recusados: ${failures
            .map((failure) => `${failure.comando}: ${failure.message}`)
            .join('; ')}`;
    const updated = await this.prisma.processos.updateMany({
      where: {
        id_processo: context.id_processo,
        status_processo: statusprocesso.INTERROMPIDO,
        parada_emergencia: true,
        encerramento_versao: context.encerramento_versao,
        status_encerramento_geral: statusencerramentoprocesso.ENCERRANDO,
        etapa_encerramento_geral:
          etapaencerramentoprocesso.CONFIRMANDO_ISOLAMENTO,
      },
      data: {
        status_encerramento_geral:
          statusencerramentoprocesso.CONFIRMANDO_HARDWARE,
        etapa_encerramento_geral:
          etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA,
        encerramento_geral_confirmacao_iniciada_em: confirmationStartedAt,
        encerramento_geral_comando_tentativas: sequenceAttempt,
        encerramento_geral_proxima_tentativa_em: new Date(
          confirmationStartedAt.getTime() + HARDWARE_CONFIRMATION_TIMEOUT_MS,
        ),
        encerramento_geral_ultimo_erro: failureMessage,
        encerramento_versao: { increment: 1 },
      },
    });

    if (updated.count === 1) {
      await this.safeRegisterLog({
        id_processo: context.id_processo,
        id_usuario: context.encerramento_geral_id_usuario ?? undefined,
        action: 'PARADA_EMERGENCIA_COMANDOS_ENVIADOS',
        description:
          failures.length === 0
            ? `Sequencia ${sequenceAttempt}/${MAX_SAFE_STATE_ATTEMPTS} recebeu os tres ACKs; aguardando telemetria global.`
            : `Sequencia ${sequenceAttempt}/${MAX_SAFE_STATE_ATTEMPTS} concluida com falhas independentes; aguardando telemetria global. ${failureMessage}`,
        result:
          failures.length === 0
            ? resultadooperacao.SUCESSO
            : resultadooperacao.FALHA,
      });
      if (emitUpdate) {
        await this.emitEmergencyUpdate(
          context.id_processo,
          failures.length === 0
            ? 'Comandos confirmados por ACK; aguardando snapshot integral do controlador.'
            : 'Sequencia enviada com falhas de ACK; aguardando snapshot integral do controlador.',
        );
      }
    }

    return { results, failures };
  }

  private async dispatchEmergencyCommands(input: {
    id_processo: number | null;
    id_usuario: number | null;
    motivo: string;
    correlationPrefix: string;
  }): Promise<{
    results: CommandResult[];
    failures: Array<{ comando: CommandName; message: string }>;
  }> {
    const commonOptions = {
      ...(input.id_processo !== null ? { id_processo: input.id_processo } : {}),
      solicitado_por: input.id_usuario,
      motivo: input.motivo,
    };
    const settle = async (
      name: CommandName,
      execute: () => Promise<CommandResult>,
    ) => {
      try {
        return { name, result: await execute(), error: null };
      } catch (error) {
        return {
          name,
          result: null,
          error: this.errorMessage(error),
        };
      }
    };

    // PARADA_EMERGENCIA e retirada de energia das bombas saem imediatamente.
    // O fechamento e sempre tentado, mas somente depois do desligamento das
    // bombas, porque o firmware recusa isolamento com bomba energizada.
    const firstStage = await Promise.all([
      settle(MQTT_COMMANDS.PARADA_EMERGENCIA, () =>
        this.commandService.paradaEmergencia({
          ...commonOptions,
          correlation_id: `${input.correlationPrefix}-parada-emergencia`,
        }),
      ),
      settle(MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS, () =>
        this.commandService.desligarTodasBombas({
          ...commonOptions,
          correlation_id: `${input.correlationPrefix}-desligar-todas-bombas`,
        }),
      ),
    ]);
    const closeStage = await settle(MQTT_COMMANDS.FECHAR_TODAS_VALVULAS, () =>
      this.commandService.fecharTodasValvulas({
        ...commonOptions,
        correlation_id: `${input.correlationPrefix}-fechar-todas-valvulas`,
      }),
    );
    const settled = [...firstStage, closeStage];

    return {
      results: settled.flatMap(({ result }) => (result ? [result] : [])),
      failures: settled.flatMap(({ name, error }) =>
        error ? [{ comando: name, message: error }] : [],
      ),
    };
  }

  private async inspectGlobalHardware(marker: Date | null): Promise<{
    safe: boolean;
    reason: string;
  }> {
    if (!marker) {
      return { safe: false, reason: 'Marcador temporal ausente.' };
    }

    try {
      const [pumps, valves, snapshot] = await Promise.all([
        this.prisma.bombas.findMany({
          select: {
            id_bomba: true,
            codigo_hardware: true,
          },
        }),
        this.prisma.valvulas.findMany({
          where: { ativo: true },
          select: {
            id_valvula: true,
            codigo_hardware: true,
          },
        }),
        this.mqttConfigService.findLatestHardwareStatusSnapshotAfter(marker),
      ]);

      if (pumps.length === 0 || valves.length === 0) {
        return {
          safe: false,
          reason: 'Inventario global de bombas ou valvulas ativas esta vazio.',
        };
      }

      if (!snapshot) {
        return {
          safe: false,
          reason:
            'Nenhum snapshot HARDWARE_STATUS nao retido foi recebido depois do marcador.',
        };
      }

      if (snapshot.receivedAt.getTime() <= marker.getTime()) {
        return {
          safe: false,
          reason:
            'O snapshot HARDWARE_STATUS nao e estritamente posterior ao marcador.',
        };
      }

      if (
        !isControllerStatusTimestampFresh({
          marker,
          receivedAt: snapshot.receivedAt,
          statusAt: snapshot.statusAt,
        })
      ) {
        return {
          safe: false,
          reason:
            'O horario enviado pelo controlador e ausente, anterior a sequencia atual ou futuro demais para esta observacao.',
        };
      }

      if (
        typeof snapshot.payload !== 'object' ||
        snapshot.payload === null ||
        Array.isArray(snapshot.payload)
      ) {
        return { safe: false, reason: 'Snapshot HARDWARE_STATUS invalido.' };
      }

      let status: Esp32StatusDTO;
      try {
        status = MqttPayloadValidator.validateStatus(snapshot.payload);
      } catch (error) {
        return {
          safe: false,
          reason: `Snapshot HARDWARE_STATUS rejeitado: ${this.errorMessage(error)}`,
        };
      }

      if (status.esp32_on !== true) {
        return { safe: false, reason: 'ESP32 nao confirmou estado online.' };
      }
      if (
        status.tipo !== 'HARDWARE_STATUS' ||
        status.schema_version !== 2 ||
        typeof status.device_id !== 'string' ||
        status.device_id.trim().length === 0
      ) {
        return {
          safe: false,
          reason:
            'Snapshot nao possui identidade e contrato HARDWARE_STATUS v2 completos.',
        };
      }
      if (status.emergencia_ativa !== true) {
        return {
          safe: false,
          reason: 'Latch de parada de emergencia nao esta ativo no ESP32.',
        };
      }
      if (!Array.isArray(status.bombas) || !Array.isArray(status.valvulas)) {
        return {
          safe: false,
          reason: 'Snapshot nao contem os inventarios completos em listas.',
        };
      }

      const pumpError = this.validateEmergencyPumpSnapshot(
        pumps,
        status.bombas,
      );
      if (pumpError) {
        return { safe: false, reason: pumpError };
      }

      const valveError = this.validateEmergencyValveSnapshot(
        valves,
        status.valvulas,
      );
      if (valveError) {
        return { safe: false, reason: valveError };
      }

      return {
        safe: true,
        reason:
          'Um unico snapshot fresco confirmou latch ativo, bombas desligadas e valvulas fechadas.',
      };
    } catch (error) {
      return {
        safe: false,
        reason: `Falha ao consultar a telemetria global: ${this.errorMessage(error)}`,
      };
    }
  }

  private validateEmergencyPumpSnapshot(
    expected: Array<{ id_bomba: number; codigo_hardware: string | null }>,
    actual: Array<{
      id_bomba?: number;
      codigo_hardware: string;
      ligada: boolean;
      disponivel: boolean;
      falha?: boolean;
    }>,
  ): string | null {
    if (actual.length !== expected.length) {
      return `Inventario de bombas incompleto ou extra: esperado ${expected.length}, recebido ${actual.length}.`;
    }

    const expectedByCode = new Map<string, (typeof expected)[number]>();
    for (const pump of expected) {
      const code = pump.codigo_hardware?.trim();
      if (!code || expectedByCode.has(code)) {
        return `Inventario cadastrado de bombas possui codigo ausente ou duplicado (bomba ${pump.id_bomba}).`;
      }
      expectedByCode.set(code, pump);
    }

    const seenCodes = new Set<string>();
    const seenIds = new Set<number>();
    for (const pump of actual) {
      const code = pump.codigo_hardware.trim();
      const registered = expectedByCode.get(code);
      if (seenCodes.has(code)) {
        return `Snapshot possui bomba duplicada pelo codigo ${code}.`;
      }
      seenCodes.add(code);
      if (!registered) {
        return `Snapshot informou bomba desconhecida ${code}.`;
      }
      if (pump.id_bomba === undefined) {
        return `Snapshot nao informou o id da bomba ${code}.`;
      }
      if (seenIds.has(pump.id_bomba)) {
        return `Snapshot possui bomba duplicada pelo id ${pump.id_bomba}.`;
      }
      seenIds.add(pump.id_bomba);
      if (pump.id_bomba !== registered.id_bomba) {
        return `Identidade incoerente para a bomba ${code}.`;
      }
      if (
        pump.ligada !== false ||
        pump.disponivel !== true ||
        pump.falha !== false
      ) {
        return `Bomba ${registered.id_bomba} nao confirmou desligamento seguro.`;
      }
    }

    return null;
  }

  private validateEmergencyValveSnapshot(
    expected: Array<{ id_valvula: number; codigo_hardware: string | null }>,
    actual: Array<{
      id_valvula?: number;
      codigo_hardware: string;
      status_valvula: StatusValvula;
      ack: boolean;
      falha: boolean;
      disponivel?: boolean;
    }>,
  ): string | null {
    if (actual.length !== expected.length) {
      return `Inventario de valvulas incompleto ou extra: esperado ${expected.length}, recebido ${actual.length}.`;
    }

    const expectedByCode = new Map<string, (typeof expected)[number]>();
    for (const valve of expected) {
      const code = valve.codigo_hardware?.trim();
      if (!code || expectedByCode.has(code)) {
        return `Inventario cadastrado de valvulas possui codigo ausente ou duplicado (valvula ${valve.id_valvula}).`;
      }
      expectedByCode.set(code, valve);
    }

    const seenCodes = new Set<string>();
    const seenIds = new Set<number>();
    for (const valve of actual) {
      const code = valve.codigo_hardware.trim();
      const registered = expectedByCode.get(code);
      if (seenCodes.has(code)) {
        return `Snapshot possui valvula duplicada pelo codigo ${code}.`;
      }
      seenCodes.add(code);
      if (!registered) {
        return `Snapshot informou valvula desconhecida ${code}.`;
      }
      if (valve.id_valvula === undefined) {
        return `Snapshot nao informou o id da valvula ${code}.`;
      }
      if (seenIds.has(valve.id_valvula)) {
        return `Snapshot possui valvula duplicada pelo id ${valve.id_valvula}.`;
      }
      seenIds.add(valve.id_valvula);
      if (valve.id_valvula !== registered.id_valvula) {
        return `Identidade incoerente para a valvula ${code}.`;
      }
      if (
        valve.status_valvula !== StatusValvula.FECHADA ||
        valve.ack !== true ||
        valve.falha !== false ||
        valve.disponivel !== true
      ) {
        return `Valvula ${registered.id_valvula} nao confirmou fechamento seguro.`;
      }
    }

    return null;
  }

  private async confirmEmergencyHardware(
    context: GeneralClosureContext,
    confirmedAt: Date,
  ): Promise<void> {
    const confirmed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.processos.updateMany({
        where: {
          id_processo: context.id_processo,
          status_processo: statusprocesso.INTERROMPIDO,
          parada_emergencia: true,
          encerramento_versao: context.encerramento_versao,
          status_encerramento_geral:
            statusencerramentoprocesso.CONFIRMANDO_HARDWARE,
          etapa_encerramento_geral:
            etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA,
        },
        data: {
          status_encerramento_geral: statusencerramentoprocesso.CONCLUIDO,
          etapa_encerramento_geral: etapaencerramentoprocesso.CONCLUIDA,
          encerramento_geral_finalizado_em: confirmedAt,
          encerramento_geral_proxima_tentativa_em: null,
          encerramento_geral_ultimo_erro: null,
          encerramento_versao: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        return false;
      }

      await tx.processostanques.updateMany({
        where: { id_processo: context.id_processo },
        data: {
          motivo_bloqueio_encerramento:
            'Parada de emergencia confirmada: latch e saidas logicas do controlador em estado seguro.',
          encerramento_proxima_tentativa_em: null,
          encerramento_versao: { increment: 1 },
        },
      });
      await tx.processosauxiliares.updateMany({
        where: { id_processo: context.id_processo },
        data: {
          status_subsistema: statussubsistemaauxiliar.INATIVO,
          id_processo_tanque_atual: null,
          id_usuario_controle_bomba: null,
          controle_bomba_assumido_em: null,
          controle_bomba_expira_em: null,
          motivo_bloqueio: null,
          ultimo_erro: null,
          atualizado_em: confirmedAt,
          versao: { increment: 1 },
        },
      });
      await tx.processostanquesauxiliares.updateMany({
        where: { processostanques: { id_processo: context.id_processo } },
        data: {
          status_auxilio: statusauxiliotanque.INATIVO,
          id_usuario_controle_valvula: null,
          controle_valvula_assumido_em: null,
          controle_valvula_expira_em: null,
          motivo_bloqueio: null,
          ultimo_erro: null,
          atualizado_em: confirmedAt,
          versao: { increment: 1 },
        },
      });
      await tx.alarmes.updateMany({
        where: {
          id_processo: context.id_processo,
          titulo: {
            in: [
              EMERGENCY_CONFIRMATION_ALARM_TITLE,
              LEGACY_EMERGENCY_CONFIRMATION_ALARM_TITLE,
            ],
          },
          tipo_alarme: tipoalarme.SEGURANCA,
          status_alarme: statusalarme.ATIVO,
          excluido_em: null,
        },
        data: {
          status_alarme: statusalarme.NORMALIZADO,
          normalizado_em: confirmedAt,
          ultima_validacao_em: confirmedAt,
          bloqueante: false,
          requer_intervencao: false,
        },
      });
      return true;
    });
    if (!confirmed) {
      return;
    }

    await this.safeRegisterLog({
      id_processo: context.id_processo,
      id_usuario: context.encerramento_geral_id_usuario ?? undefined,
      action: 'PARADA_EMERGENCIA_HARDWARE_CONFIRMADO',
      description:
        'Snapshot integral e fresco do ESP32 confirmou latch ativo, bombas comandadas desligadas e valvulas comandadas fechadas; sem feedback mecanico dedicado.',
    });
    await this.emitEmergencyUpdate(
      context.id_processo,
      'Latch e saidas seguras confirmados por snapshot integral e fresco do controlador.',
    );
  }

  private async markEmergencyFailure(
    context: GeneralClosureContext,
    reason: string,
  ): Promise<void> {
    const failed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.processos.updateMany({
        where: {
          id_processo: context.id_processo,
          status_processo: statusprocesso.INTERROMPIDO,
          parada_emergencia: true,
          encerramento_versao: context.encerramento_versao,
          status_encerramento_geral: context.status_encerramento_geral,
        },
        data: {
          status_encerramento_geral: statusencerramentoprocesso.FALHA,
          etapa_encerramento_geral: etapaencerramentoprocesso.FALHA,
          encerramento_geral_proxima_tentativa_em: null,
          encerramento_geral_ultimo_erro: reason,
          encerramento_versao: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        return false;
      }

      const existingAlarm = await tx.alarmes.findFirst({
        where: {
          id_processo: context.id_processo,
          tipo_alarme: tipoalarme.SEGURANCA,
          status_alarme: statusalarme.ATIVO,
          bloqueante: true,
          requer_intervencao: true,
          titulo: {
            in: [
              EMERGENCY_CONFIRMATION_ALARM_TITLE,
              LEGACY_EMERGENCY_CONFIRMATION_ALARM_TITLE,
            ],
          },
          excluido_em: null,
        },
        select: { id_alarme: true },
      });
      if (existingAlarm) {
        await tx.alarmes.update({
          where: { id_alarme: existingAlarm.id_alarme },
          data: {
            descricao: reason,
            ultima_validacao_em: new Date(),
          },
        });
      } else {
        await tx.alarmes.create({
          data: {
            id_processo: context.id_processo,
            titulo: EMERGENCY_CONFIRMATION_ALARM_TITLE,
            descricao: reason,
            tipo_alarme: tipoalarme.SEGURANCA,
            severidade: severidadealarme.CRITICO,
            status_alarme: statusalarme.ATIVO,
            origem_alarme: origemalarme.BACKEND,
            ocorrido_em: new Date(),
            ultima_validacao_em: new Date(),
            bloqueante: true,
            requer_intervencao: true,
            recuperacao_automatica: false,
          },
        });
      }
      return true;
    });
    if (!failed) {
      return;
    }
    await this.safeRegisterLog({
      id_processo: context.id_processo,
      id_usuario: context.encerramento_geral_id_usuario ?? undefined,
      action: 'PARADA_EMERGENCIA_HARDWARE_NAO_CONFIRMADO',
      description: reason,
      result: resultadooperacao.FALHA,
    });
    await this.emitEmergencyUpdate(context.id_processo, reason);
  }

  private async lockMainMqttConfiguration(
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$queryRaw<Array<{ id_mqtt_configuracao: number }>>`
      SELECT "id_mqtt_configuracao"
      FROM "mqttconfiguracoes"
      WHERE "chave_configuracao" = 'MQTT_PRINCIPAL'
      FOR UPDATE
    `;
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
          !(
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2034'
          ) ||
          attempt === maxAttempts
        ) {
          throw error;
        }
      }
    }
    throw new ConflictException(
      'Nao foi possivel obter exclusao para a parada de emergencia.',
    );
  }

  private async calculateMetrics(
    context: GeneralClosureContext,
    completedAt: Date,
  ) {
    const raw = await this.repository.findReadingsForMetrics(
      context.id_processo,
    );
    const input: ProcessoMetricsInput = {
      id_processo: context.id_processo,
      iniciado_em: context.iniciado_em,
      finalizado_em: completedAt,
      tempo_execucao: context.tempo_execucao,
      total_alarmes: 0,
      total_eventos: 0,
      tanques:
        raw?.processostanques.map((tank) => ({
          id_processo_tanque: tank.id_processo_tanque,
          id_tanque: tank.id_tanque,
          nome_tanque: tank.tanques.nome,
          vacuo_alvo: Number(tank.vacuo_alvo),
          leituras: tank.processostanquessensores.flatMap((sensor) =>
            sensor.leiturasensores.map(
              (reading): ProcessoMetricReading => ({
                id_leitura_sensor: reading.id_leitura_sensor,
                id_processo_tanque_sensor: sensor.id_processo_tanque_sensor,
                id_processo_tanque: tank.id_processo_tanque,
                id_tanque: tank.id_tanque,
                valor_vacuo:
                  reading.valor_vacuo === null
                    ? null
                    : Number(reading.valor_vacuo),
                leitura_em: reading.leitura_em,
              }),
            ),
          ),
        })) ?? [],
    };
    return this.metricsService.calculateProcessMetrics(input);
  }

  private async claimClosureStart(
    context: GeneralClosureContext,
    idUsuario: number | null,
    startedAt: Date,
  ): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.processos.updateMany({
        where: {
          id_processo: context.id_processo,
          encerramento_versao: context.encerramento_versao,
          status_processo: statusprocesso.EM_EXECUCAO,
          status_encerramento_geral: context.status_encerramento_geral,
        },
        data: {
          fase_processo: faseprocesso.FINALIZANDO,
          status_encerramento_geral: statusencerramentoprocesso.ENCERRANDO,
          etapa_encerramento_geral:
            etapaencerramentoprocesso.VALIDANDO_ISOLAMENTO,
          encerramento_geral_iniciado_em: startedAt,
          encerramento_geral_finalizado_em: null,
          encerramento_geral_confirmacao_iniciada_em: null,
          encerramento_geral_proxima_tentativa_em: null,
          encerramento_geral_tentativa: { increment: 1 },
          encerramento_geral_comando_tentativas: 0,
          encerramento_geral_ultimo_erro: null,
          encerramento_geral_id_usuario: idUsuario,
          encerramento_versao: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        return false;
      }

      await tx.processosauxiliares.updateMany({
        where: { id_processo: context.id_processo },
        data: {
          status_subsistema: statussubsistemaauxiliar.BLOQUEADO,
          id_processo_tanque_atual: null,
          id_usuario_controle_bomba: null,
          controle_bomba_assumido_em: null,
          controle_bomba_expira_em: null,
          motivo_bloqueio: 'Encerramento geral em andamento.',
          atualizado_em: startedAt,
          versao: { increment: 1 },
        },
      });
      await tx.processostanquesauxiliares.updateMany({
        where: { processostanques: { id_processo: context.id_processo } },
        data: {
          status_auxilio: statusauxiliotanque.BLOQUEADO,
          id_usuario_controle_valvula: null,
          controle_valvula_assumido_em: null,
          controle_valvula_expira_em: null,
          motivo_bloqueio: 'Encerramento geral em andamento.',
          atualizado_em: startedAt,
          versao: { increment: 1 },
        },
      });
      return true;
    });
    return result;
  }

  private async claimStep(
    context: GeneralClosureContext,
    evaluatedAt: Date,
  ): Promise<GeneralClosureContext | null> {
    const updated = await this.prisma.processos.updateMany({
      where: {
        id_processo: context.id_processo,
        encerramento_versao: context.encerramento_versao,
        etapa_encerramento_geral: context.etapa_encerramento_geral,
        status_processo: statusprocesso.EM_EXECUCAO,
        OR: [
          { encerramento_geral_proxima_tentativa_em: null },
          { encerramento_geral_proxima_tentativa_em: { lte: evaluatedAt } },
        ],
      },
      data: {
        encerramento_geral_proxima_tentativa_em: new Date(
          evaluatedAt.getTime() + STEP_LEASE_MS,
        ),
        encerramento_versao: { increment: 1 },
      },
    });
    return updated.count === 1 ? this.findContext(context.id_processo) : null;
  }

  private async recordSafeCommandFailure(
    context: GeneralClosureContext,
    reason: string,
    evaluatedAt: Date,
  ): Promise<void> {
    const attempts = context.encerramento_geral_comando_tentativas + 1;
    if (attempts >= MAX_SAFE_STATE_ATTEMPTS) {
      await this.markFailure(context, reason);
      return;
    }

    const updated = await this.prisma.processos.updateMany({
      where: {
        id_processo: context.id_processo,
        encerramento_versao: context.encerramento_versao,
        etapa_encerramento_geral: context.etapa_encerramento_geral,
      },
      data: {
        encerramento_geral_comando_tentativas: attempts,
        encerramento_geral_proxima_tentativa_em: new Date(
          evaluatedAt.getTime() + COMMAND_RETRY_DELAY_MS,
        ),
        encerramento_geral_ultimo_erro: reason,
        encerramento_versao: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      await this.safeRegisterLog({
        id_processo: context.id_processo,
        action: 'ENCERRAMENTO_GERAL_COMANDO_REPETIR',
        description: `Tentativa ${attempts}/${MAX_SAFE_STATE_ATTEMPTS}. ${reason}`,
        result: resultadooperacao.FALHA,
      });
      await this.emitGeneralUpdate(
        context.id_processo,
        context.status_encerramento_geral,
        reason,
      );
    }
  }

  private async markWaitingForTanks(
    context: GeneralClosureContext,
  ): Promise<void> {
    if (
      context.status_encerramento_geral ===
      statusencerramentoprocesso.AGUARDANDO_TANQUES
    ) {
      return;
    }
    await this.updateSimpleStatus(
      context,
      statusencerramentoprocesso.AGUARDANDO_TANQUES,
      etapaencerramentoprocesso.NENHUMA,
      null,
    );
  }

  private async markWaitingForManualAction(
    context: GeneralClosureContext,
  ): Promise<void> {
    if (
      context.status_encerramento_geral ===
      statusencerramentoprocesso.AGUARDANDO_ACAO_MANUAL
    ) {
      return;
    }
    const updated = await this.updateSimpleStatus(
      context,
      statusencerramentoprocesso.AGUARDANDO_ACAO_MANUAL,
      etapaencerramentoprocesso.NENHUMA,
      null,
    );
    if (updated) {
      await this.emitGeneralUpdate(
        context.id_processo,
        context.status_encerramento_geral,
        'Todos os tanques concluidos; aguardando autorizacao para o encerramento geral.',
      );
    }
  }

  private async markFailure(
    context: GeneralClosureContext,
    reason: string,
  ): Promise<void> {
    const updated = await this.updateSimpleStatus(
      context,
      statusencerramentoprocesso.FALHA,
      etapaencerramentoprocesso.FALHA,
      reason,
    );
    if (!updated) {
      return;
    }

    await this.safeRegisterLog({
      id_processo: context.id_processo,
      action: 'ENCERRAMENTO_GERAL_FALHA',
      description: reason,
      result: resultadooperacao.FALHA,
    });
    await this.emitGeneralUpdate(
      context.id_processo,
      context.status_encerramento_geral,
      reason,
    );
  }

  private async updateSimpleStatus(
    context: GeneralClosureContext,
    status: statusencerramentoprocesso,
    stage: etapaencerramentoprocesso,
    error: string | null,
  ): Promise<boolean> {
    const updated = await this.prisma.processos.updateMany({
      where: {
        id_processo: context.id_processo,
        encerramento_versao: context.encerramento_versao,
        status_processo: statusprocesso.EM_EXECUCAO,
      },
      data: {
        status_encerramento_geral: status,
        etapa_encerramento_geral: stage,
        encerramento_geral_proxima_tentativa_em: null,
        encerramento_geral_ultimo_erro: error,
        encerramento_versao: { increment: 1 },
      },
    });
    return updated.count === 1;
  }

  private assertCanStart(context: GeneralClosureContext): void {
    if (context.status_processo !== statusprocesso.EM_EXECUCAO) {
      throw new ConflictException('Processo nao esta em execucao.');
    }
    if (!this.allTanksCompleted(context)) {
      throw new ConflictException(
        'Todos os tanques precisam concluir isolamento e retencao antes do encerramento geral.',
      );
    }
    if (!this.allHosesCoupled(context)) {
      throw new ConflictException(
        'Todas as mangueiras devem permanecer acopladas ate a liberacao final.',
      );
    }
    const restartableStatuses = new Set<statusencerramentoprocesso>([
      statusencerramentoprocesso.AGUARDANDO_ACAO_MANUAL,
      statusencerramentoprocesso.AGUARDANDO_TANQUES,
      statusencerramentoprocesso.INATIVO,
      statusencerramentoprocesso.FALHA,
    ]);
    if (!restartableStatuses.has(context.status_encerramento_geral)) {
      throw new ConflictException(
        `Encerramento geral ja esta no estado ${context.status_encerramento_geral}.`,
      );
    }
  }

  private allTanksCompleted(context: GeneralClosureContext): boolean {
    return (
      context.processostanques.length > 0 &&
      context.processostanques.every(
        (tank) =>
          tank.status_encerramento === statusencerramentotanque.CONCLUIDO &&
          tank.etapa_encerramento === 'CONCLUIDA' &&
          tank.status_tanque_processo === statustanqueprocesso.CONCLUIDO,
      )
    );
  }

  private allHosesCoupled(context: GeneralClosureContext): boolean {
    return context.processostanques.every((tank) => {
      const coupling = tank.tanques.sensoresacoplamentomangueiras;
      return Boolean(
        coupling?.ativo &&
        coupling.sinal_detectado &&
        coupling.status_acoplamento === StatusAcoplamentoMangueira.ACOPLADA,
      );
    });
  }

  private isHardwareSafeAndFresh(context: GeneralClosureContext): boolean {
    const marker = context.encerramento_geral_confirmacao_iniciada_em;
    if (!marker) {
      return false;
    }
    const valves = context.processostanques.flatMap(
      (tank) => tank.tanques.valvulas,
    );
    if (
      valves.length === 0 ||
      valves.some(
        (valve) =>
          valve.status_valvula !== StatusValvula.FECHADA ||
          !valve.ultimo_acionamento ||
          valve.ultimo_acionamento.getTime() < marker.getTime(),
      )
    ) {
      return false;
    }

    const pumps = new Map<number, (typeof valves)[number]['bombas']>();
    for (const valve of valves) {
      pumps.set(valve.bombas.id_bomba, valve.bombas);
    }
    return (
      pumps.size > 0 &&
      [...pumps.values()].every(
        (pump) =>
          pump.ligada_hardware === false &&
          Boolean(
            pump.ultimo_status_hardware_em &&
            pump.ultimo_status_hardware_em.getTime() >= marker.getTime(),
          ),
      )
    );
  }

  private commandOptions(
    context: GeneralClosureContext,
    correlationId: string,
  ) {
    return {
      id_processo: context.id_processo,
      solicitado_por: context.encerramento_geral_id_usuario,
      motivo: `Encerramento geral seguro do processo ${context.id_processo}.`,
      correlation_id: correlationId,
    };
  }

  private correlationId(context: GeneralClosureContext): string {
    return (
      `process-general-closure-p${context.id_processo}` +
      `-r${context.encerramento_geral_tentativa}` +
      `-${context.etapa_encerramento_geral.toLowerCase()}`
    );
  }

  private findContext(idProcesso: number) {
    return this.prisma.processos.findUnique({
      where: { id_processo: idProcesso },
      select: GENERAL_CLOSURE_SELECT,
    });
  }

  private buildState(
    context: GeneralClosureContext,
  ): ProcessoEncerramentoGeralState {
    const allTanksCompleted = this.allTanksCompleted(context);
    return {
      status: context.status_encerramento_geral,
      etapa: context.etapa_encerramento_geral,
      automatico: context.encerramento_automatico,
      pronto_para_iniciar:
        !context.parada_emergencia &&
        allTanksCompleted &&
        new Set<statusencerramentoprocesso>([
          statusencerramentoprocesso.AGUARDANDO_ACAO_MANUAL,
          statusencerramentoprocesso.FALHA,
        ]).has(context.status_encerramento_geral),
      aguardando_acao_manual:
        !context.parada_emergencia &&
        context.status_encerramento_geral ===
          statusencerramentoprocesso.AGUARDANDO_ACAO_MANUAL,
      hardware_confirmado:
        context.status_encerramento_geral ===
        statusencerramentoprocesso.CONCLUIDO,
      iniciado_em: context.encerramento_geral_iniciado_em,
      finalizado_em: context.encerramento_geral_finalizado_em,
      confirmacao_iniciada_em:
        context.encerramento_geral_confirmacao_iniciada_em,
      proxima_tentativa_em: context.encerramento_geral_proxima_tentativa_em,
      tentativa: context.encerramento_geral_tentativa,
      comando_tentativas: context.encerramento_geral_comando_tentativas,
      ultimo_erro: context.encerramento_geral_ultimo_erro,
      versao: context.encerramento_versao,
    };
  }

  private buildEmergencyState(
    context: GeneralClosureContext,
  ): ProcessoParadaEmergenciaState {
    const hardwareConfirmed =
      context.parada_emergencia &&
      context.status_encerramento_geral ===
        statusencerramentoprocesso.CONCLUIDO;
    let status: ProcessoParadaEmergenciaState['status'] = 'INATIVA';

    if (context.parada_emergencia) {
      switch (context.status_encerramento_geral) {
        case statusencerramentoprocesso.CONCLUIDO:
          status = 'CONFIRMADA';
          break;
        case statusencerramentoprocesso.FALHA:
          status = 'FALHA';
          break;
        case statusencerramentoprocesso.CONFIRMANDO_HARDWARE:
          status = 'AGUARDANDO_CONFIRMACAO';
          break;
        default:
          status = 'ACIONANDO';
      }
    }

    return {
      ativa: context.parada_emergencia,
      status,
      etapa: context.etapa_encerramento_geral,
      hardware_confirmado: hardwareConfirmed,
      nivel_confirmacao: hardwareConfirmed
        ? 'CONTROLADOR_CONFIRMADO'
        : 'NAO_CONFIRMADO',
      latch_emergencia_confirmado: hardwareConfirmed,
      saidas_controlador_confirmadas: hardwareConfirmed,
      feedback_mecanico_disponivel: false,
      requer_intervencao:
        context.parada_emergencia &&
        context.status_encerramento_geral === statusencerramentoprocesso.FALHA,
      solicitada_em: context.encerramento_geral_iniciado_em,
      confirmada_em: context.encerramento_geral_finalizado_em,
      proxima_tentativa_em: context.encerramento_geral_proxima_tentativa_em,
      tentativa: context.encerramento_geral_tentativa,
      comando_tentativas: context.encerramento_geral_comando_tentativas,
      ultimo_erro: context.encerramento_geral_ultimo_erro,
      versao: context.encerramento_versao,
    };
  }

  private async emitGeneralUpdate(
    idProcesso: number,
    previousStatus: statusencerramentoprocesso,
    message: string,
  ): Promise<void> {
    const context = await this.findContext(idProcesso);
    if (!context) {
      return;
    }
    this.socketGateway.emitGeneralClosureUpdated({
      id_processo: idProcesso,
      previous_status: previousStatus,
      closure: this.buildState(context),
      message,
      emitted_at: new Date(),
    });
  }

  private async emitEmergencyUpdate(
    idProcesso: number,
    message: string,
  ): Promise<void> {
    try {
      const context = await this.findContext(idProcesso);
      if (!context) {
        return;
      }
      this.socketGateway.emitEmergencyStop({
        id_processo: idProcesso,
        message,
        parada_emergencia: this.buildEmergencyState(context),
        emitted_at: new Date(),
      });
    } catch (error) {
      // Socket.IO is observability, not part of the physical safety path. A
      // notification failure must never prevent or postpone safe commands.
      this.logger.error(
        `Falha ao emitir parada de emergencia do processo ${idProcesso}: ${this.errorMessage(error)}`,
      );
    }
  }

  private safeRegisterLog(input: {
    id_processo: number;
    id_usuario?: number;
    action: string;
    description: string;
    result?: resultadooperacao;
  }): Promise<void> {
    const operation = input.id_usuario
      ? this.processoLogService.registerUserAction({
          id_processo: input.id_processo,
          id_usuario: input.id_usuario,
          acao: input.action,
          descricao: input.description,
          resultado: input.result,
        })
      : this.processoLogService.registerSystemAction({
          id_processo: input.id_processo,
          acao: input.action,
          descricao: input.description,
          resultado: input.result,
        });
    return operation.then(
      () => undefined,
      (error: unknown) => {
        this.logger.error(
          `Falha ao registrar log do encerramento geral: ${this.errorMessage(error)}`,
        );
      },
    );
  }

  private enqueueProcess<T>(
    idProcesso: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.processQueues.get(idProcesso) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const tail = current.then(
      () => undefined,
      () => undefined,
    );
    this.processQueues.set(idProcesso, tail);
    void tail.finally(() => {
      if (this.processQueues.get(idProcesso) === tail) {
        this.processQueues.delete(idProcesso);
      }
    });
    return current;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Falha desconhecida.';
  }
}
