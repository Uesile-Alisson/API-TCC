import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  StatusAcoplamentoMangueira,
  nivelacesso,
  resultadooperacao,
  statusconexaomqtt,
  statusgeralsistema,
  statusprocesso,
  statussensor,
  statustanque,
  statusbomba,
} from '@prisma/client';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import type { ActiveMqttConfig } from '../../mqtt-hardware/interfaces/active-mqtt-config.interface';
import type {
  ProcessoOperationalContext,
  ProcessoSensorOperationalContext,
  ProcessoTanqueOperationalContext,
} from '../interfaces';
import { ProcessoLogService } from '../logs';
import {
  ProcessoMqttHardwareReadiness,
  ProcessoMqttOrchestratorService,
} from '../mqtt';
import { ProcessosRepository } from '../processos.repository';
import { ProcessosSocketGateway } from '../socket';
import { ProcessoStartValidator } from '../validators';
import {
  PROCESSO_PRECHECK_ACOPLAMENTO_RECENCIA_SEGUNDOS,
  PROCESSO_PRECHECK_SENSOR_RECENCIA_SEGUNDOS,
} from './processo-precheck.constants';
import { ProcessoPrecheckMapper } from './processo-precheck.mapper';
import {
  ProcessoPrecheckItem,
  ProcessoPrecheckItemStatus,
  ProcessoPrecheckOptions,
  ProcessoPrecheckResultado,
  ProcessoPrecheckUser,
  ProcessoPrecheckValve,
  ProcessoValveActionResult,
} from './processo-precheck.types';

@Injectable()
export class ProcessoPrecheckService {
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
  ): Promise<ProcessoValveActionResult> {
    const activeProcessId =
      await this.processosRepository.findActiveProcessId();

    if (activeProcessId) {
      throw new ConflictException(
        'Nao e permitido validar valvulas durante processo ativo.',
      );
    }

    const valvula = await this.getRequiredValve(id_processo, id_valvula);
    const readiness =
      this.processoMqttOrchestratorService.getHardwareReadiness();
    this.assertHardwareReadyForValveCommand(readiness);

    return this.buildValveActionResult({
      id_processo,
      id_valvula,
      acao: 'VALIDAR',
      status: 'NAO_SUPORTADO',
      mensagem:
        'Validacao fisica de valvula depende de protocolo/ACK do ESP32 ainda nao disponivel.',
      evidencia: `Valvula vinculada: ${valvula.nome_valvula}.`,
      detalhes: {
        id_bomba: valvula.id_bomba,
        id_tanque: valvula.id_tanque,
        ack_disponivel: false,
      },
    });
  }

  async abrirValvula(
    id_processo: number,
    id_valvula: number,
    user: ProcessoPrecheckUser,
  ): Promise<ProcessoValveActionResult> {
    await this.assertCanOperateValveDuringProcess(id_processo, 'abrir');
    await this.getRequiredValve(id_processo, id_valvula);
    const readiness =
      this.processoMqttOrchestratorService.getHardwareReadiness();
    this.assertHardwareReadyForValveCommand(readiness);

    const command = await this.commandService.abrirValvula(
      {
        solicitado_por: user.sub,
        motivo: `Abertura manual da valvula ${id_valvula} no processo ${id_processo}.`,
      },
      id_valvula,
    );

    await this.registrarLogComandoValvula(
      id_processo,
      user.sub,
      'VALVULA_ABRIR_SOLICITADA',
      `Comando MQTT de abertura publicado para a valvula ${id_valvula}. Confirmacao fisica pendente.`,
    );

    return this.buildValveActionResult({
      id_processo,
      id_valvula,
      acao: 'ABRIR',
      status: 'NAO_CONFIRMADO',
      mensagem:
        'Comando de abertura publicado, mas nao ha ACK fisico confiavel do ESP32.',
      evidencia: `correlation_id=${command.correlation_id}`,
      detalhes: { command },
    });
  }

  async fecharValvula(
    id_processo: number,
    id_valvula: number,
    user: ProcessoPrecheckUser,
  ): Promise<ProcessoValveActionResult> {
    await this.assertCanOperateValveDuringProcess(id_processo, 'fechar');
    await this.getRequiredValve(id_processo, id_valvula);
    const readiness =
      this.processoMqttOrchestratorService.getHardwareReadiness();
    this.assertHardwareReadyForValveCommand(readiness);

    const command = await this.commandService.fecharValvula(
      {
        solicitado_por: user.sub,
        motivo: `Fechamento manual da valvula ${id_valvula} no processo ${id_processo}.`,
      },
      id_valvula,
    );

    await this.registrarLogComandoValvula(
      id_processo,
      user.sub,
      'VALVULA_FECHAR_SOLICITADA',
      `Comando MQTT de fechamento publicado para a valvula ${id_valvula}. Confirmacao fisica pendente.`,
    );

    return this.buildValveActionResult({
      id_processo,
      id_valvula,
      acao: 'FECHAR',
      status: 'NAO_CONFIRMADO',
      mensagem:
        'Comando de fechamento publicado, mas nao ha ACK fisico confiavel do ESP32.',
      evidencia: `correlation_id=${command.correlation_id}`,
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
      ...this.buildSensorItems(enrichedContext),
      ...this.buildAcoplamentoItems(enrichedContext, executedAt),
      ...this.buildValveItems(valvulas),
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
        this.buildSensorItem(tanque, sensor),
      );
    });
  }

  private buildSensorItem(
    tanque: ProcessoTanqueOperationalContext,
    sensor: ProcessoSensorOperationalContext,
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

    if (sensor.status_sensor !== statussensor.ATIVO) {
      return ProcessoPrecheckMapper.buildItem({
        codigo: `SENSOR_${sensor.id_sensor}_STATUS`,
        titulo: sensor.nome_sensor,
        grupo: 'SENSORES',
        status: 'REPROVADO',
        mensagem: `Sensor esta em status ${sensor.status_sensor}.`,
        evidencia: sensor.status_sensor,
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
      id_recurso: sensor.id_sensor,
      tipo_recurso: 'SENSOR',
    });
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
    valvulas: ProcessoPrecheckValve[],
  ): ProcessoPrecheckItem[] {
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
      const active = valvula.ativo;
      const status: ProcessoPrecheckItemStatus = active
        ? 'NAO_CONFIRMADO'
        : 'REPROVADO';

      return ProcessoPrecheckMapper.buildItem({
        codigo: `VALVULA_${valvula.id_valvula}_VALIDACAO`,
        titulo: valvula.nome_valvula,
        grupo: 'VALVULAS',
        status,
        mensagem: active
          ? 'Valvula esta cadastrada e ativa, mas validacao fisica depende de ACK real do ESP32.'
          : 'Valvula esta inativa.',
        evidencia: `status=${valvula.status_valvula}`,
        detalhes: {
          id_tanque: valvula.id_tanque,
          id_bomba: valvula.id_bomba,
          ack_disponivel: false,
        },
        id_recurso: valvula.id_valvula,
        tipo_recurso: 'VALVULA',
      });
    });
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
  }

  private assertHardwareReadyForValveCommand(
    readiness: ProcessoMqttHardwareReadiness,
  ): void {
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
    await this.processoLogService.registerUserAction({
      id_usuario,
      id_processo,
      acao,
      descricao,
      resultado: resultadooperacao.SUCESSO,
    });
  }

  private buildAvisos(itens: ProcessoPrecheckItem[]): string[] {
    return itens
      .filter((item) => item.status === 'NAO_CONFIRMADO')
      .map((item) => item.mensagem);
  }

  private buildRecomendacoes(itens: ProcessoPrecheckItem[]): string[] {
    if (itens.some((item) => item.status === 'NAO_CONFIRMADO')) {
      return [
        'Implementar ACK/timeout confiavel do ESP32 para confirmar sensores e valvulas fisicamente.',
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
