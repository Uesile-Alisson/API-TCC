import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  nivelacesso,
  statusconexaomqtt,
  statusgeralsistema,
  statusprocesso,
  statussensor,
  statustanque,
  statustanqueprocesso,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import { ProcessoEventService } from './events';
import { CurrentUserPayload, ProcessoOperationalContext } from './interfaces';
import { ProcessoLifecycleService } from './lifecycle';
import { ProcessoLogService } from './logs';
import { ProcessoMetricsService } from './metrics';
import { ProcessoMqttOrchestratorService } from './mqtt';
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

type RepositoryMock = {
  findById: AsyncMock;
  findDetailsById: AsyncMock;
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
    executeEmergencyStop: AsyncMock;
    shutdownAllActuators: AsyncMock;
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
    emitStatusChanged: SyncMock;
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
        mqttConnected: true,
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
      executeEmergencyStop: asyncMock().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
      shutdownAllActuators: asyncMock().mockResolvedValue({
        success: true,
        message: 'ok',
      }),
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
      emitStatusChanged: syncMock(),
    };

    service = new ProcessosService(
      repository as unknown as ProcessosRepository,
      configValidator as unknown as ProcessoConfigValidator,
      stateValidator as unknown as ProcessoStateValidator,
      startValidator as unknown as ProcessoStartValidator,
      lifecycle as unknown as ProcessoLifecycleService,
      metrics as unknown as ProcessoMetricsService,
      events as unknown as ProcessoEventService,
      logs as unknown as ProcessoLogService,
      mqtt as unknown as ProcessoMqttOrchestratorService,
      socket as unknown as ProcessosSocketGateway,
    );
  });

  it('create valida configuracao, cria processo e registra event/log/socket', async () => {
    const processo = makeProcess(statusprocesso.CONFIGURADO);
    const dto = {
      tempo_maximo: 60,
      vacuo_alvo: -80,
      tanques: [
        {
          id_tanque: 1,
          sensores: [{ id_sensor: 1 }],
        },
      ],
    };
    repository.createWithRelations.mockResolvedValue(processo);

    const result = await service.create(dto, user);

    expect(configValidator.validateCreate).toHaveBeenCalledWith(dto);
    expect(repository.createWithRelations).toHaveBeenCalledWith({
      dto,
      id_usuario: 7,
    });
    expect(events.registerProcessCreated).toHaveBeenCalled();
    expect(logs.registerUserAction).toHaveBeenCalled();
    expect(socket.emitProcessCreated).toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      id_processo: 10,
      status_processo: statusprocesso.CONFIGURADO,
    });
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
    repository.updateConfig.mockResolvedValue(
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
    });
    expect(events.registerConfigUpdated).toHaveBeenCalled();
    expect(logs.registerUserAction).toHaveBeenCalled();
    expect(socket.emitConfigUpdated).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.CONFIGURADO);
  });

  it('start valida, chama MQTT, aplica lifecycle e emite socket', async () => {
    const context = makeOperationalContext(statusprocesso.CONFIGURADO);
    const updated = makeProcess(statusprocesso.EM_EXECUCAO);
    repository.findOperationalContextById.mockResolvedValue(context);
    repository.applyLifecycleTransition.mockResolvedValue(updated);

    const result = await service.start(10, user);

    expect(startValidator.validateCanStart).toHaveBeenCalled();
    expect(mqtt.prepareHardwareForStart).toHaveBeenCalled();
    expect(mqtt.startVacuumOperation).toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).toHaveBeenCalled();
    expect(events.registerProcessStarted).toHaveBeenCalled();
    expect(logs.registerProcessStarted).toHaveBeenCalled();
    expect(socket.emitProcessStarted).toHaveBeenCalled();
    expect(socket.emitStatusChanged).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.EM_EXECUCAO);
  });

  it('start lanca ConflictException se MQTT falhar', async () => {
    repository.findOperationalContextById.mockResolvedValue(
      makeOperationalContext(statusprocesso.CONFIGURADO),
    );
    mqtt.prepareHardwareForStart.mockResolvedValueOnce({
      success: false,
      message: 'MQTT indisponivel',
    });

    await expect(service.start(10, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.applyLifecycleTransition).not.toHaveBeenCalled();
  });

  it('pause chama pauseVacuumOperation e aplica transicao', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.EM_EXECUCAO),
    );
    repository.findOperationalContextById.mockResolvedValue(
      makeOperationalContext(statusprocesso.EM_EXECUCAO),
    );
    repository.applyLifecycleTransition.mockResolvedValue(
      makeProcess(statusprocesso.PAUSADO),
    );

    const result = await service.pause(10, user);

    expect(stateValidator.validateCanPause).toHaveBeenCalledWith(
      statusprocesso.EM_EXECUCAO,
    );
    expect(mqtt.pauseVacuumOperation).toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).toHaveBeenCalled();
    expect(events.registerProcessPaused).toHaveBeenCalled();
    expect(logs.registerProcessPaused).toHaveBeenCalled();
    expect(socket.emitProcessPaused).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.PAUSADO);
  });

  it('resume valida hardware novamente e aplica transicao', async () => {
    repository.findOperationalContextById.mockResolvedValue(
      makeOperationalContext(statusprocesso.PAUSADO),
    );
    repository.applyLifecycleTransition.mockResolvedValue(
      makeProcess(statusprocesso.EM_EXECUCAO),
    );

    const result = await service.resume(10, user);

    expect(startValidator.validateCanResume).toHaveBeenCalled();
    expect(mqtt.resumeVacuumOperation).toHaveBeenCalled();
    expect(repository.applyLifecycleTransition).toHaveBeenCalled();
    expect(events.registerProcessResumed).toHaveBeenCalled();
    expect(logs.registerProcessResumed).toHaveBeenCalled();
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
    repository.applyLifecycleTransition.mockResolvedValue(
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
    expect(events.registerProcessFinished).toHaveBeenCalled();
    expect(logs.registerProcessFinished).toHaveBeenCalled();
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
    repository.applyLifecycleTransition.mockResolvedValue(
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
    expect(repository.applyLifecycleTransition).toHaveBeenCalled();
    expect(events.registerProcessInterrupted).toHaveBeenCalled();
    expect(logs.registerProcessInterrupted).toHaveBeenCalled();
    expect(socket.emitProcessInterrupted).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.INTERROMPIDO);
  });

  it('emergencyStop chama parada MQTT, tenta shutdown e aplica transicao', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.EM_EXECUCAO),
    );
    repository.applyLifecycleTransition.mockResolvedValue(
      makeProcess(statusprocesso.INTERROMPIDO),
    );

    const result = await service.emergencyStop(
      10,
      { motivo: 'Falha critica' },
      user,
    );

    expect(mqtt.executeEmergencyStop).toHaveBeenCalledWith({
      id_processo: 10,
      motivo: 'Falha critica',
    });
    expect(mqtt.shutdownAllActuators).toHaveBeenCalledWith(10);
    expect(repository.applyLifecycleTransition).toHaveBeenCalled();
    expect(events.registerEmergencyStop).toHaveBeenCalled();
    expect(logs.registerEmergencyStop).toHaveBeenCalled();
    expect(socket.emitEmergencyStop).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.INTERROMPIDO);
  });

  it('emergencyStop mantem registro mesmo quando comandos MQTT falham', async () => {
    repository.findById.mockResolvedValue(
      makeProcess(statusprocesso.EM_EXECUCAO),
    );
    repository.applyLifecycleTransition.mockResolvedValue(
      makeProcess(statusprocesso.INTERROMPIDO),
    );
    mqtt.executeEmergencyStop.mockResolvedValueOnce({
      success: false,
      message: 'Falha no comando de emergencia',
    });
    mqtt.shutdownAllActuators.mockResolvedValueOnce({
      success: false,
      message: 'Falha ao desligar atuadores',
    });

    const result = await service.emergencyStop(
      10,
      { motivo: 'Falha critica' },
      user,
    );

    expect(repository.applyLifecycleTransition).toHaveBeenCalled();
    expect(events.registerEmergencyStop).toHaveBeenCalled();
    expect(logs.registerEmergencyStop).toHaveBeenCalled();
    expect(result.status_processo).toBe(statusprocesso.INTERROMPIDO);
    expect(result.message).toContain('falha nos comandos MQTT');
  });

  function makeProcess(status: statusprocesso) {
    return {
      id_processo: 10,
      id_usuario: 7,
      nome_processo: 'Processo teste',
      status_processo: status,
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
              ativo_no_processo: true,
              acoplamento: null,
            },
          ],
        },
      ],
      safety: {
        hardware: {
          mqtt_connected: true,
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
