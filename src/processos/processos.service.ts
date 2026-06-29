import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  statusconexaomqtt,
  statusgeralsistema,
  statusprocesso,
} from '@prisma/client';
import {
  CreateProcessoDTO,
  FinalizarProcessoDTO,
  InterromperProcessoDTO,
  ListProcessosQueryDTO,
  ParadaEmergenciaProcessoDTO,
  UpdateProcessoConfigDTO,
} from './dto';
import { ProcessoEventService } from './events';
import { CurrentUserPayload, ProcessoOperationalContext } from './interfaces';
import { ProcessoLifecycleService } from './lifecycle';
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
  constructor(
    private readonly processosRepository: ProcessosRepository,
    private readonly processoConfigValidator: ProcessoConfigValidator,
    private readonly processoStateValidator: ProcessoStateValidator,
    private readonly processoStartValidator: ProcessoStartValidator,
    private readonly processoLifecycleService: ProcessoLifecycleService,
    private readonly processoMetricsService: ProcessoMetricsService,
    private readonly processoEventService: ProcessoEventService,
    private readonly processoLogService: ProcessoLogService,
    private readonly processoMqttOrchestratorService: ProcessoMqttOrchestratorService,
    private readonly processosSocketGateway: ProcessosSocketGateway,
    private readonly processoPrecheckService: ProcessoPrecheckService,
  ) {}

  async create(dto: CreateProcessoDTO, user: CurrentUserPayload) {
    this.processoConfigValidator.validateCreate(dto);

    const id_usuario = this.resolveUserId(user);
    const processo = await this.processosRepository.createWithRelations({
      dto,
      id_usuario,
    });

    await this.processoEventService.registerProcessCreated({
      id_processo: processo.id_processo,
      id_usuario,
      nome_processo: processo.nome_processo,
    });
    await this.processoLogService.registerUserAction({
      id_usuario,
      id_processo: processo.id_processo,
      acao: 'PROCESSO_CRIADO',
      descricao: 'Usuário criou processo.',
    });

    this.processosSocketGateway.emitProcessCreated({
      id_processo: processo.id_processo,
      status_processo: processo.status_processo,
      message: 'Processo criado.',
      emitted_at: new Date(),
    });

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

  async updateConfig(
    id_processo: number,
    dto: UpdateProcessoConfigDTO,
    user: CurrentUserPayload,
  ) {
    const processo = await this.getRequiredProcess(id_processo);

    this.processoStateValidator.validaCanConfigure(processo.status_processo);
    this.processoConfigValidator.validateUpdate(dto);

    const updated = await this.processosRepository.updateConfig({
      id_processo,
      dto,
    });
    const id_usuario = this.resolveUserId(user);

    await this.processoEventService.registerConfigUpdated({
      id_processo,
      id_usuario,
    });
    await this.processoLogService.registerUserAction({
      id_usuario,
      id_processo,
      acao: 'PROCESSO_CONFIG_ATUALIZADO',
      descricao: 'Usuário atualizou configuração do processo.',
    });

    this.processosSocketGateway.emitConfigUpdated({
      id_processo,
      message: 'Configuração do processo atualizada.',
      emitted_at: new Date(),
    });

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
    const prepareResult =
      await this.processoMqttOrchestratorService.prepareHardwareForStart(
        mqttContext,
      );
    this.assertMqttOperationSuccess(prepareResult);

    const startResult =
      await this.processoMqttOrchestratorService.startVacuumOperation(
        mqttContext,
      );
    this.assertMqttOperationSuccess(startResult);

    const transition = this.processoLifecycleService.buildStartTransition({});
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
    });
    const id_usuario = this.resolveUserId(user);

    await this.processoEventService.registerProcessStarted({
      id_processo,
      id_usuario,
    });
    await this.processoLogService.registerProcessStarted({
      id_processo,
      id_usuario,
    });

    this.processosSocketGateway.emitProcessStarted({
      id_processo,
      status_processo: updated.status_processo,
      message: 'Processo iniciado.',
      emitted_at: new Date(),
    });
    this.emitStatusChanged(
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

    const context = await this.getRequiredOperationalContext(id_processo);
    const mqttResult =
      await this.processoMqttOrchestratorService.pauseVacuumOperation(
        this.buildMqttCommandContext(context),
      );
    this.assertMqttOperationSuccess(mqttResult);

    const transition = this.processoLifecycleService.buildPauseTransition({});
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
    });
    const id_usuario = this.resolveUserId(user);

    await this.processoEventService.registerProcessPaused({
      id_processo,
      id_usuario,
    });
    await this.processoLogService.registerProcessPaused({
      id_processo,
      id_usuario,
    });

    this.processosSocketGateway.emitProcessPaused({
      id_processo,
      status_processo: updated.status_processo,
      message: 'Processo pausado.',
      emitted_at: new Date(),
    });
    this.emitStatusChanged(
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
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
    });
    const id_usuario = this.resolveUserId(user);

    await this.processoEventService.registerProcessResumed({
      id_processo,
      id_usuario,
    });
    await this.processoLogService.registerProcessResumed({
      id_processo,
      id_usuario,
    });

    this.processosSocketGateway.emitProcessResumed({
      id_processo,
      status_processo: updated.status_processo,
      message: 'Processo retomado.',
      emitted_at: new Date(),
    });
    this.emitStatusChanged(
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
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
    });
    const id_usuario = this.resolveUserId(user);

    await this.processoEventService.registerProcessFinished({
      id_processo,
      id_usuario,
      tempo_execucao: metrics.tempo_execucao,
    });
    await this.processoLogService.registerProcessFinished({
      id_processo,
      id_usuario,
    });

    const message = dto.observacao
      ? `Processo finalizado. Observação: ${dto.observacao}`
      : 'Processo finalizado.';

    this.processosSocketGateway.emitProcessFinished({
      id_processo,
      status_processo: updated.status_processo,
      message,
      emitted_at: new Date(),
    });
    this.processosSocketGateway.emitMetricsUpdated({
      id_processo,
      metrics,
      emitted_at: new Date(),
    });
    this.emitStatusChanged(
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
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
    });
    const id_usuario = this.resolveUserId(user);

    await this.processoEventService.registerProcessInterrupted({
      id_processo,
      id_usuario,
      motivo: dto.motivo,
    });
    await this.processoLogService.registerProcessInterrupted({
      id_processo,
      id_usuario,
      motivo: dto.motivo,
    });

    this.processosSocketGateway.emitProcessInterrupted({
      id_processo,
      status_processo: updated.status_processo,
      message: dto.motivo,
      emitted_at: new Date(),
    });
    this.emitStatusChanged(
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

    const emergencyResult =
      await this.processoMqttOrchestratorService.executeEmergencyStop({
        id_processo,
        motivo: dto.motivo,
      });
    const shutdownResult =
      await this.processoMqttOrchestratorService.shutdownAllActuators(
        id_processo,
      );

    const transition =
      this.processoLifecycleService.buildEmergencyStopTransition({});
    const updated = await this.processosRepository.applyLifecycleTransition({
      id_processo,
      transition,
    });
    const id_usuario = user ? this.resolveUserId(user) : null;

    await this.processoEventService.registerEmergencyStop({
      id_processo,
      id_usuario,
      motivo: dto.motivo,
    });
    await this.processoLogService.registerEmergencyStop({
      id_processo,
      id_usuario,
      motivo: dto.motivo,
    });

    const message = this.buildEmergencyStopMessage(
      emergencyResult.success,
      shutdownResult.success,
    );

    this.processosSocketGateway.emitEmergencyStop({
      id_processo,
      motivo: dto.motivo,
      message,
      emitted_at: new Date(),
    });
    this.emitStatusChanged(
      id_processo,
      processo.status_processo,
      updated.status_processo,
      'Status do processo alterado por parada de emergência.',
    );

    return this.buildActionResult({
      message,
      id_processo,
      status_processo: updated.status_processo,
      data: {
        processo: updated,
        emergencyResult,
        shutdownResult,
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
    });

    await this.processoEventService.registerProcessFailure({
      id_processo: input.id_processo,
      motivo: input.motivo,
    });
    await this.processoLogService.registerProcessFailure({
      id_processo: input.id_processo,
      motivo: input.motivo,
    });

    this.processosSocketGateway.emitProcessFailure({
      id_processo: input.id_processo,
      motivo: input.motivo,
      message: input.motivo ?? 'Falha operacional registrada no processo.',
      emitted_at: new Date(),
    });
    this.emitStatusChanged(
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
    return this.findById(id_processo);
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
          mqtt_connected: readiness.mqttConnected,
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

  private assertCanEmergencyStop(status: statusprocesso): void {
    if (
      status === statusprocesso.CONCLUIDO ||
      status === statusprocesso.INTERROMPIDO ||
      status === statusprocesso.FALHA
    ) {
      throw new BadRequestException(
        'Processos finalizados, interrompidos ou em falha não podem receber nova parada de emergência.',
      );
    }
  }

  private buildEmergencyStopMessage(
    emergencySuccess: boolean,
    shutdownSuccess: boolean,
  ): string {
    if (emergencySuccess && shutdownSuccess) {
      return 'Parada de emergência executada com segurança.';
    }

    if (!emergencySuccess && shutdownSuccess) {
      return 'Parada de emergência registrada, mas o comando MQTT de emergência falhou; atuadores foram desligados.';
    }

    if (emergencySuccess && !shutdownSuccess) {
      return 'Parada de emergência executada, mas houve falha ao desligar todos os atuadores.';
    }

    return 'Parada de emergência registrada, mas houve falha nos comandos MQTT de segurança.';
  }

  private emitStatusChanged(
    id_processo: number,
    previous_status: statusprocesso,
    status_processo: statusprocesso,
    message: string,
  ): void {
    this.processosSocketGateway.emitStatusChanged({
      id_processo,
      previous_status,
      status_processo,
      message,
      emitted_at: new Date(),
    });
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
