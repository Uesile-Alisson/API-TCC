import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  StatusAcoplamentoMangueira,
  faseprocesso,
  severidadealarme,
  statusauxiliotanque,
  statusconexaomqtt,
  statusestagnacao,
  statusencerramentotanque,
  statusencerramentoprocesso,
  statusgeralsistema,
  statusprocesso,
} from '@prisma/client';
import {
  CreateProcessoDTO,
  FinalizarProcessoDTO,
  InterromperProcessoDTO,
  ListProcessosQueryDTO,
  ParadaEmergenciaProcessoDTO,
  ProcessoAuxiliarCommandDTO,
  ProcessoAuxiliarLeaseDTO,
  ProcessoAuxiliarReleaseDTO,
  UpdateProcessoConfigDTO,
} from './dto';
import { ProcessoAuxiliarCommandService } from './auxiliar/processo-auxiliar-command.service';
import { ProcessoEventService } from './events';
import {
  CurrentUserPayload,
  ProcessoAuxiliarControlHolder,
  ProcessoAuxiliarState,
  ProcessoDashboardData,
  ProcessoDashboardReadingPoint,
  ProcessoDashboardTanque,
  ProcessoOperationalContext,
  ProcessoParadaEmergenciaState,
} from './interfaces';
import {
  DEFAULT_STAGNATION_CONSECUTIVE_WINDOWS,
  DEFAULT_STAGNATION_MIN_READINGS,
  DEFAULT_STAGNATION_MIN_VARIATION,
  DEFAULT_STAGNATION_WINDOW_SECONDS,
  ProcessoGeneralClosureService,
  ProcessoLifecycleService,
} from './lifecycle';
import { ProcessoLogService } from './logs';
import {
  ProcessoMetricReading,
  ProcessoMetricsInput,
  ProcessoMetricsService,
} from './metrics';
import {
  ProcessoMqttCommandContext,
  ProcessoMqttHardwareReadiness,
  ProcessoMqttOrchestratorService,
  ProcessoStartupService,
} from './mqtt';
import { ProcessoPrecheckService } from './precheck';
import { ProcessosRepository } from './processos.repository';
import { ProcessosSocketGateway } from './socket';
import {
  ProcessoConfigValidator,
  ProcessoStartValidator,
  ProcessoStateValidator,
} from './validators';

type ProcessoRecord = NonNullable<
  Awaited<ReturnType<ProcessosRepository['findById']>>
>;

type ProcessoMetricsRawData = Awaited<
  ReturnType<ProcessosRepository['findReadingsForMetrics']>
>;

type ProcessoDashboardRawData = NonNullable<
  Awaited<ReturnType<ProcessosRepository['findDashboardById']>>
>;

type ProcessoAuxiliaryRawData = NonNullable<
  Awaited<ReturnType<ProcessosRepository['findAuxiliaryStateByProcessId']>>
>;

type DecimalLike = {
  toNumber(): number;
};

export interface ProcessoActionResult<TData = unknown> {
  success: true;
  message: string;
  id_processo: number;
  status_processo: statusprocesso;
  data?: TData;
}

@Injectable()
export class ProcessosService {
  private readonly logger = new Logger(ProcessosService.name);

  constructor(
    private readonly processosRepository: ProcessosRepository,
    private readonly processoConfigValidator: ProcessoConfigValidator,
    private readonly processoStateValidator: ProcessoStateValidator,
    private readonly processoStartValidator: ProcessoStartValidator,
    private readonly processoLifecycleService: ProcessoLifecycleService,
    private readonly processoGeneralClosureService: ProcessoGeneralClosureService,
    private readonly processoMetricsService: ProcessoMetricsService,
    private readonly processoEventService: ProcessoEventService,
    private readonly processoLogService: ProcessoLogService,
    private readonly processoMqttOrchestratorService: ProcessoMqttOrchestratorService,
    private readonly processosSocketGateway: ProcessosSocketGateway,
    private readonly processoPrecheckService: ProcessoPrecheckService,
    private readonly processoAuxiliarCommandService: ProcessoAuxiliarCommandService,
    private readonly processoStartupService: ProcessoStartupService,
  ) {}

  async create(dto: CreateProcessoDTO, user: CurrentUserPayload) {
    this.processoConfigValidator.validateCreate(dto);

    const id_usuario = this.resolveUserId(user);
    const processo = await this.processosRepository.createWithRelations({
      dto,
      id_usuario,
      persistAudit: async (tx, id_processo) => {
        await this.processoEventService.registerProcessCreated(
          {
            id_processo,
            id_usuario,
            nome_processo: dto.nome_processo,
          },
          tx,
        );
        await this.processoLogService.registerUserAction(
          {
            id_usuario,
            id_processo,
            acao: 'PROCESSO_CRIADO',
            descricao: 'Usuário criou processo.',
          },
          tx,
        );
      },
    });

    await this.runPostCommitEffect('emitir processo criado', () =>
      this.processosSocketGateway.emitProcessCreated({
        id_processo: processo.id_processo,
        status_processo: processo.status_processo,
        message: 'Processo criado.',
        emitted_at: new Date(),
      }),
    );
    await this.runPostCommitEffect('emitir estado auxiliar inicial', () =>
      this.emitAuxiliaryStateUpdated(processo.id_processo),
    );

    return this.buildActionResult({
      message: 'Processo criado com sucesso.',
      id_processo: processo.id_processo,
      status_processo: processo.status_processo,
      data: processo,
    });
  }

  async list(query: ListProcessosQueryDTO) {
    return this.processosRepository.list(query);
  }

  async findById(id_processo: number) {
    const processo =
      await this.processosRepository.findDetailsById(id_processo);

    if (!processo) {
      throw new NotFoundException('Processo não encontrado.');
    }

    return processo;
  }

  async findActive() {
    const activeProcessId =
      await this.processosRepository.findActiveProcessId();

    if (!activeProcessId) {
      return null;
    }

    return this.findById(activeProcessId);
  }

  async getAuxiliaryState(id_processo: number): Promise<ProcessoAuxiliarState> {
    const snapshotAt = new Date();
    const raw =
      await this.processosRepository.findAuxiliaryStateByProcessId(id_processo);

    if (!raw) {
      throw new NotFoundException('Processo nao encontrado.');
    }

    return this.buildAuxiliaryState(raw, snapshotAt);
  }

  notifyAuxiliaryStateUpdated(
    id_processo: number,
  ): Promise<ProcessoAuxiliarState> {
    return this.emitAuxiliaryStateUpdated(id_processo);
  }

  async acquireAuxiliaryPumpControl(
    id_processo: number,
    dto: ProcessoAuxiliarLeaseDTO,
    user: CurrentUserPayload,
  ) {
    return this.runAuxiliaryMutation(id_processo, () =>
      this.processoAuxiliarCommandService.acquirePumpControl({
        id_processo,
        dto,
        user,
      }),
    );
  }

  async releaseAuxiliaryPumpControl(
    id_processo: number,
    dto: ProcessoAuxiliarReleaseDTO,
    user: CurrentUserPayload,
  ) {
    return this.runAuxiliaryMutation(id_processo, () =>
      this.processoAuxiliarCommandService.releasePumpControl({
        id_processo,
        dto,
        user,
      }),
    );
  }

  async acquireAuxiliaryValveControl(
    id_processo: number,
    id_processo_tanque: number,
    dto: ProcessoAuxiliarLeaseDTO,
    user: CurrentUserPayload,
  ) {
    return this.runAuxiliaryMutation(id_processo, () =>
      this.processoAuxiliarCommandService.acquireValveControl({
        id_processo,
        id_processo_tanque,
        dto,
        user,
      }),
    );
  }

  async releaseAuxiliaryValveControl(
    id_processo: number,
    id_processo_tanque: number,
    dto: ProcessoAuxiliarReleaseDTO,
    user: CurrentUserPayload,
  ) {
    return this.runAuxiliaryMutation(id_processo, () =>
      this.processoAuxiliarCommandService.releaseValveControl({
        id_processo,
        id_processo_tanque,
        dto,
        user,
      }),
    );
  }

  async turnOnAuxiliaryPump(
    id_processo: number,
    id_processo_tanque: number,
    dto: ProcessoAuxiliarCommandDTO,
    user: CurrentUserPayload,
  ) {
    return this.runAuxiliaryMutation(id_processo, () =>
      this.processoAuxiliarCommandService.ligarBomba({
        id_processo,
        id_processo_tanque,
        dto,
        user,
      }),
    );
  }

  async turnOffAuxiliaryPump(
    id_processo: number,
    dto: ProcessoAuxiliarCommandDTO,
    user: CurrentUserPayload,
  ) {
    return this.runAuxiliaryMutation(id_processo, () =>
      this.processoAuxiliarCommandService.desligarBomba({
        id_processo,
        dto,
        user,
      }),
    );
  }

  async openAuxiliaryValve(
    id_processo: number,
    id_processo_tanque: number,
    dto: ProcessoAuxiliarCommandDTO,
    user: CurrentUserPayload,
  ) {
    return this.runAuxiliaryMutation(id_processo, () =>
      this.processoAuxiliarCommandService.abrirValvula({
        id_processo,
        id_processo_tanque,
        dto,
        user,
      }),
    );
  }

  async closeAuxiliaryValve(
    id_processo: number,
    id_processo_tanque: number,
    dto: ProcessoAuxiliarCommandDTO,
    user: CurrentUserPayload,
  ) {
    return this.runAuxiliaryMutation(id_processo, () =>
      this.processoAuxiliarCommandService.fecharValvula({
        id_processo,
        id_processo_tanque,
        dto,
        user,
      }),
    );
  }

  async updateConfig(
    id_processo: number,
    dto: UpdateProcessoConfigDTO,
    user: CurrentUserPayload,
  ) {
    const processo = await this.getRequiredProcess(id_processo);

    this.processoStateValidator.validaCanConfigure(processo.status_processo);
    this.processoConfigValidator.validateUpdate(dto);

    const id_usuario = this.resolveUserId(user);
    const updated = await this.processosRepository.updateConfig({
      id_processo,
      dto,
      persistAudit: async (tx) => {
        await this.processoLogService.registerUserAction(
          {
            id_usuario,
            id_processo,
            acao: 'PROCESSO_CONFIG_ATUALIZADO',
            descricao: 'Usuário atualizou configuração do processo.',
          },
          tx,
        );
      },
    });

    await this.runPostCommitEffect('emitir configuração atualizada', () =>
      this.processosSocketGateway.emitConfigUpdated({
        id_processo,
        modo_operacao_auxiliar: updated.modo_operacao_auxiliar,
        encerramento_automatico: updated.encerramento_automatico,
        encerramento_versao: updated.encerramento_versao,
        message: 'Configuração do processo atualizada.',
        emitted_at: new Date(),
      }),
    );
    await this.runPostCommitEffect('emitir estado auxiliar atualizado', () =>
      this.emitAuxiliaryStateUpdated(id_processo),
    );

    return this.buildActionResult({
      message: 'Configuração do processo atualizada com sucesso.',
      id_processo,
      status_processo: updated.status_processo,
      data: updated,
    });
  }

  async start(id_processo: number, user: CurrentUserPayload) {
    await this.processoPrecheckService.executarObrigatoriaParaInicio(
      id_processo,
      user,
    );

    const context = await this.getRequiredOperationalContext(id_processo);
    const activeProcessId =
      await this.processosRepository.findActiveProcessId();
    const readiness =
      this.processoMqttOrchestratorService.getHardwareReadiness();
    const enrichedContext = this.enrichContextWithHardwareReadiness(
      context,
      readiness,
    );

    this.processoStartValidator.validateCanStart({
      context: enrichedContext,
      activeProcessId,
    });

    const mqttContext = this.buildMqttCommandContext(enrichedContext);
    const id_usuario = this.resolveUserId(user);
    const updated = await this.processoStartupService.execute({
      id_processo,
      user,
      mqttContext,
      persistAudit: async (tx) => {
        await this.processoEventService.registerProcessStarted(
          {
            id_processo,
            id_usuario,
          },
          tx,
        );
        await this.processoLogService.registerProcessStarted(
          {
            id_processo,
            id_usuario,
          },
          tx,
        );
      },
    });
    await this.runPostCommitEffect('emitir estado auxiliar atualizado', () =>
      this.emitAuxiliaryStateUpdated(id_processo),
    );

    await this.runPostCommitEffect('emitir processo iniciado', () =>
      this.processosSocketGateway.emitProcessStarted({
        id_processo,
        status_processo: updated.status_processo,
        message: 'Processo iniciado.',
        emitted_at: new Date(),
      }),
    );
    await this.emitStatusChanged(
      id_processo,
      context.status_processo,
      updated.status_processo,
      'Status do processo alterado para em execução.',
    );

    return this.buildActionResult({
      message: 'Processo iniciado com sucesso.',
      id_processo,
      status_processo: updated.status_processo,
      data: updated,
    });
  }

  async pause(id_processo: number, user: CurrentUserPayload) {
    const processo = await this.getRequiredProcess(id_processo);
    this.processoStateValidator.validateCanPause(processo.status_processo);
    if (
      processo.status_encerramento_geral ===
        statusencerramentoprocesso.ENCERRANDO ||
      processo.status_encerramento_geral ===
        statusencerramentoprocesso.CONFIRMANDO_HARDWARE
    ) {
      throw new ConflictException(
        'Nao e permitido pausar durante o encerramento geral seguro.',
      );
    }

    const context = await this.getRequiredOperationalContext(id_processo);
    const mqttResult =
      await this.processoMqttOrchestratorService.pauseVacuumOperation(
        this.buildMqttCommandContext(context),
      );
    this.assertMqttOperationSuccess(mqttResult);

    const transition = this.processoLifecycleService.buildPauseTransition({});
    const id_usuario = this.resolveUserId(user);
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
      persistAudit: async (tx) => {
        await this.processoEventService.registerProcessPaused(
          { id_processo, id_usuario },
          tx,
        );
        await this.processoLogService.registerProcessPaused(
          { id_processo, id_usuario },
          tx,
        );
      },
    });
    await this.runPostCommitEffect('emitir estado auxiliar atualizado', () =>
      this.emitAuxiliaryStateUpdated(id_processo),
    );

    await this.runPostCommitEffect('emitir processo pausado', () =>
      this.processosSocketGateway.emitProcessPaused({
        id_processo,
        status_processo: updated.status_processo,
        message: 'Processo pausado.',
        emitted_at: new Date(),
      }),
    );
    await this.emitStatusChanged(
      id_processo,
      processo.status_processo,
      updated.status_processo,
      'Status do processo alterado para pausado.',
    );

    return this.buildActionResult({
      message: 'Processo pausado com sucesso.',
      id_processo,
      status_processo: updated.status_processo,
      data: updated,
    });
  }

  async resume(id_processo: number, user: CurrentUserPayload) {
    const context = await this.getRequiredOperationalContext(id_processo);
    const activeProcessId =
      await this.processosRepository.findActiveProcessId();
    const readiness =
      this.processoMqttOrchestratorService.getHardwareReadiness();
    const enrichedContext = this.enrichContextWithHardwareReadiness(
      context,
      readiness,
    );

    this.processoStartValidator.validateCanResume({
      context: enrichedContext,
      activeProcessId,
    });

    const mqttContext = this.buildMqttCommandContext(enrichedContext);
    const mqttResult =
      await this.processoMqttOrchestratorService.resumeVacuumOperation(
        mqttContext,
      );
    this.assertMqttOperationSuccess(mqttResult);

    const transition = this.processoLifecycleService.buildResumeTransition({});
    const id_usuario = this.resolveUserId(user);
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
      persistAudit: async (tx) => {
        await this.processoEventService.registerProcessResumed(
          { id_processo, id_usuario },
          tx,
        );
        await this.processoLogService.registerProcessResumed(
          { id_processo, id_usuario },
          tx,
        );
      },
    });
    await this.runPostCommitEffect('emitir estado auxiliar atualizado', () =>
      this.emitAuxiliaryStateUpdated(id_processo),
    );

    await this.runPostCommitEffect('emitir processo retomado', () =>
      this.processosSocketGateway.emitProcessResumed({
        id_processo,
        status_processo: updated.status_processo,
        message: 'Processo retomado.',
        emitted_at: new Date(),
      }),
    );
    await this.emitStatusChanged(
      id_processo,
      context.status_processo,
      updated.status_processo,
      'Status do processo alterado para em execução.',
    );

    return this.buildActionResult({
      message: 'Processo retomado com sucesso.',
      id_processo,
      status_processo: updated.status_processo,
      data: updated,
    });
  }

  async finish(
    id_processo: number,
    dto: FinalizarProcessoDTO,
    user: CurrentUserPayload,
  ) {
    const processo = await this.getRequiredProcess(id_processo);
    this.processoStateValidator.validateCanFinish(processo.status_processo);

    const context = await this.getRequiredOperationalContext(id_processo);
    const mqttResult =
      await this.processoMqttOrchestratorService.finishVacuumOperation(
        this.buildMqttCommandContext(context),
      );
    this.assertMqttOperationSuccess(mqttResult);

    const finalizado_em = new Date();
    const rawMetrics =
      await this.processosRepository.findReadingsForMetrics(id_processo);
    const metrics = this.processoMetricsService.calculateProcessMetrics(
      this.buildMetricsInput(rawMetrics, processo, finalizado_em),
    );
    const transition = this.processoLifecycleService.buildFinishTransition({
      tempo_execucao: metrics.tempo_execucao,
      now: finalizado_em,
    });
    const id_usuario = this.resolveUserId(user);
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
      persistAudit: async (tx) => {
        await this.processoEventService.registerProcessFinished(
          {
            id_processo,
            id_usuario,
            tempo_execucao: metrics.tempo_execucao,
          },
          tx,
        );
        await this.processoLogService.registerProcessFinished(
          { id_processo, id_usuario },
          tx,
        );
      },
    });
    await this.runPostCommitEffect('emitir estado auxiliar atualizado', () =>
      this.emitAuxiliaryStateUpdated(id_processo),
    );

    const message = dto.observacao
      ? `Processo finalizado. Observação: ${dto.observacao}`
      : 'Processo finalizado.';

    await this.runPostCommitEffect('emitir processo finalizado', () =>
      this.processosSocketGateway.emitProcessFinished({
        id_processo,
        status_processo: updated.status_processo,
        message,
        emitted_at: new Date(),
      }),
    );
    await this.runPostCommitEffect('emitir métricas atualizadas', () =>
      this.processosSocketGateway.emitMetricsUpdated({
        id_processo,
        metrics,
        emitted_at: new Date(),
      }),
    );
    await this.emitStatusChanged(
      id_processo,
      processo.status_processo,
      updated.status_processo,
      'Status do processo alterado para concluído.',
    );

    return this.buildActionResult({
      message: 'Processo finalizado com sucesso.',
      id_processo,
      status_processo: updated.status_processo,
      data: {
        processo: updated,
        metrics,
      },
    });
  }

  async interrupt(
    id_processo: number,
    dto: InterromperProcessoDTO,
    user: CurrentUserPayload,
  ) {
    const processo = await this.getRequiredProcess(id_processo);
    this.processoStateValidator.validaeCanInterrupt(processo.status_processo);

    const context = await this.getRequiredOperationalContext(id_processo);
    const mqttResult =
      await this.processoMqttOrchestratorService.interruptVacuumOperation(
        this.buildMqttCommandContext(context),
      );
    this.assertMqttOperationSuccess(mqttResult);

    const transition = this.processoLifecycleService.buildInterruptTransition(
      {},
    );
    const id_usuario = this.resolveUserId(user);
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
      persistAudit: async (tx) => {
        await this.processoEventService.registerProcessInterrupted(
          { id_processo, id_usuario, motivo: dto.motivo },
          tx,
        );
        await this.processoLogService.registerProcessInterrupted(
          { id_processo, id_usuario, motivo: dto.motivo },
          tx,
        );
      },
    });
    await this.runPostCommitEffect('emitir estado auxiliar atualizado', () =>
      this.emitAuxiliaryStateUpdated(id_processo),
    );

    await this.runPostCommitEffect('emitir processo interrompido', () =>
      this.processosSocketGateway.emitProcessInterrupted({
        id_processo,
        status_processo: updated.status_processo,
        message: dto.motivo,
        emitted_at: new Date(),
      }),
    );
    await this.emitStatusChanged(
      id_processo,
      processo.status_processo,
      updated.status_processo,
      'Status do processo alterado para interrompido.',
    );

    return this.buildActionResult({
      message: 'Processo interrompido com sucesso.',
      id_processo,
      status_processo: updated.status_processo,
      data: updated,
    });
  }

  async emergencyStop(
    id_processo: number,
    dto: ParadaEmergenciaProcessoDTO,
    user?: CurrentUserPayload,
  ) {
    const processo = await this.getRequiredProcess(id_processo);
    this.assertCanEmergencyStop(processo.status_processo);
    const id_usuario = user ? this.resolveUserId(user) : null;
    const emergency =
      await this.processoGeneralClosureService.requestEmergencyStop({
        id_processo,
        id_usuario,
        motivo: dto.motivo,
        persistAudit: async (tx) => {
          await this.processoEventService.registerEmergencyStop(
            { id_processo, id_usuario, motivo: dto.motivo },
            tx,
          );
          await this.processoLogService.registerEmergencyStop(
            { id_processo, id_usuario, motivo: dto.motivo },
            tx,
          );
        },
      });
    await this.runPostCommitEffect('emitir estado auxiliar atualizado', () =>
      this.emitAuxiliaryStateUpdated(id_processo),
    );

    const message = this.buildEmergencyStopMessage(
      emergency.state,
      emergency.command_failures?.length ?? 0,
    );

    await this.runPostCommitEffect('emitir parada de emergência', () =>
      this.processosSocketGateway.emitEmergencyStop({
        id_processo,
        motivo: dto.motivo,
        message,
        parada_emergencia: emergency.state,
        emitted_at: new Date(),
      }),
    );
    if (emergency.previous_status !== statusprocesso.INTERROMPIDO) {
      await this.emitStatusChanged(
        id_processo,
        emergency.previous_status,
        statusprocesso.INTERROMPIDO,
        'Processo interrompido logicamente; confirmacao do latch e das saidas logicas do controlador em andamento.',
      );
    }
    const updatedProcess = await this.getRequiredProcess(id_processo).catch(
      (error: unknown) => {
        this.logPostCommitFailure(
          'recarregar processo após parada de emergência',
          error,
        );
        return {
          ...processo,
          status_processo: statusprocesso.INTERROMPIDO,
        };
      },
    );

    return this.buildActionResult({
      message,
      id_processo,
      status_processo: statusprocesso.INTERROMPIDO,
      data: {
        processo: updatedProcess,
        parada_emergencia: emergency.state,
        command_results: emergency.command_results ?? [],
        command_failures: emergency.command_failures ?? [],
        idempotent: emergency.idempotent,
      },
    });
  }

  async markFailure(input: { id_processo: number; motivo?: string | null }) {
    const processo = await this.getRequiredProcess(input.id_processo);
    this.processoStateValidator.validateCanFail(processo.status_processo);

    const shutdownResult =
      await this.processoMqttOrchestratorService.shutdownAllActuators(
        input.id_processo,
      );
    const transition = this.processoLifecycleService.buildFailureTransition({});
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo: input.id_processo,
      transition,
      persistAudit: async (tx) => {
        await this.processoEventService.registerProcessFailure(
          {
            id_processo: input.id_processo,
            motivo: input.motivo,
          },
          tx,
        );
        await this.processoLogService.registerProcessFailure(
          {
            id_processo: input.id_processo,
            motivo: input.motivo,
          },
          tx,
        );
      },
    });
    await this.runPostCommitEffect('emitir estado auxiliar atualizado', () =>
      this.emitAuxiliaryStateUpdated(input.id_processo),
    );

    await this.runPostCommitEffect('emitir falha do processo', () =>
      this.processosSocketGateway.emitProcessFailure({
        id_processo: input.id_processo,
        motivo: input.motivo,
        message: input.motivo ?? 'Falha operacional registrada no processo.',
        emitted_at: new Date(),
      }),
    );
    await this.emitStatusChanged(
      input.id_processo,
      processo.status_processo,
      updated.status_processo,
      'Status do processo alterado para falha.',
    );

    return this.buildActionResult({
      message: 'Falha operacional registrada no processo.',
      id_processo: input.id_processo,
      status_processo: updated.status_processo,
      data: {
        processo: updated,
        shutdownResult,
      },
    });
  }

  async getDashboard(id_processo: number) {
    const snapshotAt = new Date();
    const [raw, auxiliaryRaw] = await Promise.all([
      this.processosRepository.findDashboardById(id_processo),
      this.processosRepository.findAuxiliaryStateByProcessId(id_processo),
    ]);

    if (!raw || !auxiliaryRaw) {
      throw new NotFoundException('Processo não encontrado.');
    }

    return this.buildDashboard(
      raw,
      snapshotAt,
      this.buildAuxiliaryState(auxiliaryRaw, snapshotAt),
    );
  }

  async consultarPrechecagem(id_processo: number, user: CurrentUserPayload) {
    return this.processoPrecheckService.consultar(id_processo, user);
  }

  async executarPrechecagem(id_processo: number, user: CurrentUserPayload) {
    return this.processoPrecheckService.executar(id_processo, user);
  }

  async validarAcoplamentoTanque(id_processo: number, id_tanque: number) {
    return this.processoPrecheckService.validarAcoplamentoTanque(
      id_processo,
      id_tanque,
    );
  }

  async validarSensor(id_processo: number, id_sensor: number) {
    return this.processoPrecheckService.validarSensor(id_processo, id_sensor);
  }

  async listarValvulas(id_processo: number) {
    return this.processoPrecheckService.listarValvulas(id_processo);
  }

  async validarValvula(id_processo: number, id_valvula: number) {
    return this.processoPrecheckService.validarValvula(id_processo, id_valvula);
  }

  async abrirValvula(
    id_processo: number,
    id_valvula: number,
    user: CurrentUserPayload,
  ) {
    return this.processoPrecheckService.abrirValvula(
      id_processo,
      id_valvula,
      user,
    );
  }

  async fecharValvula(
    id_processo: number,
    id_valvula: number,
    user: CurrentUserPayload,
  ) {
    return this.processoPrecheckService.fecharValvula(
      id_processo,
      id_valvula,
      user,
    );
  }

  private async getRequiredProcess(
    id_processo: number,
  ): Promise<ProcessoRecord> {
    const processo = await this.processosRepository.findById(id_processo);

    if (!processo) {
      throw new NotFoundException('Processo não encontrado.');
    }

    return processo;
  }

  private async getRequiredOperationalContext(
    id_processo: number,
  ): Promise<ProcessoOperationalContext> {
    const context =
      await this.processosRepository.findOperationalContextById(id_processo);

    if (!context) {
      throw new NotFoundException('Processo não encontrado.');
    }

    return context;
  }

  private enrichContextWithHardwareReadiness(
    context: ProcessoOperationalContext,
    readiness: ProcessoMqttHardwareReadiness,
  ): ProcessoOperationalContext {
    const currentStatus = readiness.currentStatus;

    return {
      ...context,
      safety: {
        ...context.safety,
        hardware: {
          ...context.safety.hardware,
          mqtt_credentials_configured: readiness.credentialsConfigured,
          mqtt_credentials_verified: readiness.credentialsVerified,
          mqtt_credentials_verified_at: readiness.credentialsVerifiedAt,
          mqtt_credentials_failure: readiness.credentialsFailure,
          mqtt_connected: readiness.mqttConnected,
          mqtt_operational: readiness.mqttOperational,
          mqtt_status: readiness.mqttConnected
            ? statusconexaomqtt.CONECTADO
            : statusconexaomqtt.DESCONECTADO,
          esp32_online: readiness.esp32Online,
          esp32_status:
            currentStatus?.currentStatus ??
            (readiness.esp32Online
              ? statusgeralsistema.OPERACIONAL
              : statusgeralsistema.FALHA),
          last_heartbeat_at:
            currentStatus?.lastHeartbeatAt ??
            context.safety.hardware.last_heartbeat_at,
          last_status_at:
            currentStatus?.lastStatusAt ??
            context.safety.hardware.last_status_at,
          last_reading_at:
            currentStatus?.lastReadingAt ??
            context.safety.hardware.last_reading_at,
          communication_ready: readiness.communicationReady,
        },
      },
    };
  }

  private buildMqttCommandContext(
    context: ProcessoOperationalContext,
  ): ProcessoMqttCommandContext {
    return {
      id_processo: context.id_processo,
      tanques: context.tanques.map((tanque) => ({
        id_processo_tanque: tanque.id_processo_tanque,
        id_tanque: tanque.id_tanque,
        nome_tanque: tanque.nome_tanque,
      })),
      sensores: context.tanques.flatMap((tanque) =>
        tanque.sensores.map((sensor) => ({
          id_processo_tanque_sensor: sensor.id_processo_tanque_sensor,
          id_sensor: sensor.id_sensor,
          id_tanque: tanque.id_tanque,
          nome_sensor: sensor.nome_sensor,
        })),
      ),
    };
  }

  private assertMqttOperationSuccess(result: {
    success: boolean;
    message: string;
  }): void {
    if (!result.success) {
      throw new ConflictException(result.message);
    }
  }

  private buildActionResult<TData>(input: {
    message: string;
    id_processo: number;
    status_processo: statusprocesso;
    data?: TData;
  }): ProcessoActionResult<TData> {
    return {
      success: true,
      message: input.message,
      id_processo: input.id_processo,
      status_processo: input.status_processo,
      data: input.data,
    };
  }

  private buildMetricsInput(
    raw: ProcessoMetricsRawData,
    processo: ProcessoRecord,
    finalizado_em: Date,
  ): ProcessoMetricsInput {
    return {
      id_processo: processo.id_processo,
      iniciado_em: processo.iniciado_em,
      finalizado_em,
      tempo_execucao: processo.tempo_execucao,
      total_alarmes: 0,
      total_eventos: 0,
      tanques:
        raw?.processostanques.map((tanque) => ({
          id_processo_tanque: tanque.id_processo_tanque,
          id_tanque: tanque.id_tanque,
          nome_tanque: tanque.tanques.nome,
          vacuo_alvo: this.decimalToRequiredNumber(tanque.vacuo_alvo),
          leituras: tanque.processostanquessensores.flatMap((sensor) =>
            sensor.leiturasensores.map(
              (leitura): ProcessoMetricReading => ({
                id_leitura_sensor: leitura.id_leitura_sensor,
                id_processo_tanque_sensor: sensor.id_processo_tanque_sensor,
                id_processo_tanque: tanque.id_processo_tanque,
                id_tanque: tanque.id_tanque,
                valor_vacuo: this.decimalToNumber(leitura.valor_vacuo),
                leitura_em: leitura.leitura_em,
              }),
            ),
          ),
        })) ?? [],
    };
  }

  private buildAuxiliaryState(
    raw: ProcessoAuxiliaryRawData,
    snapshotAt: Date,
  ): ProcessoAuxiliarState {
    const subsystem = raw.processosauxiliares;

    if (!subsystem) {
      throw new ConflictException(
        'Contrato de estado do subsistema auxiliar nao foi inicializado para o processo.',
      );
    }

    const waitingTanks = raw.processostanques
      .filter(
        (tank) =>
          tank.processostanquesauxiliares?.status_auxilio ===
          statusauxiliotanque.AGUARDANDO,
      )
      .sort((left, right) => {
        const leftState = left.processostanquesauxiliares;
        const rightState = right.processostanquesauxiliares;

        if (!leftState || !rightState) {
          return left.id_processo_tanque - right.id_processo_tanque;
        }

        if (leftState.prioridade !== rightState.prioridade) {
          return rightState.prioridade - leftState.prioridade;
        }

        const leftRequestedAt =
          leftState.solicitado_em?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightRequestedAt =
          rightState.solicitado_em?.getTime() ?? Number.MAX_SAFE_INTEGER;

        return leftRequestedAt === rightRequestedAt
          ? left.id_processo_tanque - right.id_processo_tanque
          : leftRequestedAt - rightRequestedAt;
      });
    const queuePositions = new Map(
      waitingTanks.map((tank, index) => [tank.id_processo_tanque, index + 1]),
    );
    const auxiliaryValves = raw.processostanques.flatMap(
      (tank) => tank.tanques.valvulas,
    );
    const pump = auxiliaryValves[0]?.bombas ?? null;

    return {
      id_processo: raw.id_processo,
      modo_operacao_auxiliar: raw.modo_operacao_auxiliar,
      status_subsistema: subsystem.status_subsistema,
      versao: subsystem.versao,
      tanque_em_atendimento: subsystem.processo_tanque_atual
        ? {
            id_processo_tanque:
              subsystem.processo_tanque_atual.id_processo_tanque,
            id_tanque: subsystem.processo_tanque_atual.id_tanque,
            nome_tanque: subsystem.processo_tanque_atual.tanques.nome,
          }
        : null,
      bomba_auxiliar: pump
        ? {
            id_bomba: pump.id_bomba,
            nome: pump.nome,
            codigo_hardware: pump.codigo_hardware,
            status_configuracao: pump.status_padrao,
            ligada_hardware: pump.ligada_hardware,
            disponivel_hardware: pump.disponivel_hardware,
            ultimo_status_hardware_em: pump.ultimo_status_hardware_em,
            controle: this.buildAuxiliaryControlHolder(
              subsystem.usuario_controle_bomba,
              subsystem.controle_bomba_assumido_em,
              subsystem.controle_bomba_expira_em,
            ),
          }
        : null,
      tanques: raw.processostanques.map((tank) => {
        const state = tank.processostanquesauxiliares;

        if (!state) {
          throw new ConflictException(
            `Contrato auxiliar nao inicializado para o processo/tanque ${tank.id_processo_tanque}.`,
          );
        }

        const valve = tank.tanques.valvulas[0] ?? null;

        return {
          id_processo_tanque_auxiliar: state.id_processo_tanque_auxiliar,
          id_processo_tanque: tank.id_processo_tanque,
          id_tanque: tank.id_tanque,
          nome_tanque: tank.tanques.nome,
          status_auxilio: state.status_auxilio,
          prioridade: state.prioridade,
          posicao_fila: queuePositions.get(tank.id_processo_tanque) ?? null,
          solicitado_em: state.solicitado_em,
          iniciado_em: state.iniciado_em,
          finalizado_em: state.finalizado_em,
          versao: state.versao,
          motivo_bloqueio: state.motivo_bloqueio,
          ultimo_erro: state.ultimo_erro,
          evidencias: {
            avaliacao_iniciada_em: state.avaliacao_iniciada_em,
            avaliacao_finalizada_em: state.avaliacao_finalizada_em,
            vacuo_antes: this.decimalToNumber(state.vacuo_antes_auxilio),
            tendencia_antes: this.decimalToNumber(
              state.tendencia_antes_auxilio,
            ),
            vacuo_durante: this.decimalToNumber(state.vacuo_durante_auxilio),
            tendencia_durante: this.decimalToNumber(
              state.tendencia_durante_auxilio,
            ),
            vacuo_apos: this.decimalToNumber(state.vacuo_apos_auxilio),
            tendencia_apos: this.decimalToNumber(state.tendencia_apos_auxilio),
            melhoria_observada: this.decimalToNumber(state.melhoria_observada),
            melhoria_minima_esperada: this.decimalToNumber(
              state.melhoria_minima_esperada,
            ),
            eficacia_confirmada: state.eficacia_confirmada,
            motivo: state.motivo_avaliacao,
          },
          status_acoplamento:
            tank.tanques.sensoresacoplamentomangueiras?.status_acoplamento ??
            null,
          quantidade_valvulas_auxiliares: tank.tanques.valvulas.length,
          valvula_auxiliar: valve
            ? {
                id_valvula: valve.id_valvula,
                nome: valve.nome_valvula,
                codigo_hardware: valve.codigo_hardware,
                status_valvula: valve.status_valvula,
                ativa: valve.ativo,
                ultimo_acionamento: valve.ultimo_acionamento,
                controle: this.buildAuxiliaryControlHolder(
                  state.usuario_controle_valvula,
                  state.controle_valvula_assumido_em,
                  state.controle_valvula_expira_em,
                ),
              }
            : null,
        };
      }),
      motivo_bloqueio: subsystem.motivo_bloqueio,
      ultimo_erro: subsystem.ultimo_erro,
      atualizado_em: subsystem.atualizado_em,
      snapshot_at: snapshotAt,
    };
  }

  private buildAuxiliaryControlHolder(
    user: { id_usuario: number; nome: string; login: string } | null,
    assumedAt: Date | null,
    expiresAt: Date | null,
  ): ProcessoAuxiliarControlHolder | null {
    if (!user) {
      return null;
    }

    return {
      id_usuario: user.id_usuario,
      nome: user.nome,
      login: user.login,
      assumido_em: assumedAt,
      expira_em: expiresAt,
    };
  }

  private buildDashboard(
    raw: ProcessoDashboardRawData,
    snapshotAt: Date,
    auxiliaryState: ProcessoAuxiliarState,
  ): ProcessoDashboardData {
    const tanques = raw.processo.processostanques.map((tanque) =>
      this.buildDashboardTank(
        tanque,
        raw.processo,
        raw.systemConfig,
        snapshotAt,
      ),
    );
    const currentVacuum = this.average(
      tanques.map((tanque) => tanque.vacuo_atual),
    );
    const stabilizedTanks = tanques.filter(
      (tanque) => tanque.vacuo_estabilizado,
    ).length;
    const alarmCountBySeverity = new Map(
      raw.alarmCounts.map((item) => [item.severidade, item._count._all]),
    );

    return {
      id_processo: raw.processo.id_processo,
      snapshot_at: snapshotAt,
      nome_processo: raw.processo.nome_processo,
      status_processo: raw.processo.status_processo,
      vacuo_alvo: this.decimalToRequiredNumber(raw.processo.vacuo_alvo),
      vacuo_atual: this.roundMetric(currentVacuum),
      tempo_maximo: raw.processo.tempo_maximo,
      tempo_execucao: raw.processo.tempo_execucao,
      iniciado_em: raw.processo.iniciado_em,
      finalizado_em: raw.processo.finalizado_em,
      progresso_percentual:
        tanques.length === 0
          ? 0
          : (this.roundMetric((stabilizedTanks / tanques.length) * 100) ?? 0),
      parada_emergencia: this.buildEmergencyStopState(raw.processo),
      encerramento: this.buildDashboardClosure(raw.processo, tanques),
      subsistema_auxiliar: auxiliaryState,
      tanques,
      alarmes: {
        total: Array.from(alarmCountBySeverity.values()).reduce(
          (total, count) => total + count,
          0,
        ),
        criticos: alarmCountBySeverity.get(severidadealarme.CRITICO) ?? 0,
        medios: alarmCountBySeverity.get(severidadealarme.MEDIO) ?? 0,
        infos: alarmCountBySeverity.get(severidadealarme.INFO) ?? 0,
        ultima_severidade: raw.latestAlarm?.severidade ?? null,
      },
    };
  }

  private buildDashboardTank(
    tank: ProcessoDashboardRawData['processo']['processostanques'][number],
    process: ProcessoDashboardRawData['processo'],
    systemConfig: ProcessoDashboardRawData['systemConfig'],
    snapshotAt: Date,
  ): ProcessoDashboardTanque {
    const readings = tank.processostanquessensores
      .flatMap((sensor) =>
        sensor.leiturasensores.map(
          (reading): ProcessoDashboardReadingPoint => ({
            id_leitura_sensor: reading.id_leitura_sensor,
            id_processo_tanque_sensor: sensor.id_processo_tanque_sensor,
            id_tanque: tank.id_tanque,
            id_sensor: sensor.id_sensor,
            valor_vacuo: this.decimalToRequiredNumber(
              reading.valor_vacuo ?? reading.valor,
            ),
            leitura_em: reading.leitura_em,
            recebido_em: reading.recebido_em,
          }),
        ),
      )
      .sort(
        (left, right) => left.leitura_em.getTime() - right.leitura_em.getTime(),
      );
    const latestReading = readings.at(-1) ?? null;
    const targetVacuum = this.decimalToRequiredNumber(tank.vacuo_alvo);
    const currentVacuum =
      latestReading?.valor_vacuo ?? this.decimalToNumber(tank.vacuo_final);
    const persistedEfficiency = this.decimalToNumber(tank.eficiencia);

    return {
      id_processo_tanque: tank.id_processo_tanque,
      id_tanque: tank.id_tanque,
      nome_tanque: tank.tanques.nome,
      status_tanque_processo: tank.status_tanque_processo,
      vacuo_atingido: tank.vacuo_atingido,
      vacuo_estabilizado: tank.vacuo_estabilizado,
      vacuo_alvo: targetVacuum,
      vacuo_atual: currentVacuum,
      vacuo_inicial: this.decimalToNumber(tank.vacuo_inicial),
      vacuo_final: this.decimalToNumber(tank.vacuo_final),
      vacuo_medio: this.decimalToNumber(tank.vacuo_medio),
      eficiencia:
        persistedEfficiency ??
        this.calculateEfficiency(currentVacuum, targetVacuum),
      iniciado_em: tank.iniciado_em,
      finalizado_em: tank.finalizado_em,
      ultima_leitura_em: latestReading?.leitura_em ?? null,
      ultima_leitura_recebida_em: latestReading?.recebido_em ?? null,
      total_sensores: tank.processostanquessensores.length,
      total_leituras: tank.processostanquessensores.reduce(
        (total, sensor) => total + sensor._count.leiturasensores,
        0,
      ),
      encerramento: this.buildDashboardTankClosure(
        tank,
        process,
        currentVacuum,
      ),
      estagnacao: this.buildDashboardStagnation(
        tank,
        process,
        systemConfig,
        snapshotAt,
      ),
      leituras: readings,
    };
  }

  private buildDashboardClosure(
    process: ProcessoDashboardRawData['processo'],
    tanks: ProcessoDashboardTanque[],
  ): ProcessoDashboardData['encerramento'] {
    const completed = tanks.filter(
      (tank) => tank.encerramento.status === statusencerramentotanque.CONCLUIDO,
    ).length;
    const ready = tanks.filter(
      (tank) =>
        tank.encerramento.status ===
        statusencerramentotanque.PRONTO_PARA_ENCERRAR,
    ).length;
    const waitingManual = tanks.filter(
      (tank) =>
        tank.encerramento.status ===
        statusencerramentotanque.AGUARDANDO_ACAO_MANUAL,
    ).length;
    const canDetach =
      process.status_processo === statusprocesso.CONCLUIDO &&
      process.fase_processo === faseprocesso.FINALIZADO &&
      tanks.length > 0 &&
      completed === tanks.length;

    return {
      habilitado: process.encerramento_automatico,
      fase_processo: process.fase_processo,
      pode_desacoplar: canDetach,
      geral: {
        status: process.status_encerramento_geral,
        etapa: process.etapa_encerramento_geral,
        automatico: process.encerramento_automatico,
        pronto_para_iniciar:
          !process.parada_emergencia &&
          tanks.length > 0 &&
          completed === tanks.length &&
          (process.status_encerramento_geral ===
            statusencerramentoprocesso.AGUARDANDO_ACAO_MANUAL ||
            process.status_encerramento_geral ===
              statusencerramentoprocesso.FALHA),
        aguardando_acao_manual:
          !process.parada_emergencia &&
          process.status_encerramento_geral ===
            statusencerramentoprocesso.AGUARDANDO_ACAO_MANUAL,
        hardware_confirmado:
          process.status_encerramento_geral ===
          statusencerramentoprocesso.CONCLUIDO,
        iniciado_em: process.encerramento_geral_iniciado_em,
        finalizado_em: process.encerramento_geral_finalizado_em,
        confirmacao_iniciada_em:
          process.encerramento_geral_confirmacao_iniciada_em,
        proxima_tentativa_em: process.encerramento_geral_proxima_tentativa_em,
        tentativa: process.encerramento_geral_tentativa,
        comando_tentativas: process.encerramento_geral_comando_tentativas,
        ultimo_erro: process.encerramento_geral_ultimo_erro,
        versao: process.encerramento_versao,
      },
      total_tanques: tanks.length,
      tanques_concluidos: completed,
      tanques_prontos: ready,
      tanques_aguardando_acao_manual: waitingManual,
      tanques_pendentes: Math.max(0, tanks.length - completed),
      versao: process.encerramento_versao,
      parametros: {
        tolerancia_vacuo_percentual: this.decimalToRequiredNumber(
          process.encerramento_tolerancia_vacuo_percentual,
        ),
        limite_seguranca_vacuo: this.decimalToRequiredNumber(
          process.encerramento_limite_seguranca_vacuo,
        ),
        tempo_estabilizacao_segundos:
          process.encerramento_tempo_estabilizacao_segundos,
        cobertura_minima_percentual: this.decimalToRequiredNumber(
          process.encerramento_estabilizacao_cobertura_minima_percentual,
        ),
        intervalo_leitura_esperado_ms:
          process.encerramento_intervalo_leitura_esperado_ms,
        timeout_leitura_sensor_ms:
          process.encerramento_timeout_leitura_sensor_ms,
        tempo_retencao_segundos: process.encerramento_tempo_retencao_segundos,
        perda_vacuo_maxima_retencao: this.decimalToRequiredNumber(
          process.encerramento_perda_vacuo_maxima_retencao,
        ),
      },
    };
  }

  private buildEmergencyStopState(
    process: ProcessoDashboardRawData['processo'],
  ): ProcessoParadaEmergenciaState {
    if (!process.parada_emergencia) {
      return {
        ativa: false,
        status: 'INATIVA',
        etapa: process.etapa_encerramento_geral,
        hardware_confirmado: false,
        nivel_confirmacao: 'NAO_CONFIRMADO',
        latch_emergencia_confirmado: false,
        saidas_controlador_confirmadas: false,
        feedback_mecanico_disponivel: false,
        requer_intervencao: false,
        solicitada_em: null,
        confirmada_em: null,
        proxima_tentativa_em: null,
        tentativa: 0,
        comando_tentativas: 0,
        ultimo_erro: null,
        versao: process.encerramento_versao,
      };
    }

    const status =
      process.status_encerramento_geral === statusencerramentoprocesso.CONCLUIDO
        ? 'CONFIRMADA'
        : process.status_encerramento_geral === statusencerramentoprocesso.FALHA
          ? 'FALHA'
          : process.status_encerramento_geral ===
              statusencerramentoprocesso.CONFIRMANDO_HARDWARE
            ? 'AGUARDANDO_CONFIRMACAO'
            : 'ACIONANDO';

    return {
      ativa: true,
      status,
      etapa: process.etapa_encerramento_geral,
      hardware_confirmado: status === 'CONFIRMADA',
      nivel_confirmacao:
        status === 'CONFIRMADA' ? 'CONTROLADOR_CONFIRMADO' : 'NAO_CONFIRMADO',
      latch_emergencia_confirmado: status === 'CONFIRMADA',
      saidas_controlador_confirmadas: status === 'CONFIRMADA',
      feedback_mecanico_disponivel: false,
      requer_intervencao: status === 'FALHA',
      solicitada_em: process.encerramento_geral_iniciado_em,
      confirmada_em: process.encerramento_geral_finalizado_em,
      proxima_tentativa_em: process.encerramento_geral_proxima_tentativa_em,
      tentativa: process.encerramento_geral_tentativa,
      comando_tentativas: process.encerramento_geral_comando_tentativas,
      ultimo_erro: process.encerramento_geral_ultimo_erro,
      versao: process.encerramento_versao,
    };
  }

  private buildDashboardTankClosure(
    tank: ProcessoDashboardRawData['processo']['processostanques'][number],
    process: ProcessoDashboardRawData['processo'],
    currentVacuum: number | null,
  ): ProcessoDashboardTanque['encerramento'] {
    const coupling = tank.tanques.sensoresacoplamentomangueiras;
    const coupled =
      coupling != null
        ? coupling.status_acoplamento === StatusAcoplamentoMangueira.ACOPLADA &&
          coupling.sinal_detectado
        : null;
    const safetyLimit = this.decimalToRequiredNumber(
      process.encerramento_limite_seguranca_vacuo,
    );
    const canDetachProcess =
      process.status_processo === statusprocesso.CONCLUIDO &&
      process.fase_processo === faseprocesso.FINALIZADO;

    return {
      status: tank.status_encerramento,
      etapa: tank.etapa_encerramento,
      automatico: process.encerramento_automatico,
      pronto_para_encerrar:
        tank.status_encerramento ===
        statusencerramentotanque.PRONTO_PARA_ENCERRAR,
      aguardando_acao_manual:
        tank.status_encerramento ===
        statusencerramentotanque.AGUARDANDO_ACAO_MANUAL,
      pode_desacoplar:
        canDetachProcess &&
        tank.status_encerramento === statusencerramentotanque.CONCLUIDO,
      mangueira_acoplada: coupled,
      iniciado_em: tank.encerramento_iniciado_em,
      isolado_em: tank.isolado_em,
      retencao_iniciada_em: tank.retencao_iniciada_em,
      retencao_finalizada_em: tank.retencao_finalizada_em,
      vacuo_isolamento: this.decimalToNumber(tank.vacuo_isolamento),
      perda_vacuo_retencao: this.decimalToNumber(tank.perda_vacuo_retencao),
      motivo_bloqueio: tank.motivo_bloqueio_encerramento,
      versao: tank.encerramento_versao,
      tentativa: tank.encerramento_tentativa,
      comando_tentativas: tank.encerramento_comando_tentativas,
      proxima_tentativa_em: tank.encerramento_proxima_tentativa_em,
      estabilizacao: {
        tempo_necessario_segundos:
          process.encerramento_tempo_estabilizacao_segundos,
        cobertura_minima_percentual: this.decimalToRequiredNumber(
          process.encerramento_estabilizacao_cobertura_minima_percentual,
        ),
        leituras_esperadas: tank.estabilizacao_leituras_esperadas,
        leituras_observadas: tank.estabilizacao_leituras_observadas,
        cobertura_atual_percentual: this.decimalToRequiredNumber(
          tank.estabilizacao_cobertura_percentual,
        ),
        maior_intervalo_ms: tank.estabilizacao_maior_intervalo_ms,
        timeout_leitura_ms: process.encerramento_timeout_leitura_sensor_ms,
        continuidade_aprovada:
          tank.estabilizacao_maior_intervalo_ms <=
          process.encerramento_timeout_leitura_sensor_ms,
      },
      retencao: {
        tempo_necessario_segundos: process.encerramento_tempo_retencao_segundos,
        perda_maxima_permitida: this.decimalToRequiredNumber(
          process.encerramento_perda_vacuo_maxima_retencao,
        ),
      },
      seguranca: {
        limite_vacuo: safetyLimit,
        limite_excedido:
          currentVacuum !== null &&
          Math.abs(currentVacuum) > Math.abs(safetyLimit),
      },
    };
  }

  private buildDashboardStagnation(
    tank: ProcessoDashboardRawData['processo']['processostanques'][number],
    process: ProcessoDashboardRawData['processo'],
    systemConfig: ProcessoDashboardRawData['systemConfig'],
    snapshotAt: Date,
  ): ProcessoDashboardTanque['estagnacao'] {
    const windowSeconds =
      process.estagnacao_janela_segundos ??
      systemConfig?.estagnacao_janela_segundos ??
      DEFAULT_STAGNATION_WINDOW_SECONDS;
    const minimumVariationBase =
      this.decimalToNumber(process.estagnacao_variacao_minima) ??
      (systemConfig
        ? this.decimalToRequiredNumber(systemConfig.estagnacao_variacao_minima)
        : DEFAULT_STAGNATION_MIN_VARIATION);
    const minimumVariation =
      this.decimalToNumber(tank.estagnacao_variacao_minima_ajustada) ??
      minimumVariationBase;
    const minimumReadings =
      process.estagnacao_leituras_minimas ??
      systemConfig?.estagnacao_leituras_minimas ??
      DEFAULT_STAGNATION_MIN_READINGS;
    const consecutiveWindows =
      process.estagnacao_janelas_consecutivas ??
      systemConfig?.estagnacao_janelas_consecutivas ??
      DEFAULT_STAGNATION_CONSECUTIVE_WINDOWS;
    const startedAt = tank.estagnacao_iniciada_em;
    const durationSeconds = startedAt
      ? Math.max(
          0,
          Math.floor((snapshotAt.getTime() - startedAt.getTime()) / 1000),
        )
      : 0;

    return {
      status: tank.status_estagnacao,
      suspeita: tank.status_estagnacao === statusestagnacao.SUSPEITA,
      detectada: tank.status_estagnacao === statusestagnacao.DETECTADA,
      iniciada_em: startedAt,
      detectada_em: tank.estagnacao_detectada_em,
      ultima_avaliacao_em: tank.estagnacao_ultima_avaliacao_em,
      duracao_segundos: durationSeconds,
      variacao_vacuo: this.decimalToNumber(tank.estagnacao_variacao_vacuo),
      janela_segundos: windowSeconds,
      variacao_minima_esperada: minimumVariation,
      variacao_minima_base: minimumVariationBase,
      leituras_janela: tank.estagnacao_leituras_janela,
      leituras_minimas: minimumReadings,
      janelas_sem_progresso: tank.estagnacao_janelas_sem_progresso,
      janelas_consecutivas_necessarias: consecutiveWindows,
      id_alarme_ativo: tank.alarmes[0]?.id_alarme ?? null,
      mensagem:
        tank.estagnacao_motivo_decisao ??
        this.stagnationMessage(tank.status_estagnacao),
      evidencias: {
        fator_volume: this.decimalToNumber(tank.estagnacao_fator_volume),
        fator_tanques_ativos: this.decimalToNumber(
          tank.estagnacao_fator_tanques_ativos,
        ),
        fator_proximidade_alvo: this.decimalToNumber(
          tank.estagnacao_fator_proximidade_alvo,
        ),
        volume_tanque: this.decimalToNumber(tank.estagnacao_volume_tanque),
        volume_medio_tanques_ativos: this.decimalToNumber(
          tank.estagnacao_volume_medio_tanques_ativos,
        ),
        tanques_ativos: tank.estagnacao_tanques_ativos,
        vacuo_atual: this.decimalToNumber(tank.estagnacao_vacuo_atual),
        distancia_alvo: this.decimalToNumber(tank.estagnacao_distancia_alvo),
        tempo_bomba_principal_segundos:
          tank.estagnacao_tempo_bomba_principal_segundos,
        motivo_decisao: tank.estagnacao_motivo_decisao,
      },
    };
  }

  private stagnationMessage(status: statusestagnacao): string {
    if (status === statusestagnacao.DETECTADA) {
      return 'Estagnacao de vacuo detectada; verificar tanque, mangueira, valvula e bomba.';
    }

    if (status === statusestagnacao.SUSPEITA) {
      return 'Progresso de vacuo abaixo do minimo; aguardando confirmacao.';
    }

    return 'Progresso de vacuo normal ou detector aguardando janela valida.';
  }

  private calculateEfficiency(
    currentVacuum: number | null,
    targetVacuum: number,
  ): number | null {
    if (currentVacuum === null || targetVacuum === 0) {
      return null;
    }

    return this.roundMetric(
      (Math.abs(currentVacuum) / Math.abs(targetVacuum)) * 100,
    );
  }

  private average(values: Array<number | null>): number | null {
    const validValues = values.filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );

    if (validValues.length === 0) {
      return null;
    }

    return (
      validValues.reduce((total, value) => total + value, 0) /
      validValues.length
    );
  }

  private roundMetric(value: number | null, decimals = 2): number | null {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }

    const factor = 10 ** decimals;

    return Math.round(value * factor) / factor;
  }

  private assertCanEmergencyStop(status: statusprocesso): void {
    if (status === statusprocesso.CONCLUIDO) {
      throw new BadRequestException(
        'Processos concluidos nao podem receber nova parada de emergencia.',
      );
    }
  }

  private buildEmergencyStopMessage(
    state: ProcessoParadaEmergenciaState,
    commandFailureCount: number,
  ): string {
    if (state.hardware_confirmado) {
      return 'Parada de emergencia confirmada pelo controlador: latch ativo, bombas comandadas desligadas e valvulas comandadas fechadas. Feedback mecanico dedicado nao esta disponivel.';
    }

    if (state.requer_intervencao) {
      return 'Processo interrompido logicamente, mas o controlador nao confirmou o latch e todas as saidas logicas no estado comandado; intervencao tecnica obrigatoria.';
    }

    if (commandFailureCount > 0) {
      return 'Processo interrompido logicamente; houve falha em comando MQTT e a API aguarda um snapshot novo e completo do controlador ou uma nova tentativa.';
    }

    return 'Processo interrompido logicamente; comandos enviados e confirmacao das saidas do controlador ainda pendente.';
  }

  private async emitStatusChanged(
    id_processo: number,
    previous_status: statusprocesso,
    status_processo: statusprocesso,
    message: string,
  ): Promise<void> {
    await this.runPostCommitEffect('emitir alteração de status', () =>
      this.processosSocketGateway.emitStatusChanged({
        id_processo,
        previous_status,
        status_processo,
        message,
        emitted_at: new Date(),
      }),
    );
  }

  private async emitAuxiliaryStateUpdated(
    id_processo: number,
  ): Promise<ProcessoAuxiliarState> {
    const auxiliaryState = await this.getAuxiliaryState(id_processo);

    await this.runPostCommitEffect('publicar snapshot auxiliar', () =>
      this.processosSocketGateway.emitAuxiliaryStateUpdated({
        id_processo,
        auxiliary_state: auxiliaryState,
        emitted_at: new Date(),
      }),
    );

    return auxiliaryState;
  }

  private async runAuxiliaryMutation<T extends object>(
    id_processo: number,
    operation: () => Promise<T>,
  ): Promise<
    T & {
      auxiliary_state: ProcessoAuxiliarState | null;
      auxiliary_state_warning?: string;
    }
  > {
    let result: T;

    try {
      result = await operation();
    } catch (error) {
      await this.runPostCommitEffect(
        'emitir estado auxiliar após comando recusado',
        () => this.emitAuxiliaryStateUpdated(id_processo),
      );
      throw error;
    }

    try {
      const auxiliaryState = await this.emitAuxiliaryStateUpdated(id_processo);

      return {
        ...result,
        auxiliary_state: auxiliaryState,
      };
    } catch (error) {
      this.logPostCommitFailure(
        'carregar estado auxiliar após operação confirmada',
        error,
      );

      return {
        ...result,
        auxiliary_state: null,
        auxiliary_state_warning:
          'Operação concluída, mas o snapshot auxiliar não pôde ser carregado; recarregue o estado pela rota HTTP.',
      };
    }
  }

  private async runPostCommitEffect(
    description: string,
    effect: () => void | Promise<unknown>,
  ): Promise<void> {
    try {
      await effect();
    } catch (error) {
      this.logPostCommitFailure(description, error);
    }
  }

  private logPostCommitFailure(description: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Operação principal persistida, mas falhou ao ${description}: ${message}`,
    );
  }

  private resolveUserId(user: CurrentUserPayload): number {
    if (!user.sub) {
      throw new BadRequestException('Usuário autenticado inválido.');
    }

    return user.sub;
  }

  private decimalToNumber(
    value: DecimalLike | number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    return value.toNumber();
  }

  private decimalToRequiredNumber(value: DecimalLike | number): number {
    if (typeof value === 'number') {
      return value;
    }

    return value.toNumber();
  }
}
