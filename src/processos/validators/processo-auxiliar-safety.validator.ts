import { ConflictException, Injectable } from '@nestjs/common';
import {
  modooperacaoauxiliar,
  statusauxiliotanque,
  statusbomba,
  statusencerramentoprocesso,
  statusprocesso,
  statussubsistemaauxiliar,
  statustanqueprocesso,
  StatusAcoplamentoMangueira,
  StatusValvula,
  tipobomba,
} from '@prisma/client';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import {
  ProcessoAuxiliarSafetyAction,
  ProcessoAuxiliarSafetyCheck,
  ProcessoAuxiliarSafetyOrigin,
  ProcessoAuxiliarSafetyRequest,
  ProcessoAuxiliarSafetyResult,
} from '../interfaces';
import { ProcessoMqttOrchestratorService } from '../mqtt';
import { ProcessosRepository } from '../processos.repository';

type AuxiliarySafetyContext = NonNullable<
  Awaited<
    ReturnType<ProcessosRepository['findAuxiliarySafetyContextByProcessId']>
  >
>;

type AuxiliarySafetyTank = AuxiliarySafetyContext['processostanques'][number];
type AuxiliarySafetyValve =
  AuxiliarySafetyTank['tanques']['valvulas'][number] & {
    id_processo_tanque: number;
  };

const ENERGIZING_ACTIONS = new Set<ProcessoAuxiliarSafetyAction>([
  ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
  ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
]);

const PUMP_ACTIONS = new Set<ProcessoAuxiliarSafetyAction>([
  ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
  ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
]);

const VALVE_ACTIONS = new Set<ProcessoAuxiliarSafetyAction>([
  ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
  ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
]);

const ACTIVE_TANK_STATES = new Set<statustanqueprocesso>([
  statustanqueprocesso.EM_EXECUCAO,
  statustanqueprocesso.GERANDO_VACUO,
  statustanqueprocesso.VACUO_ATINGIDO,
  statustanqueprocesso.VACUO_ESTABILIZADO,
]);

const ELIGIBLE_AUXILIARY_STATES = new Set<statusauxiliotanque>([
  statusauxiliotanque.ELEGIVEL,
  statusauxiliotanque.AGUARDANDO,
  statusauxiliotanque.EM_ATENDIMENTO,
]);

@Injectable()
export class ProcessoAuxiliarSafetyValidator {
  constructor(
    private readonly repository: ProcessosRepository,
    private readonly mqttOrchestrator: ProcessoMqttOrchestratorService,
    private readonly mqttConfigService: MqttConfigService,
  ) {}

  async evaluate(
    request: ProcessoAuxiliarSafetyRequest,
  ): Promise<ProcessoAuxiliarSafetyResult> {
    const evaluatedAt = request.evaluated_at ?? new Date();
    const [context, telemetryTimeoutMs] = await Promise.all([
      this.repository.findAuxiliarySafetyContextByProcessId(
        request.id_processo,
      ),
      this.resolveTelemetryTimeoutMs(),
    ]);

    if (!context) {
      return this.buildMissingProcessResult(request, evaluatedAt);
    }

    const checks: ProcessoAuxiliarSafetyCheck[] = [];
    const subsystem = context.processosauxiliares;
    const targetTank = this.findTargetTank(context, request);
    const allValves = this.listProcessValves(context);
    const auxiliaryValves = allValves.filter(
      (valve) => valve.bombas.tipo_bomba === tipobomba.AUXILIAR,
    );
    const targetAuxiliaryValves = targetTank
      ? auxiliaryValves.filter(
          (valve) => valve.id_processo_tanque === targetTank.id_processo_tanque,
        )
      : [];
    const targetValve = targetAuxiliaryValves[0] ?? null;
    const auxiliaryPumps = this.uniquePumps(auxiliaryValves);
    const principalPumps = this.uniquePumps(
      allValves.filter(
        (valve) => valve.bombas.tipo_bomba === tipobomba.PRINCIPAL,
      ),
    );
    const auxiliaryPump = auxiliaryPumps[0] ?? null;
    const principalPump = principalPumps[0] ?? null;
    const readiness = this.mqttOrchestrator.getHardwareReadiness();
    const isEnergizing = ENERGIZING_ACTIONS.has(request.action);

    this.addCheck(
      checks,
      readiness.communicationReady,
      'HARDWARE_COMMUNICATION_READY',
      readiness.communicationReady
        ? 'Comunicação MQTT/ESP32 pronta.'
        : 'Comando bloqueado: MQTT ou ESP32 indisponível.',
    );
    this.addModeChecks(checks, context, request, isEnergizing);
    this.addVersionChecks(checks, subsystem, targetTank, request);

    if (isEnergizing) {
      this.addEnergizingChecks(checks, context, targetTank);
    }

    this.addCheck(
      checks,
      auxiliaryPumps.length === 1,
      'AUXILIARY_PUMP_UNIQUE',
      auxiliaryPumps.length === 1
        ? 'Bomba auxiliar identificada de forma única.'
        : `Esperada uma bomba auxiliar no processo; encontradas ${auxiliaryPumps.length}.`,
    );

    if (PUMP_ACTIONS.has(request.action)) {
      this.addOwnershipCheck(
        checks,
        request,
        subsystem?.id_usuario_controle_bomba ?? null,
        subsystem?.controle_bomba_expira_em ?? null,
        evaluatedAt,
        'BOMBA',
        context.modo_operacao_auxiliar,
      );
    }

    if (
      VALVE_ACTIONS.has(request.action) ||
      request.action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR
    ) {
      this.addValveTargetChecks(checks, targetTank, targetAuxiliaryValves);
    }

    if (
      VALVE_ACTIONS.has(request.action) ||
      request.action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR
    ) {
      this.addOwnershipCheck(
        checks,
        request,
        targetTank?.processostanquesauxiliares?.id_usuario_controle_valvula ??
          null,
        targetTank?.processostanquesauxiliares?.controle_valvula_expira_em ??
          null,
        evaluatedAt,
        'VALVULA',
        context.modo_operacao_auxiliar,
      );
    }

    this.addActionSpecificChecks({
      checks,
      request,
      context,
      targetTank,
      targetValve,
      auxiliaryValves,
      auxiliaryPump,
      principalPump,
      evaluatedAt,
      telemetryTimeoutMs,
    });

    return {
      approved: checks.every((check) => check.permitted),
      id_processo: request.id_processo,
      id_processo_tanque: targetTank?.id_processo_tanque ?? null,
      action: request.action,
      origin: request.origin,
      mode: context.modo_operacao_auxiliar,
      subsystem_version: subsystem?.versao ?? null,
      tank_version: targetTank?.processostanquesauxiliares?.versao ?? null,
      id_tanque: targetTank?.id_tanque ?? null,
      id_bomba_auxiliar: auxiliaryPump?.id_bomba ?? null,
      codigo_bomba_auxiliar: auxiliaryPump?.codigo_hardware ?? null,
      id_valvula_auxiliar: targetValve?.id_valvula ?? null,
      codigo_valvula_auxiliar: targetValve?.codigo_hardware ?? null,
      checks,
      evaluated_at: evaluatedAt,
    };
  }

  async assertAllowed(
    request: ProcessoAuxiliarSafetyRequest,
  ): Promise<ProcessoAuxiliarSafetyResult> {
    const result = await this.evaluate(request);

    if (!result.approved) {
      throw new ConflictException({
        message: 'Ação do subsistema auxiliar bloqueada por intertravamentos.',
        result,
      });
    }

    return result;
  }

  private addModeChecks(
    checks: ProcessoAuxiliarSafetyCheck[],
    context: AuxiliarySafetyContext,
    request: ProcessoAuxiliarSafetyRequest,
    isEnergizing: boolean,
  ): void {
    const safeStateAction = !isEnergizing;
    const userIdentified =
      request.origin !== ProcessoAuxiliarSafetyOrigin.USUARIO ||
      Number.isInteger(request.id_usuario);
    const modePermitsOrigin =
      safeStateAction ||
      context.modo_operacao_auxiliar === modooperacaoauxiliar.ASSISTIDO ||
      (context.modo_operacao_auxiliar === modooperacaoauxiliar.AUTOMATICO &&
        request.origin === ProcessoAuxiliarSafetyOrigin.AUTOMACAO) ||
      (context.modo_operacao_auxiliar === modooperacaoauxiliar.MANUAL &&
        request.origin === ProcessoAuxiliarSafetyOrigin.USUARIO);

    this.addCheck(
      checks,
      userIdentified,
      'USER_IDENTIFIED',
      userIdentified
        ? 'Origem do comando identificada.'
        : 'Comando de usuário exige id_usuario.',
    );
    this.addCheck(
      checks,
      modePermitsOrigin,
      'OPERATION_MODE',
      modePermitsOrigin
        ? `Modo ${context.modo_operacao_auxiliar} permite esta origem/ação.`
        : `Modo ${context.modo_operacao_auxiliar} não permite energização pela origem ${request.origin}.`,
    );
  }

  private addVersionChecks(
    checks: ProcessoAuxiliarSafetyCheck[],
    subsystem: AuxiliarySafetyContext['processosauxiliares'],
    targetTank: AuxiliarySafetyTank | null,
    request: ProcessoAuxiliarSafetyRequest,
  ): void {
    this.addCheck(
      checks,
      Boolean(subsystem),
      'AUXILIARY_CONTRACT',
      subsystem
        ? 'Contrato de estado auxiliar carregado.'
        : 'Processo não possui contrato de estado auxiliar.',
    );

    if (request.expected_subsystem_version !== undefined) {
      this.addCheck(
        checks,
        subsystem?.versao === request.expected_subsystem_version,
        'SUBSYSTEM_VERSION',
        subsystem?.versao === request.expected_subsystem_version
          ? 'Versão do subsistema confirmada.'
          : `Conflito de versão do subsistema: esperado ${request.expected_subsystem_version}, atual ${subsystem?.versao ?? 'ausente'}.`,
      );
    }

    if (request.expected_tank_version !== undefined) {
      const currentVersion =
        targetTank?.processostanquesauxiliares?.versao ?? null;
      this.addCheck(
        checks,
        currentVersion === request.expected_tank_version,
        'TANK_VERSION',
        currentVersion === request.expected_tank_version
          ? 'Versão auxiliar do tanque confirmada.'
          : `Conflito de versão do tanque: esperado ${request.expected_tank_version}, atual ${currentVersion ?? 'ausente'}.`,
      );
    }
  }

  private addEnergizingChecks(
    checks: ProcessoAuxiliarSafetyCheck[],
    context: AuxiliarySafetyContext,
    targetTank: AuxiliarySafetyTank | null,
  ): void {
    const subsystemStatus = context.processosauxiliares?.status_subsistema;
    const subsystemOperational =
      subsystemStatus !== statussubsistemaauxiliar.BLOQUEADO &&
      subsystemStatus !== statussubsistemaauxiliar.FALHA &&
      subsystemStatus !== statussubsistemaauxiliar.INATIVO;
    const tankAuxiliaryStatus =
      targetTank?.processostanquesauxiliares?.status_auxilio;
    const coupling = targetTank?.tanques.sensoresacoplamentomangueiras;

    this.addCheck(
      checks,
      context.status_processo === statusprocesso.EM_EXECUCAO,
      'PROCESS_RUNNING',
      context.status_processo === statusprocesso.EM_EXECUCAO
        ? 'Processo em execução.'
        : `Processo não está em execução: ${context.status_processo}.`,
    );
    const generalClosureStatus =
      context.status_encerramento_geral ?? statusencerramentoprocesso.INATIVO;
    const closureAllowsEnergizing =
      generalClosureStatus === statusencerramentoprocesso.INATIVO ||
      generalClosureStatus === statusencerramentoprocesso.AGUARDANDO_TANQUES;
    this.addCheck(
      checks,
      closureAllowsEnergizing,
      'GENERAL_CLOSURE_INACTIVE',
      closureAllowsEnergizing
        ? 'Encerramento geral ainda nao bloqueou energizacao.'
        : `Encerramento geral em ${generalClosureStatus}; somente comandos de estado seguro sao permitidos.`,
    );
    this.addCheck(
      checks,
      !context.parada_emergencia,
      'EMERGENCY_INACTIVE',
      !context.parada_emergencia
        ? 'Parada de emergência inativa.'
        : 'Parada de emergência ativa.',
    );
    this.addCheck(
      checks,
      context.alarmes.length === 0,
      'NO_CRITICAL_ALARM',
      context.alarmes.length === 0
        ? 'Nenhum alarme crítico ativo.'
        : 'Existe alarme crítico ativo.',
    );
    this.addCheck(
      checks,
      subsystemOperational,
      'SUBSYSTEM_OPERATIONAL',
      subsystemOperational
        ? `Subsistema auxiliar em estado ${subsystemStatus}.`
        : `Subsistema auxiliar indisponível: ${subsystemStatus ?? 'ausente'}.`,
    );
    this.addCheck(
      checks,
      Boolean(
        targetTank && ACTIVE_TANK_STATES.has(targetTank.status_tanque_processo),
      ),
      'TANK_LIFECYCLE_ACTIVE',
      targetTank && ACTIVE_TANK_STATES.has(targetTank.status_tanque_processo)
        ? 'Lifecycle do tanque permite auxílio.'
        : `Lifecycle do tanque não permite auxílio: ${targetTank?.status_tanque_processo ?? 'tanque ausente'}.`,
    );
    this.addCheck(
      checks,
      Boolean(
        tankAuxiliaryStatus &&
        ELIGIBLE_AUXILIARY_STATES.has(tankAuxiliaryStatus),
      ),
      'TANK_AUXILIARY_ELIGIBLE',
      tankAuxiliaryStatus && ELIGIBLE_AUXILIARY_STATES.has(tankAuxiliaryStatus)
        ? `Tanque elegível no estado ${tankAuxiliaryStatus}.`
        : `Estado auxiliar do tanque não elegível: ${tankAuxiliaryStatus ?? 'ausente'}.`,
    );
    this.addCheck(
      checks,
      Boolean(
        coupling?.ativo &&
        coupling.sinal_detectado &&
        coupling.status_acoplamento === StatusAcoplamentoMangueira.ACOPLADA,
      ),
      'TANK_COUPLED',
      coupling?.ativo &&
        coupling.sinal_detectado &&
        coupling.status_acoplamento === StatusAcoplamentoMangueira.ACOPLADA
        ? 'Mangueira acoplada e sinal físico confirmado.'
        : 'Mangueira sem acoplamento físico seguro.',
    );
  }

  private addValveTargetChecks(
    checks: ProcessoAuxiliarSafetyCheck[],
    targetTank: AuxiliarySafetyTank | null,
    targetValves: AuxiliarySafetyValve[],
  ): void {
    this.addCheck(
      checks,
      Boolean(targetTank),
      'TARGET_TANK',
      targetTank
        ? 'Tanque alvo pertence ao processo.'
        : 'Ação de válvula exige um tanque válido do processo.',
    );
    this.addCheck(
      checks,
      targetValves.length === 1,
      'AUXILIARY_VALVE_UNIQUE',
      targetValves.length === 1
        ? 'Válvula auxiliar do tanque identificada de forma única.'
        : `Esperada uma válvula auxiliar ativa no tanque; encontradas ${targetValves.length}.`,
    );
  }

  private addOwnershipCheck(
    checks: ProcessoAuxiliarSafetyCheck[],
    request: ProcessoAuxiliarSafetyRequest,
    holderId: number | null,
    expiresAt: Date | null,
    evaluatedAt: Date,
    resource: 'BOMBA' | 'VALVULA',
    mode: modooperacaoauxiliar,
  ): void {
    const leaseActive = Boolean(
      holderId && expiresAt && expiresAt.getTime() > evaluatedAt.getTime(),
    );
    const humanLeaseRequired =
      request.origin === ProcessoAuxiliarSafetyOrigin.USUARIO &&
      mode !== modooperacaoauxiliar.AUTOMATICO;
    const permitted = humanLeaseRequired
      ? leaseActive && holderId === request.id_usuario
      : !leaseActive ||
        (request.origin === ProcessoAuxiliarSafetyOrigin.USUARIO &&
          holderId === request.id_usuario);

    this.addCheck(
      checks,
      permitted,
      `${resource}_CONTROL_OWNERSHIP`,
      permitted
        ? `Controle de ${resource.toLowerCase()} disponível para a origem solicitante.`
        : humanLeaseRequired
          ? `Modo ${mode} exige lease ativo de ${resource.toLowerCase()} para o usuário solicitante.`
          : `Controle de ${resource.toLowerCase()} possui lease ativo de outro usuário.`,
    );
  }

  private addActionSpecificChecks(input: {
    checks: ProcessoAuxiliarSafetyCheck[];
    request: ProcessoAuxiliarSafetyRequest;
    context: AuxiliarySafetyContext;
    targetTank: AuxiliarySafetyTank | null;
    targetValve: AuxiliarySafetyValve | null;
    auxiliaryValves: AuxiliarySafetyValve[];
    auxiliaryPump: AuxiliarySafetyValve['bombas'] | null;
    principalPump: AuxiliarySafetyValve['bombas'] | null;
    evaluatedAt: Date;
    telemetryTimeoutMs: number | null;
  }): void {
    const {
      checks,
      request,
      context,
      targetTank,
      targetValve,
      auxiliaryValves,
      auxiliaryPump,
      principalPump,
      evaluatedAt,
      telemetryTimeoutMs,
    } = input;
    const auxiliaryTelemetryFresh = this.isTelemetryFresh(
      auxiliaryPump?.ultimo_status_hardware_em ?? null,
      evaluatedAt,
      telemetryTimeoutMs,
    );

    if (request.action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR) {
      const principalTelemetryFresh = this.isTelemetryFresh(
        principalPump?.ultimo_status_hardware_em ?? null,
        evaluatedAt,
        telemetryTimeoutMs,
      );
      const openAuxiliaryValves = auxiliaryValves.filter(
        (valve) => valve.status_valvula === StatusValvula.ABERTA,
      );

      this.addCheck(
        checks,
        context.processosauxiliares?.id_processo_tanque_atual ===
          targetTank?.id_processo_tanque,
        'TARGET_TANK_SELECTED',
        context.processosauxiliares?.id_processo_tanque_atual ===
          targetTank?.id_processo_tanque
          ? 'Tanque alvo selecionado no contrato do subsistema.'
          : 'Tanque alvo não está selecionado no contrato do subsistema.',
      );
      this.addCheck(
        checks,
        Boolean(
          principalPump &&
          principalPump.status_padrao === statusbomba.ATIVA &&
          principalPump.disponivel_hardware &&
          principalPump.ligada_hardware &&
          principalTelemetryFresh,
        ),
        'MAIN_PUMP_RUNNING',
        principalPump?.ligada_hardware && principalTelemetryFresh
          ? 'Bomba principal ligada com telemetria recente.'
          : 'Bomba principal precisa estar ligada, disponível e com telemetria recente.',
      );
      this.addCheck(
        checks,
        Boolean(
          auxiliaryPump &&
          auxiliaryPump.status_padrao === statusbomba.ATIVA &&
          auxiliaryPump.disponivel_hardware &&
          auxiliaryTelemetryFresh,
        ),
        'AUXILIARY_PUMP_AVAILABLE',
        auxiliaryPump?.disponivel_hardware && auxiliaryTelemetryFresh
          ? 'Bomba auxiliar disponível com telemetria recente.'
          : 'Bomba auxiliar indisponível ou sem telemetria recente.',
      );
      this.addCheck(
        checks,
        targetValve?.status_valvula === StatusValvula.ABERTA,
        'TARGET_VALVE_OPEN',
        targetValve?.status_valvula === StatusValvula.ABERTA
          ? 'Válvula auxiliar do tanque alvo está aberta.'
          : 'Válvula auxiliar do tanque alvo precisa estar aberta.',
      );
      this.addCheck(
        checks,
        openAuxiliaryValves.length === 1 &&
          openAuxiliaryValves[0]?.id_valvula === targetValve?.id_valvula,
        'AUXILIARY_VALVE_EXCLUSIVITY',
        openAuxiliaryValves.length === 1 &&
          openAuxiliaryValves[0]?.id_valvula === targetValve?.id_valvula
          ? 'Somente a válvula auxiliar do tanque alvo está aberta.'
          : 'A exclusividade da válvula auxiliar do tanque alvo não foi confirmada.',
      );
      return;
    }

    if (
      request.action === ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR
    ) {
      const anotherValveOpen = auxiliaryValves.some(
        (valve) =>
          valve.id_valvula !== targetValve?.id_valvula &&
          valve.status_valvula === StatusValvula.ABERTA,
      );

      this.addCheck(
        checks,
        targetValve?.status_valvula !== StatusValvula.FALHA &&
          targetValve?.status_valvula !== StatusValvula.DESCONHECIDA,
        'TARGET_VALVE_HEALTHY',
        targetValve &&
          targetValve.status_valvula !== StatusValvula.FALHA &&
          targetValve.status_valvula !== StatusValvula.DESCONHECIDA
          ? 'Válvula auxiliar do tanque sem falha conhecida.'
          : 'Válvula auxiliar em falha ou estado desconhecido.',
      );
      this.addCheck(
        checks,
        !anotherValveOpen,
        'AUXILIARY_VALVE_EXCLUSIVITY',
        !anotherValveOpen
          ? 'Nenhuma válvula auxiliar de outro tanque está aberta.'
          : 'Outra válvula auxiliar está aberta.',
      );
      this.addPumpStoppedCheck(checks, auxiliaryPump, auxiliaryTelemetryFresh);
      return;
    }

    if (
      request.action === ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR
    ) {
      this.addPumpStoppedCheck(checks, auxiliaryPump, auxiliaryTelemetryFresh);
    }
  }

  private addPumpStoppedCheck(
    checks: ProcessoAuxiliarSafetyCheck[],
    auxiliaryPump: AuxiliarySafetyValve['bombas'] | null,
    telemetryFresh: boolean,
  ): void {
    const stopped = Boolean(
      auxiliaryPump &&
      telemetryFresh &&
      auxiliaryPump.ligada_hardware === false,
    );

    this.addCheck(
      checks,
      stopped,
      'AUXILIARY_PUMP_STOPPED',
      stopped
        ? 'Bomba auxiliar desligada com telemetria recente.'
        : 'A bomba auxiliar deve estar confirmadamente desligada antes de movimentar a válvula.',
    );
  }

  private findTargetTank(
    context: AuxiliarySafetyContext,
    request: ProcessoAuxiliarSafetyRequest,
  ): AuxiliarySafetyTank | null {
    if (!request.id_processo_tanque) {
      return null;
    }

    return (
      context.processostanques.find(
        (tank) => tank.id_processo_tanque === request.id_processo_tanque,
      ) ?? null
    );
  }

  private listProcessValves(
    context: AuxiliarySafetyContext,
  ): AuxiliarySafetyValve[] {
    return context.processostanques.flatMap((tank) =>
      tank.tanques.valvulas.map((valve) => ({
        ...valve,
        id_processo_tanque: tank.id_processo_tanque,
      })),
    );
  }

  private uniquePumps(
    valves: AuxiliarySafetyValve[],
  ): AuxiliarySafetyValve['bombas'][] {
    return [
      ...new Map(
        valves.map((valve) => [valve.bombas.id_bomba, valve.bombas]),
      ).values(),
    ];
  }

  private isTelemetryFresh(
    statusAt: Date | null,
    evaluatedAt: Date,
    timeoutMs: number | null,
  ): boolean {
    if (!statusAt || !timeoutMs || timeoutMs <= 0) {
      return false;
    }

    const ageMs = evaluatedAt.getTime() - statusAt.getTime();
    return ageMs >= -5000 && ageMs <= timeoutMs;
  }

  private async resolveTelemetryTimeoutMs(): Promise<number | null> {
    try {
      const config = await this.mqttConfigService.getConfig();
      return config.timeout_comunicacao;
    } catch {
      return null;
    }
  }

  private addCheck(
    checks: ProcessoAuxiliarSafetyCheck[],
    permitted: boolean,
    code: string,
    message: string,
  ): void {
    checks.push({ code, permitted, message });
  }

  private buildMissingProcessResult(
    request: ProcessoAuxiliarSafetyRequest,
    evaluatedAt: Date,
  ): ProcessoAuxiliarSafetyResult {
    return {
      approved: false,
      id_processo: request.id_processo,
      id_processo_tanque: request.id_processo_tanque ?? null,
      action: request.action,
      origin: request.origin,
      mode: null,
      subsystem_version: null,
      tank_version: null,
      id_tanque: null,
      id_bomba_auxiliar: null,
      codigo_bomba_auxiliar: null,
      id_valvula_auxiliar: null,
      codigo_valvula_auxiliar: null,
      checks: [
        {
          code: 'PROCESS_NOT_FOUND',
          permitted: false,
          message: `Processo ${request.id_processo} não encontrado.`,
        },
      ],
      evaluated_at: evaluatedAt,
    };
  }
}
