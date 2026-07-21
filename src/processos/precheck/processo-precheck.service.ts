import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  StatusAcoplamentoMangueira,
  StatusValvula,
  funcaovalvula,
  nivelacesso,
  resultadooperacao,
  statusconexaomqtt,
  statusgeralsistema,
  statusencerramentoprocesso,
  statusencerramentotanque,
  statusprocesso,
  statussensor,
  statusintegridadesensor,
  statustanque,
  statusbomba,
  tipobomba,
  tiposensor,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import type { CommandResult } from '../../mqtt-hardware/commands/interfaces/command-result.interface';
import {
  isControllerStatusTimestampFresh,
  MqttConfigService,
  type HardwareStatusSnapshot,
} from '../../mqtt-hardware/config/mqtt-config.service';
import type { ActiveMqttConfig } from '../../mqtt-hardware/interfaces/active-mqtt-config.interface';
import { MqttPayloadValidator } from '../../mqtt-hardware/validators/mqtt-payload.validator';
import type {
  ProcessoOperationalContext,
  ProcessoSensorOperationalContext,
  ProcessoTanqueOperationalContext,
} from '../interfaces';
import { ProcessoLogService } from '../logs';
import {
  ProcessoMqttCommandContext,
  ProcessoMqttHardwareReadiness,
  ProcessoMqttOrchestratorService,
} from '../mqtt';
import { ProcessosRepository } from '../processos.repository';
import { ProcessosSocketGateway } from '../socket';
import { ProcessoStartValidator } from '../validators';
import {
  PROCESSO_PRECHECK_ACOPLAMENTO_RECENCIA_SEGUNDOS,
  PROCESSO_PRECHECK_SENSOR_RECENCIA_SEGUNDOS,
  PROCESSO_PRECHECK_VALVULA_ACK_RECENCIA_SEGUNDOS,
} from './processo-precheck.constants';
import { ProcessoPrecheckMapper } from './processo-precheck.mapper';
import {
  ProcessoPrecheckAcaoCorretiva,
  ProcessoPrecheckItem,
  ProcessoPrecheckItemStatus,
  ProcessoPrecheckOptions,
  ProcessoPrecheckResultado,
  ProcessoPrecheckUser,
  ProcessoPrecheckValve,
  ProcessoValveActionResult,
} from './processo-precheck.types';

const PREFLIGHT_HARDWARE_POLL_INTERVAL_MS = 250;
const PREFLIGHT_HARDWARE_TIMEOUT_MAX_MS = 30_000;

type SafeHardwareConfirmation = {
  confirmed: boolean;
  snapshotReceived: boolean;
  snapshotReceivedAt: Date | null;
  message: string;
};

@Injectable()
export class ProcessoPrecheckService {
  private readonly logger = new Logger(ProcessoPrecheckService.name);

  constructor(
    private readonly processosRepository: ProcessosRepository,
    private readonly processoStartValidator: ProcessoStartValidator,
    private readonly processoLogService: ProcessoLogService,
    private readonly processoMqttOrchestratorService: ProcessoMqttOrchestratorService,
    private readonly processosSocketGateway: ProcessosSocketGateway,
    private readonly commandService: CommandService,
    private readonly mqttConfigService: MqttConfigService,
  ) {}

  async consultar(
    id_processo: number,
    user: ProcessoPrecheckUser,
  ): Promise<ProcessoPrecheckResultado> {
    return this.buildPrecheck(id_processo, user, {
      exigirPermissaoTecnica: false,
      executarHardware: false,
      registrarLog: false,
      emitirSocket: false,
    });
  }

  async executar(
    id_processo: number,
    user: ProcessoPrecheckUser,
  ): Promise<ProcessoPrecheckResultado> {
    const resultado = await this.buildPrecheck(id_processo, user, {
      exigirPermissaoTecnica: true,
      executarHardware: true,
      registrarLog: true,
      emitirSocket: true,
    });

    await this.registrarLogPrecheck(id_processo, user.sub, resultado);
    this.processosSocketGateway.emitPrecheckResult(resultado);

    return resultado;
  }

  async executarObrigatoriaParaInicio(
    id_processo: number,
    user: ProcessoPrecheckUser,
  ): Promise<ProcessoPrecheckResultado> {
    const resultado = await this.executar(id_processo, user);

    if (!resultado.aprovado) {
      throw new ConflictException({
        message: 'Pre-checagem operacional reprovada.',
        checklist: resultado,
      });
    }

    return resultado;
  }

  async listarValvulas(id_processo: number): Promise<
    Array<
      ProcessoPrecheckValve & {
        pode_validar: boolean;
        pode_abrir_fechar: boolean;
      }
    >
  > {
    await this.assertProcessExists(id_processo);
    const valvulas: ProcessoPrecheckValve[] =
      await this.processosRepository.findValvesByProcessId(id_processo);
    const activeProcessId: number | null =
      await this.processosRepository.findActiveProcessId();
    const processo = await this.processosRepository.findById(id_processo);
    const pode_abrir_fechar =
      processo?.status_processo === statusprocesso.EM_EXECUCAO &&
      activeProcessId === id_processo;

    return valvulas.map((valvula) => ({
      ...valvula,
      pode_validar: activeProcessId === null,
      pode_abrir_fechar,
    }));
  }

  async validarAcoplamentoTanque(
    id_processo: number,
    id_tanque: number,
  ): Promise<ProcessoPrecheckItem> {
    const context = await this.getRequiredContext(id_processo);
    const tanque = context.tanques.find((item) => item.id_tanque === id_tanque);

    if (!tanque) {
      throw new NotFoundException('Tanque nao pertence ao processo informado.');
    }

    return this.buildAcoplamentoItem(tanque, new Date());
  }

  async validarSensor(
    id_processo: number,
    id_sensor: number,
  ): Promise<ProcessoPrecheckItem> {
    const context = await this.getRequiredContext(id_processo);
    const sensorContext = context.tanques
      .flatMap((tanque) =>
        tanque.sensores.map((sensor) => ({ tanque, sensor })),
      )
      .find((item) => item.sensor.id_sensor === id_sensor);

    if (!sensorContext) {
      throw new NotFoundException('Sensor nao pertence ao processo informado.');
    }

    return this.buildSensorItem(sensorContext.tanque, sensorContext.sensor);
  }

  async validarValvula(
    id_processo: number,
    id_valvula: number,
    user: ProcessoPrecheckUser,
  ): Promise<ProcessoValveActionResult> {
    const processo = await this.processosRepository.findById(id_processo);
    if (!processo) {
      throw new NotFoundException('Processo nao encontrado.');
    }
    if (processo.status_processo !== statusprocesso.CONFIGURADO) {
      throw new ConflictException(
        'O teste seguro de valvulas exige processo em status CONFIGURADO.',
      );
    }

    const activeProcessId =
      await this.processosRepository.findActiveProcessId();

    if (activeProcessId) {
      throw new ConflictException(
        'Nao e permitido validar valvulas durante processo ativo.',
      );
    }

    const valvula = await this.getRequiredValve(id_processo, id_valvula);
    if (!valvula.ativo) {
      throw new ConflictException(
        'A valvula esta inativa e precisa ter sua configuracao revisada.',
      );
    }
    if (!valvula.codigo_hardware?.trim()) {
      throw new ConflictException(
        'A valvula nao possui codigo_hardware e nao pode ser confirmada com seguranca.',
      );
    }

    const readiness =
      this.processoMqttOrchestratorService.getHardwareReadiness();
    this.assertHardwareReadyForValveCommand(readiness);

    const leaseToken = randomUUID();
    let leaseClaimed = false;
    try {
      await this.mqttConfigService.claimOperationalControlLease(
        leaseToken,
        'PROCESS_PREFLIGHT_SAFE_STATE',
      );
      leaseClaimed = true;

      const context = await this.getRequiredContext(id_processo);
      const correlationPrefix =
        `process-preflight-p${id_processo}` + `-v${id_valvula}-${randomUUID()}`;
      const preparation =
        await this.processoMqttOrchestratorService.prepareHardwareForStart(
          this.buildMqttCommandContext(context),
          { correlationPrefix },
        );
      if (!preparation.success) {
        const failed = this.buildValveActionResult({
          id_processo,
          id_valvula,
          acao: 'VALIDAR',
          status: 'FALHA',
          mensagem: preparation.message,
          evidencia: 'Preparacao segura nao foi confirmada por todos os ACKs.',
          detalhes: {
            command_results: preparation.command_results ?? [],
            command_failures: preparation.command_failures ?? [],
            estado_controlador_confirmado: false,
            feedback_mecanico_disponivel: false,
          },
        });
        await this.registrarResultadoValidacaoValvula(failed, user.sub);
        return failed;
      }

      const marker = this.resolveCommandConfirmationMarker(
        preparation.command_results ?? [],
      );
      const mqttConfig = await this.mqttConfigService.getConfig();
      const valves =
        await this.processosRepository.findValvesByProcessId(id_processo);
      const confirmation = await this.waitForSafeHardwareSnapshot({
        marker,
        timeoutMs: mqttConfig.timeout_comunicacao,
        valves: valves.filter((item) => item.ativo),
      });
      const result = this.buildValveActionResult({
        id_processo,
        id_valvula,
        acao: 'VALIDAR',
        status: confirmation.confirmed
          ? 'APROVADO'
          : confirmation.snapshotReceived
            ? 'REPROVADO'
            : 'NAO_CONFIRMADO',
        mensagem: confirmation.confirmed
          ? 'Bombas desligadas e valvulas fechadas foram confirmadas por ACK e por telemetria nova do ESP32.'
          : confirmation.message,
        evidencia: confirmation.snapshotReceivedAt
          ? `hardware_status_recebido_em=${confirmation.snapshotReceivedAt.toISOString()}`
          : `marker=${marker.toISOString()}`,
        detalhes: {
          command_results: preparation.command_results ?? [],
          estado_controlador_confirmado: confirmation.confirmed,
          feedback_mecanico_disponivel: false,
          snapshot_recebido: confirmation.snapshotReceived,
          motivo_nao_confirmacao: confirmation.confirmed
            ? null
            : confirmation.message,
        },
      });
      await this.registrarResultadoValidacaoValvula(result, user.sub);
      return result;
    } finally {
      if (leaseClaimed) {
        await this.mqttConfigService
          .releaseOperationalControlLease(leaseToken)
          .catch((error: unknown) => {
            this.logger.error(
              'Nao foi possivel liberar imediatamente o lease do teste seguro de valvulas; ele expirara automaticamente.',
              error instanceof Error ? error.stack : undefined,
            );
          });
      }
    }
  }

  async abrirValvula(
    id_processo: number,
    id_valvula: number,
    user: ProcessoPrecheckUser,
  ): Promise<ProcessoValveActionResult> {
    await this.assertCanOperateValveDuringProcess(id_processo, 'abrir');
    const valvula = await this.getRequiredValve(id_processo, id_valvula);
    this.assertNotAuxiliaryValve(valvula);
    if (valvula.id_tanque) {
      const closure =
        await this.processosRepository.findTankClosureByProcessAndTank(
          id_processo,
          valvula.id_tanque,
        );
      if (closure?.status_encerramento === statusencerramentotanque.CONCLUIDO) {
        throw new ConflictException(
          'Nao e permitido reabrir valvula de tanque com isolamento e retencao concluidos.',
        );
      }
    }
    const readiness =
      this.processoMqttOrchestratorService.getHardwareReadiness();
    this.assertHardwareReadyForValveCommand(readiness);

    const command = await this.commandService.abrirValvula(
      {
        id_processo,
        solicitado_por: user.sub,
        motivo: `Abertura manual da valvula ${id_valvula} no processo ${id_processo}.`,
      },
      id_valvula,
      valvula.codigo_hardware ?? undefined,
    );

    await this.registrarLogComandoValvula(
      id_processo,
      user.sub,
      'VALVULA_ABRIR_EXECUTADA',
      `Comando MQTT de abertura confirmado pelo ESP32 para a valvula ${id_valvula}.`,
    );

    return this.buildValveActionResult({
      id_processo,
      id_valvula,
      acao: 'ABRIR',
      status: 'APROVADO',
      mensagem:
        'Abertura elétrica confirmada pelo ESP32 com ACK EXECUTADO. A posição mecânica exige sensor dedicado.',
      evidencia: `correlation_id=${command.correlation_id}; ack=${command.ack_status ?? 'AUSENTE'}`,
      detalhes: { command },
    });
  }

  async fecharValvula(
    id_processo: number,
    id_valvula: number,
    user: ProcessoPrecheckUser,
  ): Promise<ProcessoValveActionResult> {
    await this.assertCanOperateValveDuringProcess(id_processo, 'fechar');
    const valvula = await this.getRequiredValve(id_processo, id_valvula);
    this.assertNotAuxiliaryValve(valvula);
    const readiness =
      this.processoMqttOrchestratorService.getHardwareReadiness();
    this.assertHardwareReadyForValveCommand(readiness);

    const command = await this.commandService.fecharValvula(
      {
        id_processo,
        solicitado_por: user.sub,
        motivo: `Fechamento manual da valvula ${id_valvula} no processo ${id_processo}.`,
      },
      id_valvula,
      valvula.codigo_hardware ?? undefined,
    );

    await this.registrarLogComandoValvula(
      id_processo,
      user.sub,
      'VALVULA_FECHAR_EXECUTADA',
      `Comando MQTT de fechamento confirmado pelo ESP32 para a valvula ${id_valvula}.`,
    );

    return this.buildValveActionResult({
      id_processo,
      id_valvula,
      acao: 'FECHAR',
      status: 'APROVADO',
      mensagem:
        'Fechamento elétrico confirmado pelo ESP32 com ACK EXECUTADO. A posição mecânica exige sensor dedicado.',
      evidencia: `correlation_id=${command.correlation_id}; ack=${command.ack_status ?? 'AUSENTE'}`,
      detalhes: { command },
    });
  }

  private async buildPrecheck(
    id_processo: number,
    user: ProcessoPrecheckUser,
    options: ProcessoPrecheckOptions,
  ): Promise<ProcessoPrecheckResultado> {
    const executedAt = new Date();
    const context: ProcessoOperationalContext =
      await this.getRequiredContext(id_processo);
    const activeProcessId: number | null =
      await this.processosRepository.findActiveProcessId();
    const valvulas: ProcessoPrecheckValve[] =
      await this.processosRepository.findValvesByProcessId(id_processo);
    const mqttConfig: ActiveMqttConfig | null = await this.mqttConfigService
      .getConfig()
      .catch((): ActiveMqttConfig | null => null);
    const readiness =
      this.processoMqttOrchestratorService.getHardwareReadiness();
    const enrichedContext = this.enrichContextWithHardwareReadiness(
      context,
      readiness,
    );
    const itens: ProcessoPrecheckItem[] = [
      ...this.buildUserItems(user, options),
      ...this.buildProcessItems(enrichedContext, activeProcessId),
      ...this.buildTankItems(enrichedContext),
      ...this.buildSensorItems(
        enrichedContext,
        this.hasTechnicalPermission(user.nivel_acesso),
      ),
      ...this.buildAcoplamentoItems(enrichedContext, executedAt),
      ...this.buildClosureTopologyItems(enrichedContext, valvulas),
      ...this.buildValveItems(
        id_processo,
        valvulas,
        this.hasTechnicalPermission(user.nivel_acesso),
      ),
      ...this.buildBombItems(valvulas),
      ...this.buildMqttItems(readiness, mqttConfig),
      ...this.buildEsp32Items(readiness),
      this.buildSocketItem(),
      this.buildLogsItem(options.registrarLog),
    ];

    this.addLegacyStartValidationItem(itens, enrichedContext, activeProcessId);

    const resultado = ProcessoPrecheckMapper.buildResultado({
      id_processo,
      itens,
      executado_em: executedAt,
      avisos: this.buildAvisos(itens),
      recomendacoes: this.buildRecomendacoes(itens),
    });

    if (options.executarHardware && !resultado.aprovado) {
      return resultado;
    }

    return resultado;
  }

  private buildUserItems(
    user: ProcessoPrecheckUser,
    options: ProcessoPrecheckOptions,
  ): ProcessoPrecheckItem[] {
    const itens = [
      ProcessoPrecheckMapper.buildItem({
        codigo: 'USUARIO_TOKEN_VALIDO',
        titulo: 'Usuario autenticado',
        grupo: 'USUARIO',
        status: user.sub > 0 ? 'APROVADO' : 'REPROVADO',
        mensagem:
          user.sub > 0
            ? 'Usuario autenticado possui identificador valido.'
            : 'Usuario autenticado sem identificador valido.',
        evidencia: `id_usuario=${user.sub}`,
        id_recurso: user.sub,
        tipo_recurso: 'USUARIO',
      }),
      ProcessoPrecheckMapper.buildItem({
        codigo: 'USUARIO_NIVEL_VALIDO',
        titulo: 'Nivel de acesso',
        grupo: 'USUARIO',
        status: user.nivel_acesso ? 'APROVADO' : 'REPROVADO',
        mensagem: `Nivel de acesso informado: ${user.nivel_acesso}.`,
        evidencia: user.nivel_acesso,
        id_recurso: user.sub,
        tipo_recurso: 'USUARIO',
      }),
    ];

    if (options.exigirPermissaoTecnica) {
      const allowed = this.hasTechnicalPermission(user.nivel_acesso);
      itens.push(
        ProcessoPrecheckMapper.buildItem({
          codigo: 'USUARIO_PERMISSAO_EXECUTAR',
          titulo: 'Permissao para executar pre-checagem',
          grupo: 'USUARIO',
          status: allowed ? 'APROVADO' : 'REPROVADO',
          mensagem: allowed
            ? 'Usuario pode executar pre-checagem operacional.'
            : 'Somente TECNICO ou ADMINISTRADOR pode executar pre-checagem operacional.',
          evidencia: user.nivel_acesso,
          id_recurso: user.sub,
          tipo_recurso: 'USUARIO',
        }),
      );
    }

    return itens;
  }

  private buildProcessItems(
    context: ProcessoOperationalContext,
    activeProcessId: number | null,
  ): ProcessoPrecheckItem[] {
    if (!context) {
      return [];
    }

    const activeConflict =
      activeProcessId !== null && activeProcessId !== context.id_processo;

    return [
      ProcessoPrecheckMapper.buildItem({
        codigo: 'PROCESSO_EXISTE',
        titulo: 'Processo encontrado',
        grupo: 'PROCESSO',
        status: 'APROVADO',
        mensagem: 'Processo existe no banco de dados.',
        evidencia: `id_processo=${context.id_processo}`,
        id_recurso: context.id_processo,
        tipo_recurso: 'PROCESSO',
      }),
      ProcessoPrecheckMapper.buildItem({
        codigo: 'PROCESSO_STATUS_CONFIGURADO',
        titulo: 'Status do processo',
        grupo: 'PROCESSO',
        status:
          context.status_processo === statusprocesso.CONFIGURADO
            ? 'APROVADO'
            : 'REPROVADO',
        mensagem:
          context.status_processo === statusprocesso.CONFIGURADO
            ? 'Processo esta configurado para inicio.'
            : `Processo esta em status ${context.status_processo}.`,
        evidencia: context.status_processo,
        id_recurso: context.id_processo,
        tipo_recurso: 'PROCESSO',
      }),
      ProcessoPrecheckMapper.buildItem({
        codigo: 'PROCESSO_ATIVO_CONCORRENTE',
        titulo: 'Processo ativo concorrente',
        grupo: 'PROCESSO',
        status: activeConflict ? 'REPROVADO' : 'APROVADO',
        mensagem: activeConflict
          ? `Ja existe processo ativo: ${activeProcessId}.`
          : 'Nao ha outro processo ativo concorrente.',
        evidencia: activeProcessId
          ? `activeProcessId=${activeProcessId}`
          : null,
        id_recurso: context.id_processo,
        tipo_recurso: 'PROCESSO',
      }),
      ProcessoPrecheckMapper.buildItem({
        codigo: 'PROCESSO_CONFIG_MINIMA',
        titulo: 'Configuracao minima',
        grupo: 'PROCESSO',
        status: context.tanques.length > 0 ? 'APROVADO' : 'REPROVADO',
        mensagem:
          context.tanques.length > 0
            ? 'Processo possui configuracao minima de tanques.'
            : 'Processo nao possui tanques configurados.',
        evidencia: `tanques=${context.tanques.length}`,
        id_recurso: context.id_processo,
        tipo_recurso: 'PROCESSO',
      }),
    ];
  }

  private buildTankItems(
    context: ProcessoOperationalContext,
  ): ProcessoPrecheckItem[] {
    if (context.tanques.length === 0) {
      return [
        ProcessoPrecheckMapper.buildItem({
          codigo: 'TANQUES_CONFIGURADOS',
          titulo: 'Tanques do processo',
          grupo: 'TANQUES',
          status: 'REPROVADO',
          mensagem: 'Processo nao possui tanques vinculados.',
          evidencia: null,
          tipo_recurso: 'TANQUE',
        }),
      ];
    }

    return context.tanques.map((tanque, index) =>
      ProcessoPrecheckMapper.buildItem({
        codigo: `TANQUE_${tanque.id_tanque}_ATIVO`,
        titulo: `Tanque ${index + 1} - ${tanque.nome_tanque}`,
        grupo: 'TANQUES',
        status:
          tanque.status_tanque === statustanque.ATIVO
            ? 'APROVADO'
            : 'REPROVADO',
        mensagem:
          tanque.status_tanque === statustanque.ATIVO
            ? 'Tanque esta ativo.'
            : `Tanque esta em status ${tanque.status_tanque}.`,
        evidencia: tanque.status_tanque,
        detalhes: {
          id_processo_tanque: tanque.id_processo_tanque,
          sensores: tanque.sensores.length,
        },
        id_recurso: tanque.id_tanque,
        tipo_recurso: 'TANQUE',
      }),
    );
  }

  private buildSensorItems(
    context: ProcessoOperationalContext,
    canExecuteCorrection: boolean,
  ): ProcessoPrecheckItem[] {
    return context.tanques.flatMap((tanque) => {
      if (tanque.sensores.length === 0) {
        return [
          ProcessoPrecheckMapper.buildItem({
            codigo: `SENSOR_TANQUE_${tanque.id_tanque}_AUSENTE`,
            titulo: `Sensores do tanque ${tanque.nome_tanque}`,
            grupo: 'SENSORES',
            status: 'REPROVADO',
            mensagem: 'Tanque nao possui sensores associados.',
            evidencia: null,
            id_recurso: tanque.id_tanque,
            tipo_recurso: 'TANQUE',
          }),
        ];
      }

      return tanque.sensores.map((sensor) =>
        this.buildSensorItem(tanque, sensor, canExecuteCorrection),
      );
    });
  }

  private buildSensorItem(
    tanque: ProcessoTanqueOperationalContext,
    sensor: ProcessoSensorOperationalContext,
    canExecuteCorrection = true,
  ): ProcessoPrecheckItem {
    if (!sensor.ativo_no_processo) {
      return ProcessoPrecheckMapper.buildItem({
        codigo: `SENSOR_${sensor.id_sensor}_ATIVO_PROCESSO`,
        titulo: sensor.nome_sensor,
        grupo: 'SENSORES',
        status: 'REPROVADO',
        mensagem: 'Sensor esta inativo no processo.',
        evidencia: null,
        id_recurso: sensor.id_sensor,
        tipo_recurso: 'SENSOR',
      });
    }

    if (sensor.status_sensor === statussensor.FALHA) {
      return ProcessoPrecheckMapper.buildItem({
        codigo: `SENSOR_${sensor.id_sensor}_STATUS`,
        titulo: sensor.nome_sensor,
        grupo: 'SENSORES',
        status: 'REPROVADO',
        mensagem: 'Sensor reportou falha e exige diagnostico tecnico.',
        evidencia: sensor.status_sensor,
        acao_corretiva: this.buildSensorAction(
          sensor.id_sensor,
          'DIAGNOSTICAR_SENSOR',
          canExecuteCorrection,
        ),
        id_recurso: sensor.id_sensor,
        tipo_recurso: 'SENSOR',
      });
    }

    if (sensor.tipo_sensor === tiposensor.VACUO) {
      const calibrationItem = this.buildVacuumSensorCalibrationItem(
        sensor,
        canExecuteCorrection,
      );
      if (calibrationItem) {
        return calibrationItem;
      }
    }

    if (sensor.status_sensor !== statussensor.ATIVO) {
      const disconnected = sensor.status_sensor === statussensor.DESCONECTADO;
      return ProcessoPrecheckMapper.buildItem({
        codigo: `SENSOR_${sensor.id_sensor}_STATUS`,
        titulo: sensor.nome_sensor,
        grupo: 'SENSORES',
        status: disconnected ? 'NAO_CONFIRMADO' : 'REPROVADO',
        mensagem: disconnected
          ? 'Sensor desconectado; aguardando nova telemetria diagnostica.'
          : `Sensor esta em status ${sensor.status_sensor}.`,
        evidencia: sensor.status_sensor,
        acao_corretiva: this.buildSensorAction(
          sensor.id_sensor,
          disconnected ? 'AGUARDAR_TELEMETRIA_SENSOR' : 'ATIVAR_SENSOR',
          canExecuteCorrection,
        ),
        id_recurso: sensor.id_sensor,
        tipo_recurso: 'SENSOR',
      });
    }

    if (this.isAcoplamentoSensor(sensor)) {
      return ProcessoPrecheckMapper.buildItem({
        codigo: `SENSOR_${sensor.id_sensor}_ACOPLAMENTO`,
        titulo: sensor.nome_sensor,
        grupo: 'SENSORES',
        status: 'APROVADO',
        mensagem:
          'Sensor de acoplamento sera validado pela pre-checagem especifica de acoplamento.',
        evidencia: `tanque=${tanque.nome_tanque}`,
        detalhes: {
          id_processo_tanque_sensor: sensor.id_processo_tanque_sensor,
          id_tanque: sensor.acoplamento.id_tanque,
          status_acoplamento: sensor.acoplamento.status_acoplamento,
        },
        id_recurso: sensor.id_sensor,
        tipo_recurso: 'SENSOR',
      });
    }

    const ultimaLeitura = this.normalizeDate(sensor.ultima_leitura);
    const leituraRecente = this.isRecentDate(
      ultimaLeitura,
      PROCESSO_PRECHECK_SENSOR_RECENCIA_SEGUNDOS,
    );

    return ProcessoPrecheckMapper.buildItem({
      codigo: `SENSOR_${sensor.id_sensor}_RESPOSTA`,
      titulo: sensor.nome_sensor,
      grupo: 'SENSORES',
      status: leituraRecente ? 'APROVADO' : 'NAO_CONFIRMADO',
      mensagem: leituraRecente
        ? 'Sensor possui leitura recente registrada.'
        : 'Sensor esta ativo, mas nao ha ACK/leitura recente carregada no contexto da pre-checagem.',
      evidencia:
        this.formatDateEvidence('ultima_leitura', ultimaLeitura) ??
        `tanque=${tanque.nome_tanque}`,
      detalhes: {
        id_processo_tanque_sensor: sensor.id_processo_tanque_sensor,
        ultimo_valor_lido: sensor.ultimo_valor_lido,
        recencia_exigida_segundos: PROCESSO_PRECHECK_SENSOR_RECENCIA_SEGUNDOS,
      },
      acao_corretiva: leituraRecente
        ? null
        : this.buildSensorAction(
            sensor.id_sensor,
            'AGUARDAR_TELEMETRIA_SENSOR',
            canExecuteCorrection,
          ),
      id_recurso: sensor.id_sensor,
      tipo_recurso: 'SENSOR',
    });
  }

  private buildVacuumSensorCalibrationItem(
    sensor: ProcessoSensorOperationalContext,
    canExecuteCorrection: boolean,
  ): ProcessoPrecheckItem | null {
    const calibrationExpired =
      sensor.calibracao_valida_ate !== null &&
      sensor.calibracao_valida_ate <= new Date();
    const calibrationRequired =
      sensor.status_integridade ===
        statusintegridadesensor.PENDENTE_CALIBRACAO ||
      sensor.calibrado_em === null ||
      calibrationExpired;

    if (sensor.modo_calibracao_ativo) {
      return this.buildSensorCorrectionItem({
        sensor,
        codigo: 'CONTINUAR_CALIBRACAO_SENSOR',
        mensagem:
          'A calibracao do sensor foi iniciada e precisa ser finalizada antes da liberacao tecnica.',
        canExecuteCorrection,
      });
    }

    if (calibrationRequired) {
      return this.buildSensorCorrectionItem({
        sensor,
        codigo: 'CALIBRAR_SENSOR',
        mensagem: calibrationExpired
          ? 'A calibracao do sensor de vacuo esta vencida.'
          : 'O sensor de vacuo ainda nao possui calibracao valida.',
        canExecuteCorrection,
      });
    }

    if (sensor.status_integridade !== statusintegridadesensor.VALIDO) {
      return this.buildSensorCorrectionItem({
        sensor,
        codigo: 'DIAGNOSTICAR_SENSOR',
        mensagem:
          'A calibracao existe, mas a integridade operacional do sensor foi reprovada.',
        canExecuteCorrection,
      });
    }

    if (sensor.liberado_em === null) {
      return this.buildSensorCorrectionItem({
        sensor,
        codigo: 'LIBERAR_SENSOR',
        mensagem:
          'A calibracao foi concluida, mas falta a liberacao tecnica do sensor.',
        canExecuteCorrection,
      });
    }

    return null;
  }

  private buildSensorCorrectionItem(input: {
    sensor: ProcessoSensorOperationalContext;
    codigo:
      | 'CALIBRAR_SENSOR'
      | 'CONTINUAR_CALIBRACAO_SENSOR'
      | 'LIBERAR_SENSOR'
      | 'DIAGNOSTICAR_SENSOR';
    mensagem: string;
    canExecuteCorrection: boolean;
  }): ProcessoPrecheckItem {
    const { sensor } = input;
    return ProcessoPrecheckMapper.buildItem({
      codigo: `SENSOR_${sensor.id_sensor}_CALIBRACAO`,
      titulo: sensor.nome_sensor,
      grupo: 'SENSORES',
      status: 'REPROVADO',
      mensagem: input.mensagem,
      evidencia:
        `integridade=${sensor.status_integridade}; ` +
        `calibrado_em=${sensor.calibrado_em?.toISOString() ?? 'ausente'}; ` +
        `liberado_em=${sensor.liberado_em?.toISOString() ?? 'ausente'}`,
      detalhes: {
        calibracao_valida_ate: sensor.calibracao_valida_ate,
        modo_calibracao_ativo: sensor.modo_calibracao_ativo,
        integridade_ultimo_erro: sensor.integridade_ultimo_erro,
      },
      acao_corretiva: this.buildSensorAction(
        sensor.id_sensor,
        input.codigo,
        input.canExecuteCorrection,
      ),
      id_recurso: sensor.id_sensor,
      tipo_recurso: 'SENSOR',
    });
  }

  private buildSensorAction(
    id_sensor: number,
    codigo:
      | 'CALIBRAR_SENSOR'
      | 'CONTINUAR_CALIBRACAO_SENSOR'
      | 'LIBERAR_SENSOR'
      | 'ATIVAR_SENSOR'
      | 'AGUARDAR_TELEMETRIA_SENSOR'
      | 'DIAGNOSTICAR_SENSOR',
    canExecuteCorrection: boolean,
  ): ProcessoPrecheckAcaoCorretiva {
    const sensorEndpoint = `/configuracoes/sensores/${id_sensor}`;
    let action: ProcessoPrecheckAcaoCorretiva;

    switch (codigo) {
      case 'CALIBRAR_SENSOR':
        action = {
          codigo,
          titulo: 'Iniciar calibracao do sensor',
          metodo: 'POST',
          endpoint: `${sensorEndpoint}/calibracao/iniciar`,
          disponivel: true,
          requer_confirmacao: true,
          reexecutar_prechecagem: true,
          motivo_indisponibilidade: null,
        };
        break;
      case 'CONTINUAR_CALIBRACAO_SENSOR':
        action = {
          codigo,
          titulo: 'Finalizar calibracao em andamento',
          metodo: 'POST',
          endpoint: `${sensorEndpoint}/calibracao/finalizar`,
          disponivel: true,
          requer_confirmacao: true,
          reexecutar_prechecagem: true,
          motivo_indisponibilidade: null,
        };
        break;
      case 'LIBERAR_SENSOR':
        action = {
          codigo,
          titulo: 'Liberar sensor calibrado',
          metodo: 'PATCH',
          endpoint: `${sensorEndpoint}/ativar`,
          disponivel: true,
          requer_confirmacao: true,
          reexecutar_prechecagem: true,
          motivo_indisponibilidade: null,
        };
        break;
      case 'ATIVAR_SENSOR':
        action = {
          codigo,
          titulo: 'Ativar sensor',
          metodo: 'PATCH',
          endpoint: `${sensorEndpoint}/ativar`,
          disponivel: true,
          requer_confirmacao: true,
          reexecutar_prechecagem: true,
          motivo_indisponibilidade: null,
        };
        break;
      case 'AGUARDAR_TELEMETRIA_SENSOR':
        action = {
          codigo,
          titulo: 'Consultar sensor e aguardar telemetria',
          metodo: 'GET',
          endpoint: sensorEndpoint,
          disponivel: true,
          requer_confirmacao: false,
          reexecutar_prechecagem: true,
          motivo_indisponibilidade: null,
        };
        break;
      case 'DIAGNOSTICAR_SENSOR':
        action = {
          codigo,
          titulo: 'Consultar diagnostico do sensor',
          metodo: 'GET',
          endpoint: sensorEndpoint,
          disponivel: true,
          requer_confirmacao: false,
          reexecutar_prechecagem: true,
          motivo_indisponibilidade: null,
        };
        break;
    }

    return this.applyCorrectiveActionPermission(action, canExecuteCorrection);
  }

  private applyCorrectiveActionPermission(
    action: ProcessoPrecheckAcaoCorretiva,
    canExecuteCorrection: boolean,
  ): ProcessoPrecheckAcaoCorretiva {
    if (!action.disponivel || canExecuteCorrection) {
      return action;
    }

    return {
      ...action,
      disponivel: false,
      motivo_indisponibilidade:
        'A acao corretiva exige perfil TECNICO ou ADMINISTRADOR.',
    };
  }

  private isAcoplamentoSensor(
    sensor: ProcessoSensorOperationalContext,
  ): sensor is ProcessoSensorOperationalContext & {
    acoplamento: NonNullable<ProcessoSensorOperationalContext['acoplamento']>;
  } {
    return sensor.acoplamento?.id_sensor === sensor.id_sensor;
  }

  private buildAcoplamentoItems(
    context: ProcessoOperationalContext,
    now: Date,
  ): ProcessoPrecheckItem[] {
    return context.tanques.map((tanque) =>
      this.buildAcoplamentoItem(tanque, now),
    );
  }

  private buildAcoplamentoItem(
    tanque: ProcessoTanqueOperationalContext,
    now: Date,
  ): ProcessoPrecheckItem {
    const acoplamento = tanque.sensores.find(
      (sensor) => sensor.acoplamento,
    )?.acoplamento;

    if (!acoplamento) {
      return ProcessoPrecheckMapper.buildItem({
        codigo: `ACOPLAMENTO_TANQUE_${tanque.id_tanque}_AUSENTE`,
        titulo: `Acoplamento do tanque ${tanque.nome_tanque}`,
        grupo: 'ACOPLAMENTO',
        status: 'REPROVADO',
        mensagem: 'Tanque nao possui leitura/status de acoplamento carregada.',
        evidencia: null,
        id_recurso: tanque.id_tanque,
        tipo_recurso: 'TANQUE',
      });
    }

    const referenceDate =
      acoplamento.ultima_verificacao ?? acoplamento.ultimo_evento_em;
    const expired = referenceDate
      ? now.getTime() - referenceDate.getTime() >
        PROCESSO_PRECHECK_ACOPLAMENTO_RECENCIA_SEGUNDOS * 1000
      : true;
    const approved =
      acoplamento.ativo &&
      acoplamento.status_acoplamento === StatusAcoplamentoMangueira.ACOPLADA &&
      acoplamento.sinal_detectado &&
      !expired;

    return ProcessoPrecheckMapper.buildItem({
      codigo: `ACOPLAMENTO_TANQUE_${tanque.id_tanque}`,
      titulo: `Acoplamento do tanque ${tanque.nome_tanque}`,
      grupo: 'ACOPLAMENTO',
      status: approved ? 'APROVADO' : 'REPROVADO',
      mensagem: approved
        ? 'Acoplamento confirmado e recente.'
        : 'Acoplamento ausente, desacoplado, sem sinal fisico ou vencido por timeout.',
      evidencia: `status=${acoplamento.status_acoplamento}; sinal=${String(
        acoplamento.sinal_detectado,
      )}`,
      detalhes: {
        ativo: acoplamento.ativo,
        ultima_verificacao: acoplamento.ultima_verificacao,
        ultimo_evento_em: acoplamento.ultimo_evento_em,
        vencido: expired,
        recencia_exigida_segundos:
          PROCESSO_PRECHECK_ACOPLAMENTO_RECENCIA_SEGUNDOS,
      },
      id_recurso: tanque.id_tanque,
      tipo_recurso: 'ACOPLAMENTO',
    });
  }

  private buildValveItems(
    id_processo: number,
    valvulas: ProcessoPrecheckValve[],
    canExecuteCorrection: boolean,
  ): ProcessoPrecheckItem[] {
    const now = new Date();

    if (valvulas.length === 0) {
      return [
        ProcessoPrecheckMapper.buildItem({
          codigo: 'VALVULAS_AUSENTES',
          titulo: 'Valvulas do processo',
          grupo: 'VALVULAS',
          status: 'REPROVADO',
          mensagem: 'Nao ha valvulas vinculadas aos tanques do processo.',
          evidencia: null,
          tipo_recurso: 'VALVULA',
        }),
      ];
    }

    return valvulas.map((valvula) => {
      const evaluation = this.evaluateValvePrecheck(valvula, now);

      return ProcessoPrecheckMapper.buildItem({
        codigo: `VALVULA_${valvula.id_valvula}_VALIDACAO`,
        titulo: valvula.nome_valvula,
        grupo: 'VALVULAS',
        status: evaluation.status,
        mensagem: evaluation.mensagem,
        evidencia: `status_controlador=${valvula.status_valvula}; ultimo_status_controlador_em=${valvula.ultimo_acionamento?.toISOString() ?? 'ausente'}`,
        detalhes: {
          id_tanque: valvula.id_tanque,
          id_bomba: valvula.id_bomba,
          status_controlador_disponivel: evaluation.ackDisponivel,
          status_controlador_recente: evaluation.ackRecente,
          falha_reportada_controlador:
            valvula.status_valvula === StatusValvula.FALHA,
          status_controlador_esperado: StatusValvula.FECHADA,
          feedback_mecanico_disponivel: false,
          recencia_exigida_segundos:
            PROCESSO_PRECHECK_VALVULA_ACK_RECENCIA_SEGUNDOS,
        },
        acao_corretiva: this.buildValveAction(
          id_processo,
          valvula,
          evaluation.status,
          canExecuteCorrection,
        ),
        id_recurso: valvula.id_valvula,
        tipo_recurso: 'VALVULA',
      });
    });
  }

  private buildValveAction(
    id_processo: number,
    valvula: ProcessoPrecheckValve,
    status: ProcessoPrecheckItemStatus,
    canExecuteCorrection: boolean,
  ): ProcessoPrecheckAcaoCorretiva | null {
    if (status === 'APROVADO') {
      return null;
    }

    const hasHardwareMapping =
      Boolean(valvula.codigo_hardware?.trim()) &&
      Boolean(valvula.bomba.codigo_hardware?.trim());
    if (!valvula.ativo || !hasHardwareMapping) {
      const reasons = [
        !valvula.ativo ? 'valvula inativa' : null,
        !valvula.codigo_hardware?.trim()
          ? 'codigo_hardware da valvula ausente'
          : null,
        !valvula.bomba.codigo_hardware?.trim()
          ? 'codigo_hardware da bomba ausente'
          : null,
      ].filter((reason): reason is string => reason !== null);

      return {
        codigo: 'REVISAR_CONFIGURACAO_VALVULA',
        titulo: 'Revisar configuracao da valvula',
        metodo: null,
        endpoint: null,
        disponivel: false,
        requer_confirmacao: false,
        reexecutar_prechecagem: true,
        motivo_indisponibilidade: reasons.join('; '),
      };
    }

    return this.applyCorrectiveActionPermission(
      {
        codigo: 'TESTAR_ESTADO_SEGURO_VALVULA',
        titulo: 'Testar e confirmar estado seguro',
        metodo: 'POST',
        endpoint: `/processos/${id_processo}/valvulas/${valvula.id_valvula}/validar`,
        disponivel: true,
        requer_confirmacao: true,
        reexecutar_prechecagem: true,
        motivo_indisponibilidade: null,
      },
      canExecuteCorrection,
    );
  }

  private buildClosureTopologyItems(
    context: ProcessoOperationalContext,
    valvulas: ProcessoPrecheckValve[],
  ): ProcessoPrecheckItem[] {
    return context.tanques.map((tanque) => {
      const tankValves = valvulas.filter(
        (valvula) =>
          valvula.id_tanque === tanque.id_tanque &&
          valvula.ativo &&
          valvula.funcao_valvula === funcaovalvula.VACUO,
      );
      const principalValves = tankValves.filter(
        (valvula) => valvula.bomba.tipo_bomba === tipobomba.PRINCIPAL,
      );
      const auxiliaryValves = tankValves.filter(
        (valvula) => valvula.bomba.tipo_bomba === tipobomba.AUXILIAR,
      );
      const vacuumSensors = tanque.sensores.filter(
        (sensor) =>
          sensor.ativo_no_processo && sensor.tipo_sensor === tiposensor.VACUO,
      );
      const couplingSensors = tanque.sensores.filter(
        (sensor) =>
          sensor.ativo_no_processo &&
          sensor.acoplamento?.id_sensor === sensor.id_sensor &&
          sensor.acoplamento.id_tanque === tanque.id_tanque,
      );
      const valid =
        principalValves.length === 1 &&
        auxiliaryValves.length === 1 &&
        vacuumSensors.length === 1 &&
        couplingSensors.length === 1 &&
        vacuumSensors[0]?.id_sensor !== couplingSensors[0]?.id_sensor;

      return ProcessoPrecheckMapper.buildItem({
        codigo: `TOPOLOGIA_ENCERRAMENTO_TANQUE_${tanque.id_tanque}`,
        titulo: `Topologia de encerramento do tanque ${tanque.nome_tanque}`,
        grupo: 'TANQUES',
        status: valid ? 'APROVADO' : 'REPROVADO',
        mensagem: valid
          ? 'Tanque possui exatamente uma valvula principal, uma auxiliar, um sensor de vacuo e um sensor de acoplamento.'
          : 'Cada tanque deve possuir exatamente uma valvula principal de vacuo, uma valvula auxiliar de vacuo, um sensor de vacuo e um sensor de acoplamento.',
        evidencia:
          `vp=${principalValves.length}; va=${auxiliaryValves.length}; ` +
          `vacuo=${vacuumSensors.length}; acoplamento=${couplingSensors.length}`,
        detalhes: {
          valvulas_principais: principalValves.map(
            (valvula) => valvula.id_valvula,
          ),
          valvulas_auxiliares: auxiliaryValves.map(
            (valvula) => valvula.id_valvula,
          ),
          sensores_vacuo: vacuumSensors.map((sensor) => sensor.id_sensor),
          sensores_acoplamento: couplingSensors.map(
            (sensor) => sensor.id_sensor,
          ),
        },
        id_recurso: tanque.id_tanque,
        tipo_recurso: 'TANQUE',
      });
    });
  }

  private evaluateValvePrecheck(
    valvula: ProcessoPrecheckValve,
    now: Date,
  ): {
    status: ProcessoPrecheckItemStatus;
    mensagem: string;
    ackDisponivel: boolean;
    ackRecente: boolean;
  } {
    if (!valvula.ativo) {
      return {
        status: 'REPROVADO',
        mensagem: 'Valvula esta inativa.',
        ackDisponivel: false,
        ackRecente: false,
      };
    }

    const ultimoAck = valvula.ultimo_acionamento;
    const ackDisponivel = ultimoAck !== null;
    const ackRecente = ultimoAck
      ? now.getTime() - ultimoAck.getTime() <=
        PROCESSO_PRECHECK_VALVULA_ACK_RECENCIA_SEGUNDOS * 1000
      : false;

    if (!ackDisponivel) {
      return {
        status: 'NAO_CONFIRMADO',
        mensagem:
          'Valvula ativa, mas ainda sem estado logico recebido do ESP32.',
        ackDisponivel,
        ackRecente,
      };
    }

    if (!ackRecente) {
      return {
        status: 'NAO_CONFIRMADO',
        mensagem:
          'Valvula ativa, mas o estado logico informado pelo ESP32 esta vencido.',
        ackDisponivel,
        ackRecente,
      };
    }

    if (valvula.status_valvula === StatusValvula.FALHA) {
      return {
        status: 'REPROVADO',
        mensagem: 'Valvula reportou falha pelo controlador ESP32.',
        ackDisponivel,
        ackRecente,
      };
    }

    if (valvula.status_valvula !== StatusValvula.FECHADA) {
      return {
        status: 'REPROVADO',
        mensagem: `Valvula nao esta em estado seguro para inicio. Estado logico atual: ${valvula.status_valvula}.`,
        ackDisponivel,
        ackRecente,
      };
    }

    return {
      status: 'APROVADO',
      mensagem:
        'Valvula fechada com estado logico recente do ESP32; nao ha feedback mecanico dedicado.',
      ackDisponivel,
      ackRecente,
    };
  }

  private buildBombItems(
    valvulas: ProcessoPrecheckValve[],
  ): ProcessoPrecheckItem[] {
    const bombas = new Map<number, ProcessoPrecheckValve['bomba']>();
    valvulas.forEach((valvula) =>
      bombas.set(valvula.bomba.id_bomba, valvula.bomba),
    );

    if (bombas.size === 0) {
      return [
        ProcessoPrecheckMapper.buildItem({
          codigo: 'BOMBAS_AUSENTES',
          titulo: 'Bombas do processo',
          grupo: 'BOMBAS',
          status: 'REPROVADO',
          mensagem: 'Nao ha bombas vinculadas por valvulas ao processo.',
          evidencia: null,
          tipo_recurso: 'BOMBA',
        }),
      ];
    }

    return Array.from(bombas.values()).map((bomba) =>
      ProcessoPrecheckMapper.buildItem({
        codigo: `BOMBA_${bomba.id_bomba}_ATIVA`,
        titulo: bomba.nome,
        grupo: 'BOMBAS',
        status:
          bomba.status_padrao === statusbomba.ATIVA ? 'APROVADO' : 'REPROVADO',
        mensagem:
          bomba.status_padrao === statusbomba.ATIVA
            ? 'Bomba vinculada esta ativa.'
            : `Bomba esta em status ${bomba.status_padrao}.`,
        evidencia: bomba.status_padrao,
        detalhes: { tipo_bomba: bomba.tipo_bomba },
        id_recurso: bomba.id_bomba,
        tipo_recurso: 'BOMBA',
      }),
    );
  }

  private buildMqttItems(
    readiness: ProcessoMqttHardwareReadiness,
    mqttConfig: ActiveMqttConfig | null,
  ): ProcessoPrecheckItem[] {
    return [
      ProcessoPrecheckMapper.buildItem({
        codigo: 'MQTT_CONFIGURACAO',
        titulo: 'Configuracao MQTT',
        grupo: 'MQTT',
        status: mqttConfig ? 'APROVADO' : 'REPROVADO',
        mensagem: mqttConfig
          ? 'Configuracao MQTT principal encontrada.'
          : 'Configuracao MQTT principal nao encontrada.',
        evidencia: mqttConfig?.topico_comandos ?? null,
        detalhes: mqttConfig
          ? {
              topico_comandos: mqttConfig.topico_comandos,
              topico_status: mqttConfig.topico_status,
              topico_heartbeat: mqttConfig.topico_heartbeat,
            }
          : null,
        tipo_recurso: 'MQTT',
      }),
      ProcessoPrecheckMapper.buildItem({
        codigo: 'MQTT_CREDENCIAIS_CONFIGURADAS',
        titulo: 'Credenciais MQTT configuradas',
        grupo: 'MQTT',
        status: readiness.credentialsConfigured ? 'APROVADO' : 'REPROVADO',
        mensagem: readiness.credentialsConfigured
          ? 'Usuario e senha MQTT estao configurados no arquivo externo seguro.'
          : 'Usuario e senha MQTT ainda nao estao configurados no arquivo externo seguro.',
        evidencia: String(readiness.credentialsConfigured),
        detalhes: {
          usuario_configurado: mqttConfig?.usuario_mqtt_configurado ?? false,
          senha_configurada: mqttConfig?.senha_mqtt_configurada ?? false,
        },
        tipo_recurso: 'MQTT',
      }),
      ProcessoPrecheckMapper.buildItem({
        codigo: 'MQTT_CREDENCIAIS_VERIFICADAS',
        titulo: 'Credenciais MQTT verificadas',
        grupo: 'MQTT',
        status: readiness.credentialsVerified ? 'APROVADO' : 'REPROVADO',
        mensagem: readiness.credentialsVerified
          ? 'O broker aceitou as credenciais MQTT nesta execucao da API.'
          : 'As credenciais MQTT ainda nao foram aceitas pelo broker nesta execucao da API.',
        evidencia: readiness.credentialsVerifiedAt?.toISOString() ?? null,
        detalhes: {
          verificadas_em: readiness.credentialsVerifiedAt,
          ultima_falha: readiness.credentialsFailure,
        },
        tipo_recurso: 'MQTT',
      }),
      ProcessoPrecheckMapper.buildItem({
        codigo: 'MQTT_CONECTADO',
        titulo: 'Conexao MQTT',
        grupo: 'MQTT',
        status: readiness.mqttConnected ? 'APROVADO' : 'REPROVADO',
        mensagem: readiness.mqttConnected
          ? 'MQTT conectado.'
          : 'MQTT desconectado.',
        evidencia: readiness.mqttConnected
          ? statusconexaomqtt.CONECTADO
          : statusconexaomqtt.DESCONECTADO,
        tipo_recurso: 'MQTT',
      }),
      ProcessoPrecheckMapper.buildItem({
        codigo: 'MQTT_CONFIGURACAO_APLICADA',
        titulo: 'Configuracao MQTT aplicada',
        grupo: 'MQTT',
        status:
          (readiness.configurationApplied ?? readiness.mqttConnected)
            ? 'APROVADO'
            : 'REPROVADO',
        mensagem:
          (readiness.configurationApplied ?? readiness.mqttConnected)
            ? 'O cliente conectado usa a configuracao MQTT persistida.'
            : 'A configuracao MQTT persistida nao foi confirmada no cliente conectado.',
        evidencia: String(
          readiness.configurationApplied ?? readiness.mqttConnected,
        ),
        tipo_recurso: 'MQTT',
      }),
    ];
  }

  private buildEsp32Items(
    readiness: ProcessoMqttHardwareReadiness,
  ): ProcessoPrecheckItem[] {
    const state = readiness.currentStatus;

    return [
      ProcessoPrecheckMapper.buildItem({
        codigo: 'ESP32_ONLINE',
        titulo: 'ESP32 online',
        grupo: 'ESP32',
        status: readiness.esp32Online ? 'APROVADO' : 'REPROVADO',
        mensagem: readiness.esp32Online ? 'ESP32 online.' : 'ESP32 offline.',
        evidencia: state?.currentStatus ?? null,
        detalhes: {
          lastHeartbeatAt: state?.lastHeartbeatAt ?? null,
          lastStatusAt: state?.lastStatusAt ?? null,
          lastReadingAt: state?.lastReadingAt ?? null,
        },
        tipo_recurso: 'ESP32',
      }),
      ProcessoPrecheckMapper.buildItem({
        codigo: 'ESP32_COMUNICACAO_PRONTA',
        titulo: 'Comunicacao com hardware',
        grupo: 'ESP32',
        status: readiness.communicationReady ? 'APROVADO' : 'REPROVADO',
        mensagem: readiness.communicationReady
          ? 'Comunicacao operacional pronta.'
          : 'Comunicacao operacional indisponivel.',
        evidencia: String(readiness.communicationReady),
        tipo_recurso: 'ESP32',
      }),
    ];
  }

  private buildSocketItem(): ProcessoPrecheckItem {
    return ProcessoPrecheckMapper.buildItem({
      codigo: 'SOCKET_FEEDBACK',
      titulo: 'Socket.IO de feedback',
      grupo: 'SOCKET',
      status: 'APROVADO',
      obrigatorio: false,
      bloqueante: false,
      mensagem: 'Socket.IO disponivel apenas como feedback visual.',
      evidencia: 'process:precheck-result',
      tipo_recurso: 'SOCKET',
    });
  }

  private buildLogsItem(registrarLog: boolean): ProcessoPrecheckItem {
    return ProcessoPrecheckMapper.buildItem({
      codigo: 'LOGS_OPERACIONAIS',
      titulo: 'Logs operacionais',
      grupo: 'LOGS',
      status: 'APROVADO',
      obrigatorio: false,
      bloqueante: false,
      mensagem: registrarLog
        ? 'Execucao da pre-checagem sera registrada em logs operacionais.'
        : 'Consulta de pre-checagem nao registra log operacional.',
      evidencia: registrarLog ? 'logsoperacionais' : null,
      tipo_recurso: 'LOG',
    });
  }

  private addLegacyStartValidationItem(
    itens: ProcessoPrecheckItem[],
    context: ProcessoOperationalContext,
    activeProcessId: number | null,
  ): void {
    try {
      this.processoStartValidator.validateCanStart({
        context,
        activeProcessId,
      });
      itens.push(
        ProcessoPrecheckMapper.buildItem({
          codigo: 'PROCESSO_VALIDATORS_EXISTENTES',
          titulo: 'Validators existentes',
          grupo: 'PROCESSO',
          status: 'APROVADO',
          mensagem: 'Validators antigos de inicio foram preservados.',
          evidencia: 'ProcessoStartValidator.validateCanStart',
          id_recurso: context.id_processo,
          tipo_recurso: 'PROCESSO',
        }),
      );
    } catch (error) {
      itens.push(
        ProcessoPrecheckMapper.buildItem({
          codigo: 'PROCESSO_VALIDATORS_EXISTENTES',
          titulo: 'Validators existentes',
          grupo: 'PROCESSO',
          status: 'REPROVADO',
          mensagem:
            error instanceof Error
              ? error.message
              : 'Validator antigo de inicio reprovou a pre-checagem.',
          evidencia: 'ProcessoStartValidator.validateCanStart',
          id_recurso: context.id_processo,
          tipo_recurso: 'PROCESSO',
        }),
      );
    }
  }

  private async getRequiredContext(
    id_processo: number,
  ): Promise<ProcessoOperationalContext> {
    const context =
      await this.processosRepository.findOperationalContextById(id_processo);

    if (!context) {
      throw new NotFoundException('Processo nao encontrado.');
    }

    return context;
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

  private resolveCommandConfirmationMarker(results: CommandResult[]): Date {
    const timestamps = results
      .flatMap((result) => [result.ack_received_at, result.published_at])
      .map((value) => this.normalizeDate(value))
      .filter((value): value is Date => value !== null);

    if (timestamps.length === 0) {
      return new Date();
    }

    return new Date(Math.max(...timestamps.map((value) => value.getTime())));
  }

  private async waitForSafeHardwareSnapshot(input: {
    marker: Date;
    timeoutMs: number;
    valves: ProcessoPrecheckValve[];
  }): Promise<SafeHardwareConfirmation> {
    const configuredTimeout = Number.isFinite(input.timeoutMs)
      ? Math.max(0, input.timeoutMs)
      : 0;
    const timeoutMs = Math.min(
      configuredTimeout,
      PREFLIGHT_HARDWARE_TIMEOUT_MAX_MS,
    );
    const deadline = Date.now() + timeoutMs;
    let lastResult: SafeHardwareConfirmation = {
      confirmed: false,
      snapshotReceived: false,
      snapshotReceivedAt: null,
      message:
        'Nao foi recebida telemetria nova do ESP32 depois dos comandos de estado seguro.',
    };

    do {
      const snapshot =
        await this.mqttConfigService.findLatestHardwareStatusSnapshotAfter(
          input.marker,
        );
      if (snapshot) {
        lastResult = this.inspectSafeHardwareSnapshot(
          snapshot,
          input.marker,
          input.valves,
        );
        if (lastResult.confirmed) {
          return lastResult;
        }
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }

      await new Promise<void>((resolve) =>
        setTimeout(
          resolve,
          Math.min(PREFLIGHT_HARDWARE_POLL_INTERVAL_MS, remainingMs),
        ),
      );
    } while (Date.now() <= deadline);

    return lastResult;
  }

  private inspectSafeHardwareSnapshot(
    snapshot: HardwareStatusSnapshot,
    marker: Date,
    valves: ProcessoPrecheckValve[],
  ): SafeHardwareConfirmation {
    const failure = (message: string): SafeHardwareConfirmation => ({
      confirmed: false,
      snapshotReceived: true,
      snapshotReceivedAt: snapshot.receivedAt,
      message,
    });

    if (
      !isControllerStatusTimestampFresh({
        marker,
        receivedAt: snapshot.receivedAt,
        statusAt: snapshot.statusAt,
      })
    ) {
      return failure(
        'A telemetria recebida nao comprova que foi gerada depois dos comandos de estado seguro.',
      );
    }

    if (
      snapshot.payload === null ||
      typeof snapshot.payload !== 'object' ||
      Array.isArray(snapshot.payload)
    ) {
      return failure(
        'A telemetria de estado recebida possui formato invalido.',
      );
    }

    let status: ReturnType<typeof MqttPayloadValidator.validateStatus>;
    try {
      status = MqttPayloadValidator.validateStatus(snapshot.payload);
    } catch (error) {
      return failure(
        `A telemetria de estado foi rejeitada pelo contrato MQTT: ${this.getErrorMessage(error)}`,
      );
    }

    if (
      status.tipo !== 'HARDWARE_STATUS' ||
      status.schema_version !== 2 ||
      !status.device_id?.trim() ||
      status.esp32_on !== true ||
      status.status_geral !== statusgeralsistema.OPERACIONAL ||
      status.emergencia_ativa !== false
    ) {
      return failure(
        'O controlador nao informou estado operacional seguro, identificacao v2 valida e emergencia desativada.',
      );
    }

    if (!Array.isArray(status.valvulas) || !Array.isArray(status.bombas)) {
      return failure(
        'A telemetria v2 nao trouxe as listas de valvulas e bombas exigidas.',
      );
    }

    for (const valve of valves) {
      const hardwareCode = valve.codigo_hardware?.trim();
      if (!hardwareCode) {
        return failure(
          `A valvula ${valve.id_valvula} nao possui codigo_hardware para correlacao segura.`,
        );
      }

      const matches = status.valvulas.filter(
        (item) => item.codigo_hardware === hardwareCode,
      );
      const reported = matches[0];
      if (
        matches.length !== 1 ||
        !reported ||
        (reported.id_valvula !== undefined &&
          reported.id_valvula !== valve.id_valvula) ||
        reported.status_valvula !== StatusValvula.FECHADA ||
        reported.ack !== true ||
        reported.falha !== false ||
        reported.disponivel !== true
      ) {
        return failure(
          `A valvula ${valve.id_valvula} nao foi confirmada de forma univoca como FECHADA, disponivel e sem falha pelo controlador.`,
        );
      }
    }

    const pumps = new Map<number, ProcessoPrecheckValve['bomba']>();
    valves.forEach((valve) => pumps.set(valve.bomba.id_bomba, valve.bomba));
    for (const pump of pumps.values()) {
      const hardwareCode = pump.codigo_hardware?.trim();
      if (!hardwareCode) {
        return failure(
          `A bomba ${pump.id_bomba} nao possui codigo_hardware para correlacao segura.`,
        );
      }

      const matches = status.bombas.filter(
        (item) => item.codigo_hardware === hardwareCode,
      );
      const reported = matches[0];
      if (
        matches.length !== 1 ||
        !reported ||
        (reported.id_bomba !== undefined &&
          reported.id_bomba !== pump.id_bomba) ||
        reported.ligada !== false ||
        reported.disponivel !== true ||
        reported.falha === true
      ) {
        return failure(
          `A bomba ${pump.id_bomba} nao foi confirmada de forma univoca como DESLIGADA, disponivel e sem falha pelo controlador.`,
        );
      }
    }

    return {
      confirmed: true,
      snapshotReceived: true,
      snapshotReceivedAt: snapshot.receivedAt,
      message:
        'O controlador confirmou todas as bombas desligadas e todas as valvulas fechadas.',
    };
  }

  private async assertProcessExists(id_processo: number): Promise<void> {
    const processo = await this.processosRepository.findById(id_processo);

    if (!processo) {
      throw new NotFoundException('Processo nao encontrado.');
    }
  }

  private async getRequiredValve(
    id_processo: number,
    id_valvula: number,
  ): Promise<ProcessoPrecheckValve> {
    const valvula = await this.processosRepository.findValveByProcessId(
      id_processo,
      id_valvula,
    );

    if (!valvula) {
      throw new NotFoundException(
        'Valvula nao pertence ao processo/tanque informado.',
      );
    }

    return valvula;
  }

  private async assertCanOperateValveDuringProcess(
    id_processo: number,
    action: 'abrir' | 'fechar',
  ): Promise<void> {
    const processo = await this.processosRepository.findById(id_processo);

    if (!processo) {
      throw new NotFoundException('Processo nao encontrado.');
    }

    const activeProcessId =
      await this.processosRepository.findActiveProcessId();

    if (
      activeProcessId !== id_processo ||
      processo.status_processo !== statusprocesso.EM_EXECUCAO
    ) {
      throw new ConflictException(
        `Nao e permitido ${action} valvula sem processo ativo.`,
      );
    }

    const generalClosureStatus =
      processo.status_encerramento_geral ?? statusencerramentoprocesso.INATIVO;
    if (
      generalClosureStatus !== statusencerramentoprocesso.INATIVO &&
      generalClosureStatus !== statusencerramentoprocesso.AGUARDANDO_TANQUES
    ) {
      throw new ConflictException(
        `Nao e permitido ${action} valvula durante o encerramento geral do processo.`,
      );
    }
  }

  private assertNotAuxiliaryValve(valvula: ProcessoPrecheckValve): void {
    if (valvula.bomba.tipo_bomba === tipobomba.AUXILIAR) {
      throw new ConflictException(
        'Valvulas auxiliares devem ser controladas exclusivamente pelas rotas do subsistema auxiliar.',
      );
    }
  }

  private assertHardwareReadyForValveCommand(
    readiness: ProcessoMqttHardwareReadiness,
  ): void {
    if (!readiness.credentialsConfigured) {
      throw new ConflictException('Credenciais MQTT nao configuradas.');
    }

    if (!readiness.credentialsVerified) {
      throw new ConflictException('Credenciais MQTT nao verificadas.');
    }

    if (!readiness.mqttConnected) {
      throw new ConflictException('MQTT desconectado.');
    }

    if (!readiness.esp32Online || !readiness.communicationReady) {
      throw new ConflictException('ESP32 offline ou comunicacao indisponivel.');
    }
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

  private hasTechnicalPermission(nivel: nivelacesso): boolean {
    return nivel === nivelacesso.TECNICO || nivel === nivelacesso.ADMINISTRADOR;
  }

  private buildValveActionResult(input: {
    id_processo: number;
    id_valvula: number;
    acao: ProcessoValveActionResult['acao'];
    status: ProcessoPrecheckItemStatus;
    mensagem: string;
    evidencia?: string | null;
    detalhes?: Record<string, unknown> | null;
  }): ProcessoValveActionResult {
    return {
      id_processo: input.id_processo,
      id_valvula: input.id_valvula,
      acao: input.acao,
      status: input.status,
      aprovado: input.status === 'APROVADO',
      mensagem: input.mensagem,
      evidencia: input.evidencia ?? null,
      detalhes: input.detalhes ?? null,
      executado_em: new Date(),
    };
  }

  private async registrarLogPrecheck(
    id_processo: number,
    id_usuario: number,
    resultado: ProcessoPrecheckResultado,
  ): Promise<void> {
    await this.processoLogService.registerUserAction({
      id_usuario,
      id_processo,
      acao: 'PRECHECAGEM_OPERACIONAL_EXECUTADA',
      descricao: resultado.aprovado
        ? 'Pre-checagem operacional aprovada.'
        : `Pre-checagem operacional reprovada. Falhas: ${resultado.falhas_bloqueantes.join('; ')}`,
      resultado: resultado.aprovado
        ? resultadooperacao.SUCESSO
        : resultadooperacao.FALHA,
    });
  }

  private async registrarLogComandoValvula(
    id_processo: number,
    id_usuario: number,
    acao: string,
    descricao: string,
  ): Promise<void> {
    try {
      await this.processoLogService.registerUserAction({
        id_usuario,
        id_processo,
        acao,
        descricao,
        resultado: resultadooperacao.SUCESSO,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao registrar auditoria pos-ACK da acao ${acao} no processo ${id_processo}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private async registrarResultadoValidacaoValvula(
    result: ProcessoValveActionResult,
    id_usuario: number,
  ): Promise<void> {
    try {
      await this.processoLogService.registerUserAction({
        id_usuario,
        id_processo: result.id_processo,
        acao: 'VALVULA_PRECHECK_ESTADO_SEGURO',
        descricao:
          `Teste seguro solicitado para a valvula ${result.id_valvula}: ` +
          `${result.status} - ${result.mensagem}`,
        resultado: result.aprovado
          ? resultadooperacao.SUCESSO
          : resultadooperacao.FALHA,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao registrar auditoria do teste seguro de valvulas no processo ${result.id_processo}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private buildAvisos(itens: ProcessoPrecheckItem[]): string[] {
    return itens
      .filter((item) => item.status === 'NAO_CONFIRMADO')
      .map((item) => item.mensagem);
  }

  private buildRecomendacoes(itens: ProcessoPrecheckItem[]): string[] {
    if (itens.some((item) => item.status === 'NAO_CONFIRMADO')) {
      return [
        'Verificar heartbeat, status e leituras recentes do ESP32. O ACK de comando confirma a saída elétrica; posição mecânica exige sensor dedicado.',
      ];
    }

    return [];
  }

  private normalizeDate(value: Date | string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private isRecentDate(value: Date | null, segundos: number): boolean {
    if (!value) {
      return false;
    }

    return Date.now() - value.getTime() <= segundos * 1000;
  }

  private formatDateEvidence(label: string, value: Date | null): string | null {
    if (!value) {
      return null;
    }

    return `${label}=${value.toISOString()}`;
  }
}
