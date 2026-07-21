import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  modooperacaoauxiliar,
  nivelacesso,
  severidadealarme,
  statusconexaomqtt,
  statusauxiliotanque,
  statusbomba,
  statusestagnacao,
  etapaencerramentoprocesso,
  statusencerramentotanque,
  statusencerramentoprocesso,
  faseprocesso,
  statusgeralsistema,
  statusintegridadesensor,
  statusprocesso,
  statussubsistemaauxiliar,
  statussensor,
  statustanque,
  statustanqueprocesso,
  StatusAcoplamentoMangueira,
  StatusValvula,
  tiposensor,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import { ProcessoEventService } from './events';
import { ProcessoAuxiliarCommandService } from './auxiliar';
import { CurrentUserPayload, ProcessoOperationalContext } from './interfaces';
import {
  ProcessoGeneralClosureService,
  ProcessoLifecycleService,
} from './lifecycle';
import { ProcessoLogService } from './logs';
import { ProcessoMetricsService } from './metrics';
import {
  ProcessoMqttOrchestratorService,
  ProcessoStartupService,
} from './mqtt';
import { ProcessoPrecheckService } from './precheck';
import { ProcessosRepository } from './processos.repository';
import { ProcessosService } from './processos.service';
import { ProcessosSocketGateway } from './socket';
import {
  ProcessoConfigValidator,
  ProcessoStartValidator,
  ProcessoStateValidator,
} from './validators';

type SyncMock = Mock<(...args: unknown[]) => unknown>;
type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const syncMock = (): SyncMock => jest.fn<(...args: unknown[]) => unknown>();

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

type TransactionalMutationInput = {
  id_processo?: number;
  persistAudit?: (tx: unknown, idProcesso: number) => Promise<void>;
};

const transactionClient = { kind: 'prisma-transaction-client' };

function mockMutationWithAudit(
  mock: AsyncMock,
  result: unknown,
  options: {
    once?: boolean;
    executeAudit?: boolean;
    idProcesso?: number;
  } = {},
): void {
  const implementation = async (...args: unknown[]): Promise<unknown> => {
    const input = args[0] as TransactionalMutationInput;
    if (options.executeAudit !== false) {
      await input.persistAudit?.(
        transactionClient,
        options.idProcesso ?? input.id_processo ?? 10,
      );
    }
    return result;
  };

  if (options.once) {
    mock.mockImplementationOnce(implementation);
    return;
  }

  mock.mockImplementation(implementation);
}

type RepositoryMock = {
  findById: AsyncMock;
  findDetailsById: AsyncMock;
  findDashboardById: AsyncMock;
  findAuxiliaryStateByProcessId: AsyncMock;
  findActiveProcessId: AsyncMock;
  createWithRelations: AsyncMock;
  applyLifecycleTransition: AsyncMock;
  findOperationalContextById: AsyncMock;
  updateConfig: AsyncMock;
  list: AsyncMock;
  findReadingsForMetrics: AsyncMock;
};

describe('ProcessosService', () => {
  let service: ProcessosService;
  let repository: RepositoryMock;
  let configValidator: { validateCreate: SyncMock; validateUpdate: SyncMock };
  let stateValidator: {
    validateCanPause: SyncMock;
    validaCanConfigure: SyncMock;
    validaeCanInterrupt: SyncMock;
    validateCanFail: SyncMock;
    validateCanFinish: SyncMock;
  };
  let startValidator: {
    validateCanStart: SyncMock;
    validateCanResume: SyncMock;
  };
  let lifecycle: {
    buildStartTransition: SyncMock;
    buildPauseTransition: SyncMock;
    buildResumeTransition: SyncMock;
    buildFinishTransition: SyncMock;
    buildInterruptTransition: SyncMock;
    buildEmergencyStopTransition: SyncMock;
  };
  let metrics: {
    calculateProcessMetrics: SyncMock;
  };
  let generalClosure: {
    requestEmergencyStop: AsyncMock;
  };
  let events: {
    registerProcessCreated: AsyncMock;
    registerProcessStarted: AsyncMock;
    registerProcessPaused: AsyncMock;
    registerProcessResumed: AsyncMock;
    registerProcessFinished: AsyncMock;
    registerProcessInterrupted: AsyncMock;
    registerEmergencyStop: AsyncMock;
    registerConfigUpdated: AsyncMock;
  };
  let logs: {
    registerUserAction: AsyncMock;
    registerProcessStarted: AsyncMock;
    registerProcessPaused: AsyncMock;
    registerProcessResumed: AsyncMock;
    registerProcessFinished: AsyncMock;
    registerProcessInterrupted: AsyncMock;
    registerEmergencyStop: AsyncMock;
  };
  let mqtt: {
    getHardwareReadiness: SyncMock;
    prepareHardwareForStart: AsyncMock;
    startVacuumOperation: AsyncMock;
    pauseVacuumOperation: AsyncMock;
    resumeVacuumOperation: AsyncMock;
    finishVacuumOperation: AsyncMock;
    interruptVacuumOperation: AsyncMock;
    shutdownAllActuators: AsyncMock;
  };
  let precheck: {
    consultar: AsyncMock;
    executar: AsyncMock;
    executarObrigatoriaParaInicio: AsyncMock;
    validarAcoplamentoTanque: AsyncMock;
    validarSensor: AsyncMock;
    listarValvulas: AsyncMock;
    validarValvula: AsyncMock;
    abrirValvula: AsyncMock;
    fecharValvula: AsyncMock;
  };
  let socket: {
    emitProcessCreated: SyncMock;
    emitProcessStarted: SyncMock;
    emitProcessPaused: SyncMock;
    emitProcessResumed: SyncMock;
    emitProcessFinished: SyncMock;
    emitProcessInterrupted: SyncMock;
    emitEmergencyStop: SyncMock;
    emitConfigUpdated: SyncMock;
    emitMetricsUpdated: SyncMock;
    emitAuxiliaryStateUpdated: SyncMock;
    emitStatusChanged: SyncMock;
    emitPrecheckResult: SyncMock;
  };
  let auxiliaryCommand: {
    acquirePumpControl: AsyncMock;
    releasePumpControl: AsyncMock;
    acquireValveControl: AsyncMock;
    releaseValveControl: AsyncMock;
    ligarBomba: AsyncMock;
    desligarBomba: AsyncMock;
    abrirValvula: AsyncMock;
    fecharValvula: AsyncMock;
  };
  let startup: {
    execute: AsyncMock;
  };

  const user: CurrentUserPayload = {
    sub: 7,
    login: 'tecnico',
    id_nivel_acesso: 2,
    nivel_acesso: nivelacesso.TECNICO,
  };

  beforeEach(() => {
    repository = {
      findById: asyncMock(),
      findDetailsById: asyncMock(),
      findDashboardById: asyncMock(),
      findAuxiliaryStateByProcessId: asyncMock().mockResolvedValue(
        makeAuxiliaryStateRaw(),
      ),
      findActiveProcessId: asyncMock().mockResolvedValue(null),
      createWithRelations: asyncMock(),
      applyLifecycleTransition: asyncMock(),
      findOperationalContextById: asyncMock(),
      updateConfig: asyncMock(),
      list: asyncMock(),
      findReadingsForMetrics: jest
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValue({ processostanques: [] }),
    };
    configValidator = {
      validateCreate: syncMock(),
      validateUpdate: syncMock(),
    };
    stateValidator = {
      validateCanPause: syncMock(),
      validaCanConfigure: syncMock(),
      validaeCanInterrupt: syncMock(),
      validateCanFail: syncMock(),
      validateCanFinish: syncMock(),
    };
    startValidator = {
      validateCanStart: syncMock(),
      validateCanResume: syncMock(),
    };
    lifecycle = {
      buildStartTransition: syncMock().mockReturnValue({
        processo: { status_processo: statusprocesso.EM_EXECUCAO },
      }),
      buildPauseTransition: syncMock().mockReturnValue({
        processo: { status_processo: statusprocesso.PAUSADO },
      }),
      buildResumeTransition: syncMock().mockReturnValue({
        processo: { status_processo: statusprocesso.EM_EXECUCAO },
      }),
      buildFinishTransition: syncMock().mockReturnValue({
        processo: { status_processo: statusprocesso.CONCLUIDO },
      }),
      buildInterruptTransition: syncMock().mockReturnValue({
        processo: { status_processo: statusprocesso.INTERROMPIDO },
      }),
      buildEmergencyStopTransition: syncMock().mockReturnValue({
        processo: { status_processo: statusprocesso.INTERROMPIDO },
      }),
    };
    metrics = {
      calculateProcessMetrics: syncMock().mockReturnValue(makeMetrics()),
    };
    generalClosure = {
      requestEmergencyStop: asyncMock(),
    };
    mockMutationWithAudit(generalClosure.requestEmergencyStop, {
      state: makeEmergencyState(),
      previous_status: statusprocesso.EM_EXECUCAO,
      command_results: [],
      command_failures: [],
      idempotent: false,
    });
    events = {
      registerProcessCreated: asyncMock().mockResolvedValue({}),
      registerProcessStarted: asyncMock().mockResolvedValue({}),
      registerProcessPaused: asyncMock().mockResolvedValue({}),
      registerProcessResumed: asyncMock().mockResolvedValue({}),
      registerProcessFinished: asyncMock().mockResolvedValue({}),
      registerProcessInterrupted: asyncMock().mockResolvedValue({}),
      registerEmergencyStop: asyncMock().mockResolvedValue({}),
      registerConfigUpdated: asyncMock().mockResolvedValue({}),
    };
    logs = {
      registerUserAction: asyncMock().mockResolvedValue({}),
      registerProcessStarted: asyncMock().mockResolvedValue({}),
      registerProcessPaused: asyncMock().mockResolvedValue({}),
      registerProcessResumed: asyncMock().mockResolvedValue({}),
      registerProcessFinished: asyncMock().mockResolvedValue({}),
      registerProcessInterrupted: asyncMock().mockResolvedValue({}),
      registerEmergencyStop: asyncMock().mockResolvedValue({}),
    };
    mqtt = {
      getHardwareReadiness: syncMock().mockReturnValue({
        credentialsConfigured: true,
        credentialsVerified: true,
        credentialsVerifiedAt: new Date(),
        credentialsFailure: null,
        mqttConnected: true,
        mqttOperational: true,
        esp32Online: true,
        communicationReady: true,
      }),
      prepareHardwareForStart: asyncMock().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
      startVacuumOperation: asyncMock().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
      pauseVacuumOperation: asyncMock().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
      resumeVacuumOperation: asyncMock().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
      finishVacuumOperation: asyncMock().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
      interruptVacuumOperation: asyncMock().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
      shutdownAllActuators: asyncMock().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
    };
    precheck = {
      consultar: asyncMock(),
      executar: asyncMock(),
      executarObrigatoriaParaInicio: asyncMock().mockResolvedValue({
        aprovado: true,
      }),
      validarAcoplamentoTanque: asyncMock(),
      validarSensor: asyncMock(),
      listarValvulas: asyncMock(),
      validarValvula: asyncMock(),
      abrirValvula: asyncMock(),
      fecharValvula: asyncMock(),
    };
    socket = {
      emitProcessCreated: syncMock(),
      emitProcessStarted: syncMock(),
      emitProcessPaused: syncMock(),
      emitProcessResumed: syncMock(),
      emitProcessFinished: syncMock(),
      emitProcessInterrupted: syncMock(),
      emitEmergencyStop: syncMock(),
      emitConfigUpdated: syncMock(),
      emitMetricsUpdated: syncMock(),
      emitAuxiliaryStateUpdated: syncMock(),
      emitStatusChanged: syncMock(),
      emitPrecheckResult: syncMock(),
    };
    auxiliaryCommand = {
      acquirePumpControl: asyncMock(),
      releasePumpControl: asyncMock(),
      acquireValveControl: asyncMock(),
      releaseValveControl: asyncMock(),
      ligarBomba: asyncMock(),
      desligarBomba: asyncMock(),
      abrirValvula: asyncMock(),
      fecharValvula: asyncMock(),
    };
    startup = {
      execute: asyncMock(),
    };
    mockMutationWithAudit(
      startup.execute,
      makeProcess(statusprocesso.EM_EXECUCAO),
    );

    service = new ProcessosService(
      repository as unknown as ProcessosRepository,
      configValidator as unknown as ProcessoConfigValidator,
      stateValidator as unknown as ProcessoStateValidator,
      startValidator as unknown as ProcessoStartValidator,
      lifecycle as unknown as ProcessoLifecycleService,
      generalClosure as unknown as ProcessoGeneralClosureService,
      metrics as unknown as ProcessoMetricsService,
      events as unknown as ProcessoEventService,
      logs as unknown as ProcessoLogService,
      mqtt as unknown as ProcessoMqttOrchestratorService,
      socket as unknown as ProcessosSocketGateway,
      precheck as unknown as ProcessoPrecheckService,
      auxiliaryCommand as unknown as ProcessoAuxiliarCommandService,
      startup as unknown as ProcessoStartupService,
    );
  });

  it('create valida configuracao, cria processo e registra event/log/socket', async () => {
    const processo = makeProcess(statusprocesso.CONFIGURADO);
    const dto = {
      tempo_maximo: 60,
      vacuo_alvo: -80,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      encerramento_automatico: true,
      tanques: [
        {
          id_tanque: 1,
          sensores: [{ id_sensor: 1 }],
        },
      ],
    };
    mockMutationWithAudit(repository.createWithRelations, processo);

    const result = await service.create(dto, user);

    expect(configValidator.validateCreate).toHaveBeenCalledWith(dto);
    expect(repository.createWithRelations).toHaveBeenCalledWith({
      dto,
      id_usuario: 7,
      persistAudit: expect.any(Function),
    });
    expect(events.registerProcessCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(logs.registerUserAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id_processo: 10,
        id_usuario: 7,
        acao: 'PROCESSO_CRIADO',
      }),
      transactionClient,
    );
    expect(socket.emitProcessCreated).toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      id_processo: 10,
      status_processo: statusprocesso.CONFIGURADO,
    });
  });

  it('propaga falha da auditoria transacional e nao executa efeitos pos-commit', async () => {
    const processo = makeProcess(statusprocesso.CONFIGURADO);
    const auditError = new Error('Falha ao persistir auditoria.');
    const dto = {
      tempo_maximo: 60,
      vacuo_alvo: -80,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      encerramento_automatico: true,
      tanques: [{ id_tanque: 1, sensores: [{ id_sensor: 1 }] }],
    };
    mockMutationWithAudit(repository.createWithRelations, processo);
    logs.registerUserAction.mockRejectedValueOnce(auditError);

    await expect(service.create(dto, user)).rejects.toBe(auditError);

    expect(events.registerProcessCreated).toHaveBeenCalledWith(
      expect.any(Object),
      transactionClient,
    );
    expect(logs.registerUserAction).toHaveBeenCalledWith(
      expect.any(Object),
      transactionClient,
    );
    expect(socket.emitProcessCreated).not.toHaveBeenCalled();
    expect(socket.emitAuxiliaryStateUpdated).not.toHaveBeenCalled();
  });

  it('preserva a resposta de sucesso quando o socket falha apos o commit', async () => {
    const processo = makeProcess(statusprocesso.CONFIGURADO);
    const dto = {
      tempo_maximo: 60,
      vacuo_alvo: -80,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      encerramento_automatico: true,
      tanques: [{ id_tanque: 1, sensores: [{ id_sensor: 1 }] }],
    };
    mockMutationWithAudit(repository.createWithRelations, processo);
    socket.emitProcessCreated.mockImplementationOnce(() => {
      throw new Error('Socket indisponivel.');
    });
    const loggerWarn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);

    const result = await service.create(dto, user);

    expect(result).toMatchObject({
      success: true,
      id_processo: 10,
      status_processo: statusprocesso.CONFIGURADO,
    });
    expect(events.registerProcessCreated).toHaveBeenCalledWith(
      expect.any(Object),
      transactionClient,
    );
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('principal persistida'),
    );
  });

  it('findById retorna processo existente', async () => {
    const processo = makeProcess(statusprocesso.CONFIGURADO);
    repository.findDetailsById.mockResolvedValue(processo);

    await expect(service.findById(10)).resolves.toBe(processo);
  });

  it('findById lanca NotFoundException quando nao encontra', async () => {
    repository.findDetailsById.mockResolvedValue(null);

    await expect(service.findById(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('findActive retorna null quando nao ha processo ativo', async () => {
    repository.findActiveProcessId.mockResolvedValue(null);

    await expect(service.findActive()).resolves.toBeNull();
  });

  it('findActive retorna detalhes do processo ativo', async () => {
    const processo = makeProcess(statusprocesso.EM_EXECUCAO);
    repository.findActiveProcessId.mockResolvedValue(10);
    repository.findDetailsById.mockResolvedValue(processo);

    await expect(service.findActive()).resolves.toBe(processo);
    expect(repository.findDetailsById).toHaveBeenCalledWith(10);
  });

  it('getAuxiliaryState entrega bomba, valvula e posicao da fila', async () => {
    const raw = makeAuxiliaryStateRaw();
    raw.processosauxiliares.status_subsistema =
      statussubsistemaauxiliar.AGUARDANDO;
    raw.processostanques[0].processostanquesauxiliares.status_auxilio =
      statusauxiliotanque.AGUARDANDO;
    raw.processostanques[0].processostanquesauxiliares.prioridade = 5;
    raw.processostanques[0].processostanquesauxiliares.solicitado_em = new Date(
      '2026-01-01T00:02:00Z',
    );
    repository.findAuxiliaryStateByProcessId.mockResolvedValue(raw);

    const state = await service.getAuxiliaryState(10);

    expect(state).toMatchObject({
      id_processo: 10,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      status_subsistema: statussubsistemaauxiliar.AGUARDANDO,
      bomba_auxiliar: {
        id_bomba: 70,
        ligada_hardware: false,
      },
      tanques: [
        {
          id_processo_tanque: 20,
          status_auxilio: statusauxiliotanque.AGUARDANDO,
          posicao_fila: 1,
          quantidade_valvulas_auxiliares: 1,
          valvula_auxiliar: { id_valvula: 60 },
        },
      ],
    });
  });

  it('getAuxiliaryState rejeita processo sem contrato auxiliar inicializado', async () => {
    repository.findAuxiliaryStateByProcessId.mockResolvedValue({
      ...makeAuxiliaryStateRaw(),
      processosauxiliares: null,
    });

    await expect(service.getAuxiliaryState(10)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('notifyAuxiliaryStateUpdated publica snapshot para o escalonador', async () => {
    const result = await service.notifyAuxiliaryStateUpdated(10);

    expect(socket.emitAuxiliaryStateUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        id_processo: 10,
        auxiliary_state: expect.objectContaining({ id_processo: 10 }),
      }),
    );
    expect(result.id_processo).toBe(10);
  });

  it('openAuxiliaryValve publica o snapshot atualizado depois do comando', async () => {
    auxiliaryCommand.abrirValvula.mockResolvedValue({
      success: true,
      action: 'ABRIR_VALVULA_AUXILIAR',
    });
    const dto = {
      expected_subsystem_version: 5,
      expected_tank_version: 3,
      motivo: 'Intervencao supervisionada.',
    };

    const result = await service.openAuxiliaryValve(10, 20, dto, user);

    expect(auxiliaryCommand.abrirValvula).toHaveBeenCalledWith({
      id_processo: 10,
      id_processo_tanque: 20,
      dto,
      user,
    });
    expect(socket.emitAuxiliaryStateUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10 }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        auxiliary_state: expect.objectContaining({ id_processo: 10 }),
      }),
    );
  });

  it('preserva comando auxiliar confirmado quando o snapshot nao pode ser carregado', async () => {
    auxiliaryCommand.abrirValvula.mockResolvedValue({
      success: true,
      action: 'ABRIR_VALVULA_AUXILIAR',
    });
    repository.findAuxiliaryStateByProcessId.mockRejectedValueOnce(
      new Error('Snapshot indisponivel.'),
    );
    const loggerWarn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);
    const dto = {
      expected_subsystem_version: 5,
      expected_tank_version: 3,
      motivo: 'Intervencao supervisionada.',
    };

    const result = await service.openAuxiliaryValve(10, 20, dto, user);

    expect(auxiliaryCommand.abrirValvula).toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      auxiliary_state: null,
      auxiliary_state_warning: expect.stringContaining('snapshot auxiliar'),
    });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('carregar estado auxiliar'),
    );
  });

  it('getDashboard retorna snapshot HTTP dos cards por tanque', async () => {
    repository.findDashboardById.mockResolvedValue({
      processo: {
        id_processo: 10,
        nome_processo: 'Processo teste',
        status_processo: statusprocesso.EM_EXECUCAO,
        fase_processo: faseprocesso.GERANDO_VACUO,
        vacuo_alvo: -80,
        tempo_maximo: 600,
        tempo_execucao: null,
        iniciado_em: new Date('2026-01-01T00:00:00Z'),
        finalizado_em: null,
        parada_emergencia: false,
        encerramento_automatico: true,
        encerramento_tolerancia_vacuo_percentual: 10,
        encerramento_limite_seguranca_vacuo: -95,
        encerramento_tempo_estabilizacao_segundos: 30,
        encerramento_estabilizacao_cobertura_minima_percentual: 80,
        encerramento_intervalo_leitura_esperado_ms: 1000,
        encerramento_timeout_leitura_sensor_ms: 2500,
        encerramento_tempo_retencao_segundos: 30,
        encerramento_perda_vacuo_maxima_retencao: 2,
        encerramento_versao: 0,
        status_encerramento_geral: statusencerramentoprocesso.INATIVO,
        etapa_encerramento_geral: etapaencerramentoprocesso.NENHUMA,
        encerramento_geral_iniciado_em: null,
        encerramento_geral_finalizado_em: null,
        encerramento_geral_confirmacao_iniciada_em: null,
        encerramento_geral_proxima_tentativa_em: null,
        encerramento_geral_tentativa: 0,
        encerramento_geral_comando_tentativas: 0,
        encerramento_geral_ultimo_erro: null,
        processostanques: [
          {
            id_processo_tanque: 20,
            id_tanque: 30,
            status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
            vacuo_alvo: -80,
            vacuo_inicial: -5,
            vacuo_final: -40,
            vacuo_medio: -30,
            eficiencia: null,
            vacuo_atingido: false,
            vacuo_estabilizado: false,
            status_encerramento: statusencerramentotanque.MONITORANDO,
            encerramento_iniciado_em: new Date('2026-01-01T00:00:00Z'),
            isolado_em: null,
            retencao_iniciada_em: null,
            retencao_finalizada_em: null,
            vacuo_isolamento: null,
            perda_vacuo_retencao: null,
            motivo_bloqueio_encerramento: null,
            encerramento_versao: 0,
            estabilizacao_leituras_esperadas: 30,
            estabilizacao_leituras_observadas: 10,
            estabilizacao_cobertura_percentual: 33.33,
            estabilizacao_maior_intervalo_ms: 1000,
            status_estagnacao: statusestagnacao.DETECTADA,
            estagnacao_iniciada_em: new Date('2026-01-01T00:00:00Z'),
            estagnacao_detectada_em: new Date('2026-01-01T00:01:00Z'),
            estagnacao_ultima_avaliacao_em: new Date('2026-01-01T00:01:00Z'),
            estagnacao_variacao_vacuo: 0.4,
            estagnacao_leituras_janela: 6,
            estagnacao_janelas_sem_progresso: 2,
            iniciado_em: new Date('2026-01-01T00:00:00Z'),
            finalizado_em: null,
            tanques: {
              nome: 'Tanque A',
              sensoresacoplamentomangueiras: null,
            },
            alarmes: [{ id_alarme: 99 }],
            processostanquessensores: [
              {
                id_processo_tanque_sensor: 40,
                id_sensor: 50,
                _count: { leiturasensores: 2 },
                leiturasensores: [
                  {
                    id_leitura_sensor: 2,
                    valor_vacuo: -40,
                    valor: -40,
                    leitura_em: new Date('2026-01-01T00:01:00Z'),
                    recebido_em: new Date('2026-01-01T00:01:01Z'),
                  },
                ],
              },
            ],
          },
        ],
      },
      systemConfig: {
        estagnacao_janela_segundos: 60,
        estagnacao_variacao_minima: 2,
        estagnacao_leituras_minimas: 5,
        estagnacao_janelas_consecutivas: 2,
      },
      alarmCounts: [
        {
          severidade: severidadealarme.CRITICO,
          _count: { _all: 1 },
        },
      ],
      latestAlarm: { severidade: severidadealarme.CRITICO },
    });

    const dashboard = await service.getDashboard(10);

    expect(repository.findDashboardById).toHaveBeenCalledWith(10);
    expect(dashboard).toMatchObject({
      id_processo: 10,
      status_processo: statusprocesso.EM_EXECUCAO,
      vacuo_atual: -40,
      progresso_percentual: 0,
      parada_emergencia: {
        ativa: false,
        status: 'INATIVA',
        hardware_confirmado: false,
      },
      alarmes: {
        total: 1,
        criticos: 1,
      },
      tanques: [
        expect.objectContaining({
          id_processo_tanque: 20,
          status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
          vacuo_atingido: false,
          vacuo_estabilizado: false,
          vacuo_atual: -40,
          eficiencia: 50,
          total_sensores: 1,
          total_leituras: 2,
          estagnacao: expect.objectContaining({
            status: statusestagnacao.DETECTADA,
            detectada: true,
            variacao_vacuo: 0.4,
            id_alarme_ativo: 99,
          }),
          encerramento: expect.objectContaining({
            status: statusencerramentotanque.MONITORANDO,
            automatico: true,
            pode_desacoplar: false,
          }),
        }),
      ],
    });
    expect(dashboard.snapshot_at).toBeInstanceOf(Date);
  });

  it('getDashboard lanca NotFoundException para processo inexistente', async () => {
    repository.findDashboardById.mockResolvedValue(null);

    await expect(service.getDashboard(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updateConfig bloqueia processo inexistente', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.updateConfig(999, { tempo_maximo: 120 }, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.updateConfig).not.toHaveBeenCalled();
  });

  it('updateConfig bloqueia status nao configuravel', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.CONCLUIDO),
    );
    stateValidator.validaCanConfigure.mockImplementationOnce(() => {
      throw new BadRequestException('Status final nao permite alteracao.');
    });

    await expect(
      service.updateConfig(10, { tempo_maximo: 120 }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.updateConfig).not.toHaveBeenCalled();
  });

  it('updateConfig valida dto, atualiza repository e emite socket', async () => {
    const dto = { tempo_maximo: 120 };
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.CONFIGURADO),
    );
    mockMutationWithAudit(
      repository.updateConfig,
      makeProcess(statusprocesso.CONFIGURADO),
    );

    const result = await service.updateConfig(10, dto, user);

    expect(stateValidator.validaCanConfigure).toHaveBeenCalledWith(
      statusprocesso.CONFIGURADO,
    );
    expect(configValidator.validateUpdate).toHaveBeenCalledWith(dto);
    expect(repository.updateConfig).toHaveBeenCalledWith({
      id_processo: 10,
      dto,
      persistAudit: expect.any(Function),
    });
    expect(events.registerConfigUpdated).not.toHaveBeenCalled();
    expect(logs.registerUserAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id_processo: 10,
        id_usuario: 7,
        acao: 'PROCESSO_CONFIG_ATUALIZADO',
      }),
      transactionClient,
    );
    expect(socket.emitConfigUpdated).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.CONFIGURADO);
  });

  it('start valida, delega a partida coordenada e emite socket', async () => {
    const context = makeOperationalContext(statusprocesso.CONFIGURADO);
    const updated = makeProcess(statusprocesso.EM_EXECUCAO);
    repository.findOperationalContextById.mockResolvedValue(context);
    mockMutationWithAudit(startup.execute, updated);

    const result = await service.start(10, user);

    expect(precheck.executarObrigatoriaParaInicio).toHaveBeenCalledWith(
      10,
      user,
    );
    expect(startValidator.validateCanStart).toHaveBeenCalled();
    expect(startup.execute).toHaveBeenCalledWith({
      id_processo: 10,
      user,
      mqttContext: expect.objectContaining({ id_processo: 10 }),
      persistAudit: expect.any(Function),
    });
    expect(mqtt.prepareHardwareForStart).not.toHaveBeenCalled();
    expect(mqtt.startVacuumOperation).not.toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).not.toHaveBeenCalled();
    expect(events.registerProcessStarted).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(logs.registerProcessStarted).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(socket.emitProcessStarted).toHaveBeenCalled();
    expect(socket.emitStatusChanged).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.EM_EXECUCAO);
  });

  it('start nao altera status quando pre-checagem reprova', async () => {
    precheck.executarObrigatoriaParaInicio.mockRejectedValueOnce(
      new ConflictException('Pre-checagem operacional reprovada.'),
    );

    await expect(service.start(10, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.applyLifecycleTransition).not.toHaveBeenCalled();
    expect(mqtt.prepareHardwareForStart).not.toHaveBeenCalled();
    expect(startup.execute).not.toHaveBeenCalled();
  });

  it('start propaga falha da partida coordenada sem usar caminho legado', async () => {
    repository.findOperationalContextById.mockResolvedValue(
      makeOperationalContext(statusprocesso.CONFIGURADO),
    );
    startup.execute.mockRejectedValueOnce(
      new ConflictException('MQTT indisponivel'),
    );

    await expect(service.start(10, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(startup.execute).toHaveBeenCalled();
    expect(mqtt.prepareHardwareForStart).not.toHaveBeenCalled();
    expect(mqtt.startVacuumOperation).not.toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).not.toHaveBeenCalled();
  });

  it('pause chama pauseVacuumOperation e aplica transicao', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.EM_EXECUCAO),
    );
    repository.findOperationalContextById.mockResolvedValue(
      makeOperationalContext(statusprocesso.EM_EXECUCAO),
    );
    mockMutationWithAudit(
      repository.applyLifecycleTransition,
      makeProcess(statusprocesso.PAUSADO),
    );

    const result = await service.pause(10, user);

    expect(stateValidator.validateCanPause).toHaveBeenCalledWith(
      statusprocesso.EM_EXECUCAO,
    );
    expect(mqtt.pauseVacuumOperation).toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({ persistAudit: expect.any(Function) }),
    );
    expect(events.registerProcessPaused).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(logs.registerProcessPaused).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(socket.emitProcessPaused).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.PAUSADO);
  });

  it('resume valida hardware novamente e aplica transicao', async () => {
    repository.findOperationalContextById.mockResolvedValue(
      makeOperationalContext(statusprocesso.PAUSADO),
    );
    mockMutationWithAudit(
      repository.applyLifecycleTransition,
      makeProcess(statusprocesso.EM_EXECUCAO),
    );

    const result = await service.resume(10, user);

    expect(startValidator.validateCanResume).toHaveBeenCalled();
    expect(mqtt.resumeVacuumOperation).toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({ persistAudit: expect.any(Function) }),
    );
    expect(events.registerProcessResumed).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(logs.registerProcessResumed).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(socket.emitProcessResumed).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.EM_EXECUCAO);
  });

  it('finish calcula metricas, finaliza e emite metricas', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.EM_EXECUCAO),
    );
    repository.findOperationalContextById.mockResolvedValue(
      makeOperationalContext(statusprocesso.EM_EXECUCAO),
    );
    mockMutationWithAudit(
      repository.applyLifecycleTransition,
      makeProcess(statusprocesso.CONCLUIDO),
    );

    const result = await service.finish(
      10,
      { observacao: 'Finalizado sem falhas.' },
      user,
    );

    expect(stateValidator.validateCanFinish).toHaveBeenCalledWith(
      statusprocesso.EM_EXECUCAO,
    );
    expect(mqtt.finishVacuumOperation).toHaveBeenCalled();
    expect(metrics.calculateProcessMetrics).toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({ persistAudit: expect.any(Function) }),
    );
    expect(events.registerProcessFinished).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(logs.registerProcessFinished).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(socket.emitProcessFinished).toHaveBeenCalled();
    expect(socket.emitMetricsUpdated).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.CONCLUIDO);
  });

  it('interrupt desliga operacao, aplica status e registra log/evento', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.EM_EXECUCAO),
    );
    repository.findOperationalContextById.mockResolvedValue(
      makeOperationalContext(statusprocesso.EM_EXECUCAO),
    );
    mockMutationWithAudit(
      repository.applyLifecycleTransition,
      makeProcess(statusprocesso.INTERROMPIDO),
    );

    const result = await service.interrupt(
      10,
      { motivo: 'Interrupcao operacional.' },
      user,
    );

    expect(stateValidator.validaeCanInterrupt).toHaveBeenCalledWith(
      statusprocesso.EM_EXECUCAO,
    );
    expect(mqtt.interruptVacuumOperation).toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).toHaveBeenCalledWith(
      expect.objectContaining({ persistAudit: expect.any(Function) }),
    );
    expect(events.registerProcessInterrupted).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(logs.registerProcessInterrupted).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(socket.emitProcessInterrupted).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.INTERROMPIDO);
  });

  it('emergencyStop delega ao coordenador persistente e nao declara hardware seguro antes da telemetria', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.EM_EXECUCAO),
    );

    const result = await service.emergencyStop(
      10,
      { motivo: 'Falha critica' },
      user,
    );

    expect(generalClosure.requestEmergencyStop).toHaveBeenCalledWith({
      id_processo: 10,
      id_usuario: 7,
      motivo: 'Falha critica',
      persistAudit: expect.any(Function),
    });
    expect(mqtt.shutdownAllActuators).not.toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).not.toHaveBeenCalled();
    expect(events.registerEmergencyStop).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(logs.registerEmergencyStop).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(socket.emitEmergencyStop).toHaveBeenCalledWith(
      expect.objectContaining({
        parada_emergencia: expect.objectContaining({
          hardware_confirmado: false,
          status: 'AGUARDANDO_CONFIRMACAO',
        }),
      }),
    );
    expect(result.status_processo).toBe(statusprocesso.INTERROMPIDO);
    expect(result.data).toMatchObject({
      parada_emergencia: {
        hardware_confirmado: false,
      },
    });
  });

  it('emergencyStop persiste e comunica falha do controlador sem apresentar seguranca', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.EM_EXECUCAO),
    );
    mockMutationWithAudit(
      generalClosure.requestEmergencyStop,
      {
        state: makeEmergencyState({
          status: 'FALHA',
          requer_intervencao: true,
          ultimo_erro: 'Telemetria nao confirmou o estado seguro.',
        }),
        previous_status: statusprocesso.EM_EXECUCAO,
        command_results: [],
        command_failures: [
          { comando: 'PARADA_EMERGENCIA', message: 'Broker indisponivel' },
        ],
        idempotent: false,
      },
      { once: true },
    );

    const result = await service.emergencyStop(
      10,
      { motivo: 'Falha critica' },
      user,
    );

    expect(events.registerEmergencyStop).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(logs.registerEmergencyStop).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10, id_usuario: 7 }),
      transactionClient,
    );
    expect(result.status_processo).toBe(statusprocesso.INTERROMPIDO);
    expect(result.message).toContain(
      'controlador nao confirmou o latch e todas as saidas logicas',
    );
    expect(result.data).toMatchObject({
      parada_emergencia: {
        hardware_confirmado: false,
        requer_intervencao: true,
      },
    });
  });

  it('emergencyStop permite retry de processo interrompido sem duplicar evento semantico', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.INTERROMPIDO),
    );
    mockMutationWithAudit(
      generalClosure.requestEmergencyStop,
      {
        state: makeEmergencyState(),
        previous_status: statusprocesso.INTERROMPIDO,
        command_results: [],
        command_failures: [],
        idempotent: true,
      },
      { once: true, executeAudit: false },
    );

    await service.emergencyStop(10, { motivo: 'Repetir parada' }, user);

    expect(generalClosure.requestEmergencyStop).toHaveBeenCalledWith(
      expect.objectContaining({ persistAudit: expect.any(Function) }),
    );
    expect(events.registerEmergencyStop).not.toHaveBeenCalled();
    expect(logs.registerEmergencyStop).not.toHaveBeenCalled();
    expect(socket.emitStatusChanged).not.toHaveBeenCalled();
  });

  function makeEmergencyState(overrides: Record<string, unknown> = {}) {
    return {
      ativa: true,
      status: 'AGUARDANDO_CONFIRMACAO',
      etapa: 'AGUARDANDO_TELEMETRIA',
      hardware_confirmado: false,
      nivel_confirmacao: 'NAO_CONFIRMADO',
      latch_emergencia_confirmado: false,
      saidas_controlador_confirmadas: false,
      feedback_mecanico_disponivel: false,
      requer_intervencao: false,
      solicitada_em: new Date('2026-07-19T18:00:00.000Z'),
      confirmada_em: null,
      proxima_tentativa_em: null,
      tentativa: 1,
      comando_tentativas: 1,
      ultimo_erro: null,
      versao: 2,
      ...overrides,
    };
  }

  function makeAuxiliaryStateRaw() {
    return {
      id_processo: 10,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      processosauxiliares: {
        status_subsistema:
          statussubsistemaauxiliar.INATIVO as statussubsistemaauxiliar,
        versao: 0,
        motivo_bloqueio: null,
        ultimo_erro: null,
        atualizado_em: new Date('2026-01-01T00:00:00Z'),
        controle_bomba_assumido_em: null,
        controle_bomba_expira_em: null,
        usuario_controle_bomba: null,
        processo_tanque_atual: null,
      },
      processostanques: [
        {
          id_processo_tanque: 20,
          id_tanque: 30,
          tanques: {
            nome: 'Tanque A',
            sensoresacoplamentomangueiras: {
              status_acoplamento: StatusAcoplamentoMangueira.ACOPLADA,
            },
            valvulas: [
              {
                id_valvula: 60,
                nome_valvula: 'Valvula auxiliar T1',
                codigo_hardware: 'VA_T1',
                status_valvula: StatusValvula.FECHADA,
                ativo: true,
                ultimo_acionamento: null,
                bombas: {
                  id_bomba: 70,
                  nome: 'Bomba auxiliar',
                  codigo_hardware: 'BOMBA_AUXILIAR',
                  status_padrao: statusbomba.ATIVA,
                  ligada_hardware: false,
                  disponivel_hardware: true,
                  ultimo_status_hardware_em: new Date('2026-01-01T00:00:00Z'),
                },
              },
            ],
          },
          processostanquesauxiliares: {
            id_processo_tanque_auxiliar: 80,
            status_auxilio: statusauxiliotanque.INATIVO as statusauxiliotanque,
            prioridade: 0,
            solicitado_em: null as Date | null,
            iniciado_em: null,
            finalizado_em: null,
            versao: 0,
            motivo_bloqueio: null,
            ultimo_erro: null,
            controle_valvula_assumido_em: null,
            controle_valvula_expira_em: null,
            usuario_controle_valvula: null,
          },
        },
      ],
    };
  }

  function makeProcess(status: statusprocesso) {
    return {
      id_processo: 10,
      id_usuario: 7,
      nome_processo: 'Processo teste',
      status_processo: status,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      encerramento_automatico: true,
      encerramento_versao: 0,
      encerramento_tolerancia_vacuo_percentual: 10,
      encerramento_limite_seguranca_vacuo: -95,
      encerramento_tempo_estabilizacao_segundos: 30,
      encerramento_estabilizacao_cobertura_minima_percentual: 80,
      encerramento_intervalo_leitura_esperado_ms: 1000,
      encerramento_timeout_leitura_sensor_ms: 2500,
      encerramento_tempo_retencao_segundos: 30,
      encerramento_perda_vacuo_maxima_retencao: 2,
      vacuo_alvo: -80,
      vacuo_inicial: null,
      vacuo_final: null,
      vacuo_medio: null,
      eficiencia: null,
      tempo_maximo: 60,
      tempo_execucao: null,
      iniciado_em: new Date('2026-01-01T00:00:00Z'),
      pausado_em: null,
      retomado_em: null,
      finalizado_em: null,
      parada_emergencia: false,
      criado_em: new Date('2026-01-01T00:00:00Z'),
    };
  }

  function makeOperationalContext(
    status: statusprocesso,
  ): ProcessoOperationalContext {
    return {
      id_processo: 10,
      id_usuario: 7,
      nome_processo: 'Processo teste',
      status_processo: status,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      encerramento_automatico: true,
      encerramento_versao: 0,
      encerramento_tolerancia_vacuo_percentual: 10,
      encerramento_limite_seguranca_vacuo: -95,
      encerramento_tempo_estabilizacao_segundos: 30,
      encerramento_estabilizacao_cobertura_minima_percentual: 80,
      encerramento_intervalo_leitura_esperado_ms: 1000,
      encerramento_timeout_leitura_sensor_ms: 2500,
      encerramento_tempo_retencao_segundos: 30,
      encerramento_perda_vacuo_maxima_retencao: 2,
      vacuo_alvo: -80,
      vacuo_inicial: null,
      vacuo_final: null,
      vacuo_medio: null,
      eficiencia: null,
      tempo_maximo: 60,
      tempo_execucao: null,
      iniciado_em: null,
      pausado_em: null,
      retomado_em: null,
      finalizado_em: null,
      parada_emergencia: false,
      criado_em: new Date('2026-01-01T00:00:00Z'),
      tanques: [
        {
          id_processo_tanque: 20,
          id_tanque: 30,
          nome_tanque: 'Tanque A',
          volume: 100,
          unidade_volume: 'L',
          status_tanque: statustanque.ATIVO,
          vacuo_alvo: -80,
          vacuo_inicial: null,
          vacuo_final: null,
          vacuo_medio: null,
          eficiencia: null,
          status_tanque_processo: statustanqueprocesso.CONFIGURADO,
          vacuo_atingido: false,
          vacuo_estabilizado: false,
          status_encerramento: statusencerramentotanque.INATIVO,
          encerramento_versao: 0,
          iniciado_em: null,
          finalizado_em: null,
          sensores: [
            {
              id_processo_tanque_sensor: 40,
              id_sensor: 50,
              nome_sensor: 'Sensor A',
              modelo_sensor: 'MPX',
              unidade_medida: 'kPa',
              status_sensor: statussensor.ATIVO,
              tipo_sensor: tiposensor.VACUO,
              status_integridade: statusintegridadesensor.VALIDO,
              calibrado_em: null,
              calibracao_valida_ate: null,
              modo_calibracao_ativo: false,
              liberado_em: null,
              integridade_ultimo_erro: null,
              ultima_leitura: new Date(),
              ultimo_valor_lido: -70,
              ativo_no_processo: true,
              acoplamento: null,
            },
          ],
        },
      ],
      safety: {
        hardware: {
          mqtt_credentials_configured: true,
          mqtt_credentials_verified: true,
          mqtt_credentials_verified_at: new Date(),
          mqtt_credentials_failure: null,
          mqtt_connected: true,
          mqtt_operational: true,
          mqtt_status: statusconexaomqtt.CONECTADO,
          esp32_online: true,
          esp32_status: statusgeralsistema.OPERACIONAL,
          last_heartbeat_at: null,
          last_status_at: null,
          last_reading_at: null,
          communication_ready: true,
        },
        has_critical_alarm: false,
        critical_alarms: [],
        all_tanks_ready: true,
        all_sensors_ready: true,
        all_acoplamentos_ready: true,
        can_start: true,
        blocking_reasons: [],
      },
    };
  }

  function makeMetrics() {
    return {
      id_processo: 10,
      vacuo_alvo: -80,
      vacuo_inicial: -10,
      vacuo_final: -75,
      vacuo_medio: -55,
      eficiencia: 93.75,
      tempo_execucao: 60,
      total_tanques: 1,
      total_sensores: 1,
      total_leituras: 2,
      total_alarmes: 0,
      total_eventos: 0,
      tanques: [],
    };
  }
});
