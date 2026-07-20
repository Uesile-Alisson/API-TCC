import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  modooperacaoauxiliar,
  resultadooperacao,
  statusauxiliotanque,
  statusestagnacao,
  statusprocesso,
  statussubsistemaauxiliar,
  statustanqueprocesso,
  StatusValvula,
} from '@prisma/client';
import { ProcessoAuxiliarSafetyAction } from '../interfaces';
import { ProcessoLogService } from '../logs';
import { ProcessosService } from '../processos.service';
import { ProcessoAuxiliarCommandService } from './processo-auxiliar-command.service';
import {
  ProcessoAuxiliarRepository,
  ProcessoAuxiliarSchedulerContext,
  ProcessoAuxiliarSchedulerTank,
} from './processo-auxiliar.repository';

const SCHEDULER_NAME = 'processo-auxiliar-automatico';
const HARDWARE_SETTLEMENT_TIMEOUT_MS = 15_000;
const CONFLICT_RETRY_DELAY_MS = 5_000;

interface ShutdownDecision {
  stop: boolean;
  block_after_close: boolean;
  reason: string;
  no_effect_alarm?: boolean;
}

@Injectable()
export class ProcessoAuxiliarSchedulerService {
  private readonly logger = new Logger(ProcessoAuxiliarSchedulerService.name);
  private readonly retryAfter = new Map<number, number>();

  constructor(
    private readonly repository: ProcessoAuxiliarRepository,
    private readonly commandService: ProcessoAuxiliarCommandService,
    private readonly processoLogService: ProcessoLogService,
    private readonly processosService: ProcessosService,
  ) {}

  @Cron(CronExpression.EVERY_SECOND, {
    name: SCHEDULER_NAME,
    waitForCompletion: true,
    disabled:
      process.env.NODE_ENV === 'test' ||
      process.env.AUXILIARY_SCHEDULER_DISABLED === 'true',
  })
  runScheduledCycle(): Promise<void> {
    return this.runOnce();
  }

  async runOnce(evaluatedAt = new Date()): Promise<void> {
    const expiredLeases = await this.repository.clearExpiredLeases(evaluatedAt);
    const initialContexts =
      await this.repository.findSchedulerContexts(evaluatedAt);

    for (const initialContext of initialContexts) {
      const retryAt = this.retryAfter.get(initialContext.id_processo) ?? 0;
      if (retryAt > evaluatedAt.getTime()) {
        continue;
      }
      let shouldEmit = expiredLeases > 0;

      try {
        const candidateChanges = await this.repository.synchronizeCandidates(
          initialContext,
          evaluatedAt,
        );
        shouldEmit ||= candidateChanges > 0;

        const context =
          candidateChanges > 0 || expiredLeases > 0
            ? await this.reloadContext(initialContext.id_processo, evaluatedAt)
            : initialContext;
        if (!context) {
          continue;
        }

        const actionTaken = await this.evaluateContext(context, evaluatedAt);
        shouldEmit ||= actionTaken;
        this.retryAfter.delete(context.id_processo);

        if (candidateChanges > 0) {
          await this.safeRegisterDecision(
            context.id_processo,
            'AUXILIAR_FILA_ATUALIZADA',
            `Fila auxiliar atualizada; ${candidateChanges} tanque(s) alterado(s).`,
          );
        }
      } catch (error) {
        if (error instanceof ConflictException) {
          this.retryAfter.set(
            initialContext.id_processo,
            evaluatedAt.getTime() + CONFLICT_RETRY_DELAY_MS,
          );
          this.logger.debug(
            `Ciclo auxiliar concorrente ignorado no processo ${initialContext.id_processo}: ${this.getErrorMessage(error)}`,
          );
        } else {
          const message = this.getErrorMessage(error);
          this.logger.error(
            `Falha no escalonador auxiliar do processo ${initialContext.id_processo}: ${message}`,
          );
          await this.repository.markSchedulerFailure({
            id_processo: initialContext.id_processo,
            id_processo_tanque: initialContext.current_tank_id ?? undefined,
            error: message,
          });
          await this.safeRegisterDecision(
            initialContext.id_processo,
            'AUXILIAR_ESCALONADOR_FALHA',
            message,
            true,
          );
          shouldEmit = true;
        }
      }

      if (shouldEmit) {
        await this.processosService
          .notifyAuxiliaryStateUpdated(initialContext.id_processo)
          .catch((error: unknown) =>
            this.logger.error(
              `Falha ao emitir estado auxiliar do processo ${initialContext.id_processo}: ${this.getErrorMessage(error)}`,
            ),
          );
      }
    }
  }

  private async evaluateContext(
    context: ProcessoAuxiliarSchedulerContext,
    evaluatedAt: Date,
  ): Promise<boolean> {
    const currentTank = context.current_tank_id
      ? (context.tanks.find(
          (tank) => tank.id_processo_tanque === context.current_tank_id,
        ) ?? null)
      : null;

    if (context.current_tank_id && !currentTank) {
      await this.repository.markSchedulerFailure({
        id_processo: context.id_processo,
        error: `Tanque atual ${context.current_tank_id} nao pertence ao processo.`,
      });
      return true;
    }

    if (currentTank) {
      return this.advanceCurrentTank(context, currentTank, evaluatedAt);
    }

    return this.handleIdleSubsystem(context);
  }

  private async handleIdleSubsystem(
    context: ProcessoAuxiliarSchedulerContext,
  ): Promise<boolean> {
    if (context.pump_running === true) {
      await this.executeAutomaticCommand(
        context,
        ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
        undefined,
        'Parada segura de bomba auxiliar ligada sem tanque selecionado.',
      );
      return true;
    }

    const orphanOpenValve = context.tanks.find(
      (tank) => tank.valve_status === StatusValvula.ABERTA,
    );
    if (context.pump_running === false && orphanOpenValve) {
      await this.executeAutomaticCommand(
        context,
        ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
        orphanOpenValve,
        'Fechamento seguro de valvula auxiliar sem tanque selecionado.',
      );
      return true;
    }

    if (context.subsystem_status === statussubsistemaauxiliar.FALHA) {
      return false;
    }

    if (context.has_active_human_lease) {
      return this.updateIdleDecision(
        context,
        statussubsistemaauxiliar.CONTROLE_MANUAL,
        'Automacao cedida a lease humano ativo.',
      );
    }

    const candidates = this.sortCandidates(
      context.tanks.filter((tank) =>
        context.mode === modooperacaoauxiliar.MANUAL
          ? tank.status_auxilio === statusauxiliotanque.ELEGIVEL
          : tank.status_auxilio === statusauxiliotanque.AGUARDANDO,
      ),
    );

    if (context.mode === modooperacaoauxiliar.MANUAL) {
      return this.updateIdleDecision(
        context,
        candidates.length > 0
          ? statussubsistemaauxiliar.AGUARDANDO
          : statussubsistemaauxiliar.DISPONIVEL,
        candidates.length > 0
          ? `Modo MANUAL: ${candidates.length} tanque(s) com auxilio recomendado; aguardando decisao humana.`
          : 'Modo MANUAL: monitoramento ativo, sem recomendacao de auxilio.',
      );
    }

    if (context.status_processo !== statusprocesso.EM_EXECUCAO) {
      return this.updateIdleDecision(
        context,
        statussubsistemaauxiliar.INATIVO,
        'Escalonador inativo porque o processo nao esta em execucao.',
      );
    }
    const candidate = candidates[0];
    if (!candidate) {
      const blockedTank = context.tanks.find(
        (tank) => tank.status_auxilio === statusauxiliotanque.BLOQUEADO,
      );
      if (blockedTank) {
        return this.updateIdleDecision(
          context,
          statussubsistemaauxiliar.BLOQUEADO,
          blockedTank.motivo_bloqueio ??
            `Tanque ${blockedTank.id_tanque} bloqueado para novo auxilio.`,
        );
      }
      return this.updateIdleDecision(
        context,
        statussubsistemaauxiliar.DISPONIVEL,
        null,
      );
    }

    if (
      context.subsystem_status === statussubsistemaauxiliar.BLOQUEADO ||
      context.subsystem_status === statussubsistemaauxiliar.INATIVO
    ) {
      return this.updateIdleDecision(
        context,
        statussubsistemaauxiliar.AGUARDANDO,
        'Existe outro tanque elegivel aguardando atendimento auxiliar.',
      );
    }

    await this.executeAutomaticCommand(
      context,
      ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
      candidate,
      `Selecionar tanque ${candidate.id_tanque} estagnado para auxilio automatico.`,
    );
    return true;
  }

  private async advanceCurrentTank(
    context: ProcessoAuxiliarSchedulerContext,
    tank: ProcessoAuxiliarSchedulerTank,
    evaluatedAt: Date,
  ): Promise<boolean> {
    let evidenceChanged = false;
    if (
      context.pump_running === true &&
      tank.iniciado_em &&
      typeof this.repository.refreshAssistanceEvidence === 'function'
    ) {
      const refreshed = await this.repository.refreshAssistanceEvidence({
        id_processo: context.id_processo,
        id_processo_tanque: tank.id_processo_tanque,
        evaluated_at: evaluatedAt,
      });
      evidenceChanged = refreshed.changed;
      tank = { ...tank, ...refreshed.evidence };
    }
    let shutdown = this.resolveShutdownDecision(context, tank, evaluatedAt);

    if (context.pump_running === true) {
      if (
        context.subsystem_status === statussubsistemaauxiliar.TROCANDO_TANQUE &&
        !this.hardwareSettlementExpired(context, evaluatedAt)
      ) {
        return false;
      }
      if (
        !shutdown.stop &&
        context.subsystem_status !== statussubsistemaauxiliar.OPERANDO &&
        context.subsystem_status !== statussubsistemaauxiliar.CONTROLE_MANUAL
      ) {
        shutdown = {
          stop: true,
          block_after_close: true,
          reason:
            'Parada segura por divergencia entre telemetria ligada e estado logico do subsistema.',
        };
      }
      if (!shutdown.stop) {
        return evidenceChanged;
      }
      await this.executeAutomaticCommand(
        context,
        ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
        undefined,
        shutdown.reason,
      );
      return true;
    }

    if (context.pump_running === null) {
      if (this.hardwareSettlementExpired(context, evaluatedAt)) {
        throw new Error(
          'Telemetria da bomba auxiliar ausente durante atendimento automatico.',
        );
      }
      return false;
    }

    if (tank.valve_status === StatusValvula.ABERTA) {
      if (shutdown.stop) {
        await this.executeAutomaticCommand(
          context,
          ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
          tank,
          shutdown.reason,
        );
        if (shutdown.block_after_close) {
          await this.repository.blockTank({
            id_processo: context.id_processo,
            id_processo_tanque: tank.id_processo_tanque,
            reason: shutdown.reason,
            create_no_effect_alarm: shutdown.no_effect_alarm,
          });
        }
        return true;
      }

      await this.executeAutomaticCommand(
        context,
        ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
        tank,
        `Iniciar auxilio automatico do tanque ${tank.id_tanque}.`,
      );
      return true;
    }

    if (tank.valve_status === StatusValvula.FECHADA) {
      if (shutdown.stop) {
        await this.executeAutomaticCommand(
          context,
          ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
          tank,
          shutdown.reason,
        );
        if (shutdown.block_after_close) {
          await this.repository.blockTank({
            id_processo: context.id_processo,
            id_processo_tanque: tank.id_processo_tanque,
            reason: shutdown.reason,
            create_no_effect_alarm: shutdown.no_effect_alarm,
          });
        }
        return true;
      }

      if (!this.hardwareSettlementExpired(context, evaluatedAt)) {
        return false;
      }

      await this.executeAutomaticCommand(
        context,
        ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
        tank,
        `Reconfirmar abertura da valvula auxiliar do tanque ${tank.id_tanque}.`,
      );
      return true;
    }

    throw new Error(
      `Valvula auxiliar do tanque ${tank.id_tanque} em estado fisico ${tank.valve_status ?? 'ausente'}.`,
    );
  }

  private resolveShutdownDecision(
    context: ProcessoAuxiliarSchedulerContext,
    tank: ProcessoAuxiliarSchedulerTank,
    evaluatedAt: Date,
  ): ShutdownDecision {
    if (context.status_processo !== statusprocesso.EM_EXECUCAO) {
      return {
        stop: true,
        block_after_close: true,
        reason: 'Atendimento encerrado porque o processo nao esta em execucao.',
      };
    }
    if (!tank.sensor_operational || !tank.coupling_ok) {
      return {
        stop: true,
        block_after_close: true,
        reason:
          'Parada segura do auxilio: sensor de vacuo ou acoplamento deixou de estar operacional.',
      };
    }
    if (
      context.mode === modooperacaoauxiliar.ASSISTIDO &&
      context.has_active_human_lease
    ) {
      return {
        stop: true,
        block_after_close: false,
        reason: 'Atendimento automatico cedido a lease humano ativo.',
      };
    }
    if (context.mode === modooperacaoauxiliar.MANUAL) {
      return context.has_active_human_lease
        ? {
            stop: false,
            block_after_close: false,
            reason: 'Operacao pertencente a controle humano ativo.',
          }
        : {
            stop: true,
            block_after_close: true,
            reason:
              'Parada segura porque o modo MANUAL ficou sem lease humano ativo.',
          };
    }
    if (
      tank.status_tanque_processo === statustanqueprocesso.VACUO_ATINGIDO ||
      tank.status_tanque_processo === statustanqueprocesso.VACUO_ESTABILIZADO
    ) {
      return {
        stop: true,
        block_after_close: false,
        reason: 'Atendimento concluido porque o tanque atingiu o vacuo final.',
      };
    }
    if (tank.eficacia_confirmada === true) {
      return {
        stop: true,
        block_after_close: false,
        reason:
          tank.motivo_avaliacao ??
          'Atendimento concluido com melhoria de vacuo comprovada.',
      };
    }
    if (tank.status_estagnacao !== statusestagnacao.DETECTADA) {
      return {
        stop: true,
        block_after_close: false,
        reason:
          'Atendimento concluido porque o progresso do vacuo foi retomado.',
      };
    }
    if (
      tank.iniciado_em &&
      evaluatedAt.getTime() - tank.iniciado_em.getTime() >=
        context.assistance_timeout_seconds * 1000
    ) {
      return {
        stop: true,
        block_after_close: true,
        no_effect_alarm: true,
        reason:
          `Tempo maximo de auxilio de ${context.assistance_timeout_seconds}s atingido ` +
          `sem efeito suficiente; melhoria=${tank.melhoria_observada ?? 'indisponivel'}, ` +
          `minimo=${tank.melhoria_minima_esperada ?? context.assistance_minimum_improvement}.`,
      };
    }
    if (context.subsystem_status === statussubsistemaauxiliar.TROCANDO_TANQUE) {
      return {
        stop: true,
        block_after_close: false,
        reason: 'Finalizando sequencia segura do atendimento auxiliar.',
      };
    }

    return {
      stop: false,
      block_after_close: false,
      reason: 'Atendimento auxiliar automatico em andamento.',
    };
  }

  private executeAutomaticCommand(
    context: ProcessoAuxiliarSchedulerContext,
    action: ProcessoAuxiliarSafetyAction,
    tank: ProcessoAuxiliarSchedulerTank | undefined,
    motivo: string,
  ) {
    return this.commandService.executeAutomaticCommand({
      id_processo: context.id_processo,
      id_processo_tanque: tank?.id_processo_tanque,
      action,
      expected_subsystem_version: context.subsystem_version,
      expected_tank_version: tank?.versao,
      motivo,
      correlation_id: this.buildCorrelationId(context, action, tank),
    });
  }

  private async updateIdleDecision(
    context: ProcessoAuxiliarSchedulerContext,
    status: statussubsistemaauxiliar,
    reason: string | null,
  ): Promise<boolean> {
    if (
      context.subsystem_status === status &&
      context.subsystem_reason === reason
    ) {
      return false;
    }

    return this.repository.updateIdleSchedulerDecision({
      id_processo: context.id_processo,
      expected_version: context.subsystem_version,
      status,
      reason,
    });
  }

  private sortCandidates(
    tanks: ProcessoAuxiliarSchedulerTank[],
  ): ProcessoAuxiliarSchedulerTank[] {
    return [...tanks].sort((left, right) => {
      if (left.prioridade !== right.prioridade) {
        return right.prioridade - left.prioridade;
      }
      const leftRequestedAt =
        left.solicitado_em?.getTime() ??
        left.estagnacao_detectada_em?.getTime() ??
        Number.MAX_SAFE_INTEGER;
      const rightRequestedAt =
        right.solicitado_em?.getTime() ??
        right.estagnacao_detectada_em?.getTime() ??
        Number.MAX_SAFE_INTEGER;

      return leftRequestedAt === rightRequestedAt
        ? left.id_processo_tanque - right.id_processo_tanque
        : leftRequestedAt - rightRequestedAt;
    });
  }

  private hardwareSettlementExpired(
    context: ProcessoAuxiliarSchedulerContext,
    evaluatedAt: Date,
  ): boolean {
    return (
      evaluatedAt.getTime() - context.subsystem_updated_at.getTime() >=
      HARDWARE_SETTLEMENT_TIMEOUT_MS
    );
  }

  private buildCorrelationId(
    context: ProcessoAuxiliarSchedulerContext,
    action: ProcessoAuxiliarSafetyAction,
    tank?: ProcessoAuxiliarSchedulerTank,
  ): string {
    return [
      'auto',
      context.id_processo,
      tank?.id_processo_tanque ?? 'global',
      action.toLowerCase(),
      context.subsystem_version,
      tank?.versao ?? 'na',
    ].join('-');
  }

  private async reloadContext(
    idProcesso: number,
    evaluatedAt: Date,
  ): Promise<ProcessoAuxiliarSchedulerContext | null> {
    const contexts = await this.repository.findSchedulerContexts(evaluatedAt);
    return (
      contexts.find((context) => context.id_processo === idProcesso) ?? null
    );
  }

  private async safeRegisterDecision(
    idProcesso: number,
    action: string,
    description: string,
    failure = false,
  ): Promise<void> {
    try {
      await this.processoLogService.registerSystemAction({
        id_processo: idProcesso,
        acao: action,
        descricao: description,
        ...(failure ? { resultado: resultadooperacao.FALHA } : {}),
      });
    } catch (error) {
      this.logger.error(
        `Falha ao auditar decisao automatica: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Erro desconhecido.';
  }
}
