import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  StatusAcoplamentoMangueira,
  StatusValvula,
  funcaovalvula,
  modooperacaoauxiliar,
  nivelacesso,
  statusbomba,
  statusconexaomqtt,
  statusgeralsistema,
  statusintegridadesensor,
  statusencerramentotanque,
  statusprocesso,
  statussensor,
  statustanque,
  statustanqueprocesso,
  tipobomba,
  tiposensor,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import { ProcessoLogService } from '../logs';
import { ProcessoOperationalContext } from '../interfaces';
import { ProcessoMqttOrchestratorService } from '../mqtt';
import { ProcessosRepository } from '../processos.repository';
import { ProcessosSocketGateway } from '../socket';
import { ProcessoStartValidator } from '../validators';
import { ProcessoPrecheckService } from './processo-precheck.service';
import { ProcessoPrecheckUser } from './processo-precheck.types';

type SyncMock = Mock<(...args: unknown[]) => unknown>;
type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const syncMock = (): SyncMock => jest.fn<(...args: unknown[]) => unknown>();
const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('ProcessoPrecheckService', () => {
  let service: ProcessoPrecheckService;
  let repository: {
    findOperationalContextById: AsyncMock;
    findActiveProcessId: AsyncMock;
    findValvesByProcessId: AsyncMock;
    findValveByProcessId: AsyncMock;
    findTankClosureByProcessAndTank: AsyncMock;
    findById: AsyncMock;
  };
  let startValidator: { validateCanStart: SyncMock };
  let logs: { registerUserAction: AsyncMock };
  let mqtt: {
    getHardwareReadiness: SyncMock;
    prepareHardwareForStart: AsyncMock;
  };
  let socket: { emitPrecheckResult: SyncMock };
  let commandService: {
    abrirValvula: AsyncMock;
    fecharValvula: AsyncMock;
  };
  let mqttConfig: {
    getConfig: AsyncMock;
    claimOperationalControlLease: AsyncMock;
    releaseOperationalControlLease: AsyncMock;
    findLatestHardwareStatusSnapshotAfter: AsyncMock;
  };

  const user: ProcessoPrecheckUser = {
    sub: 7,
    login: 'tecnico',
    id_nivel_acesso: 2,
    nivel_acesso: nivelacesso.TECNICO,
  };

  beforeEach(() => {
    repository = {
      findOperationalContextById: asyncMock().mockResolvedValue(makeContext()),
      findActiveProcessId: asyncMock().mockResolvedValue(null),
      findValvesByProcessId: asyncMock().mockResolvedValue([
        makeValve(),
        makeAuxiliaryValve(),
      ]),
      findValveByProcessId: asyncMock().mockResolvedValue(makeValve()),
      findTankClosureByProcessAndTank: asyncMock().mockResolvedValue({
        status_encerramento: statusencerramentotanque.MONITORANDO,
      }),
      findById: asyncMock().mockResolvedValue({
        id_processo: 10,
        status_processo: statusprocesso.CONFIGURADO,
      }),
    };
    startValidator = {
      validateCanStart: syncMock(),
    };
    logs = {
      registerUserAction: asyncMock().mockResolvedValue({}),
    };
    mqtt = {
      getHardwareReadiness: syncMock().mockReturnValue(makeReadiness()),
      prepareHardwareForStart: asyncMock().mockResolvedValue({
        success: true,
        message: 'Hardware preparado com sucesso.',
        id_processo: 10,
        command_results: [
          {
            comando: 'SINCRONIZAR_HARDWARE',
            topic: 'tsea/comandos',
            qos: 1,
            retain: false,
            correlation_id: 'safe-state-1',
            published_at: new Date(Date.now() - 200),
            acknowledged: true,
            ack_status: 'EXECUTADO',
            ack_received_at: new Date(Date.now() - 100),
          },
        ],
      }),
    };
    socket = {
      emitPrecheckResult: syncMock(),
    };
    commandService = {
      abrirValvula: asyncMock().mockResolvedValue({
        correlation_id: 'cmd-1',
        comando: 'ABRIR_VALVULA',
        acknowledged: true,
        ack_status: 'EXECUTADO',
      }),
      fecharValvula: asyncMock().mockResolvedValue({
        correlation_id: 'cmd-2',
        comando: 'FECHAR_VALVULA',
        acknowledged: true,
        ack_status: 'EXECUTADO',
      }),
    };
    mqttConfig = {
      getConfig: asyncMock().mockResolvedValue({
        usuario_mqtt_configurado: true,
        senha_mqtt_configurada: true,
        topico_comandos: 'tsea/comandos',
        topico_status: 'tsea/status',
        topico_heartbeat: 'tsea/heartbeat',
        timeout_comunicacao: 0,
      }),
      claimOperationalControlLease: asyncMock().mockResolvedValue(undefined),
      releaseOperationalControlLease: asyncMock().mockResolvedValue(undefined),
      findLatestHardwareStatusSnapshotAfter: asyncMock().mockImplementation(
        (...args: unknown[]) => {
          const marker = args[0] as Date;
          const receivedAt = new Date(marker.getTime() + 200);
          return Promise.resolve({
            id: 1,
            topic: 'tsea/status',
            receivedAt,
            statusAt: new Date(marker.getTime() + 100),
            payload: makeSafeHardwareStatus(receivedAt),
          });
        },
      ),
    };

    service = new ProcessoPrecheckService(
      repository as unknown as ProcessosRepository,
      startValidator as unknown as ProcessoStartValidator,
      logs as unknown as ProcessoLogService,
      mqtt as unknown as ProcessoMqttOrchestratorService,
      socket as unknown as ProcessosSocketGateway,
      commandService as unknown as CommandService,
      mqttConfig as unknown as MqttConfigService,
    );
  });

  it('GET prechecagem retorna checklist sem acionar hardware, log ou socket', async () => {
    const result = await service.consultar(10, {
      ...user,
      nivel_acesso: nivelacesso.OPERADOR,
    });

    expect(result.id_processo).toBe(10);
    expect(result.itens.length).toBeGreaterThan(0);
    expect(commandService.abrirValvula).not.toHaveBeenCalled();
    expect(commandService.fecharValvula).not.toHaveBeenCalled();
    expect(logs.registerUserAction).not.toHaveBeenCalled();
    expect(socket.emitPrecheckResult).not.toHaveBeenCalled();
    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'SENSOR_51_CALIBRACAO',
          acao_corretiva: expect.objectContaining({
            codigo: 'CALIBRAR_SENSOR',
            disponivel: false,
            motivo_indisponibilidade: expect.stringContaining('TECNICO'),
          }),
        }),
      ]),
    );
  });

  it('aprova a topologia completa de encerramento por tanque', async () => {
    const result = await service.consultar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'TOPOLOGIA_ENCERRAMENTO_TANQUE_30',
          status: 'APROVADO',
        }),
      ]),
    );
  });

  it('reprova a topologia quando falta a valvula auxiliar do tanque', async () => {
    repository.findValvesByProcessId.mockResolvedValueOnce([makeValve()]);

    const result = await service.consultar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'TOPOLOGIA_ENCERRAMENTO_TANQUE_30',
          status: 'REPROVADO',
        }),
      ]),
    );
  });

  it('POST executar emite socket, registra log e reprova valvula sem ACK', async () => {
    const result = await service.executar(10, user);

    expect(result.aprovado).toBe(false);
    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          grupo: 'VALVULAS',
          status: 'NAO_CONFIRMADO',
        }),
      ]),
    );
    expect(logs.registerUserAction).toHaveBeenCalled();
    expect(socket.emitPrecheckResult).toHaveBeenCalled();
  });

  it('aprova valvula ativa com ACK recente e status FECHADA', async () => {
    repository.findValvesByProcessId.mockResolvedValueOnce([
      makeValve({ ultimo_acionamento: new Date() }),
    ]);

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          grupo: 'VALVULAS',
          status: 'APROVADO',
          acao_corretiva: null,
        }),
      ]),
    );
  });

  it('reprova valvula inativa', async () => {
    repository.findValvesByProcessId.mockResolvedValueOnce([
      makeValve({ ativo: false }),
    ]);

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          grupo: 'VALVULAS',
          status: 'REPROVADO',
          acao_corretiva: expect.objectContaining({
            codigo: 'REVISAR_CONFIGURACAO_VALVULA',
            disponivel: false,
            endpoint: null,
          }),
        }),
      ]),
    );
  });

  it('mantem NAO_CONFIRMADO quando ACK da valvula esta vencido', async () => {
    repository.findValvesByProcessId.mockResolvedValueOnce([
      makeValve({
        ultimo_acionamento: new Date(Date.now() - 120_000),
      }),
    ]);

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          grupo: 'VALVULAS',
          status: 'NAO_CONFIRMADO',
          acao_corretiva: expect.objectContaining({
            codigo: 'TESTAR_ESTADO_SEGURO_VALVULA',
            endpoint: '/processos/10/valvulas/99/validar',
          }),
        }),
      ]),
    );
  });

  it('reprova valvula com ACK recente em status ABERTA', async () => {
    repository.findValvesByProcessId.mockResolvedValueOnce([
      makeValve({
        status_valvula: StatusValvula.ABERTA,
        ultimo_acionamento: new Date(),
      }),
    ]);

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          grupo: 'VALVULAS',
          status: 'REPROVADO',
        }),
      ]),
    );
  });

  it('reprova quando MQTT esta offline', async () => {
    mqtt.getHardwareReadiness.mockReturnValueOnce({
      ...makeReadiness(),
      mqttConnected: false,
      communicationReady: false,
    });

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'MQTT_CONECTADO',
          status: 'REPROVADO',
        }),
      ]),
    );
  });

  it('reprova credenciais configuradas que ainda nao foram verificadas pelo broker', async () => {
    mqtt.getHardwareReadiness.mockReturnValueOnce({
      ...makeReadiness(),
      credentialsVerified: false,
      credentialsVerifiedAt: null,
      mqttOperational: false,
      communicationReady: false,
    });

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'MQTT_CREDENCIAIS_VERIFICADAS',
          status: 'REPROVADO',
          bloqueante: true,
        }),
      ]),
    );
  });

  it('reprova acoplamento desacoplado por tanque', async () => {
    const context = makeContext();
    (
      context.tanques[0].sensores[0].acoplamento as {
        status_acoplamento: StatusAcoplamentoMangueira;
      }
    ).status_acoplamento = StatusAcoplamentoMangueira.DESACOPLADA;
    repository.findOperationalContextById.mockResolvedValueOnce(context);

    const result = await service.validarAcoplamentoTanque(10, 30);

    expect(result.status).toBe('REPROVADO');
  });

  it('bloqueia sensor nao vinculado ao processo', async () => {
    await expect(service.validarSensor(10, 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('aprova sensor com leitura diagnostica recente registrada no sensor fisico', async () => {
    const context = makeContext();
    context.tanques[0].sensores[0].acoplamento = null;
    context.tanques[0].sensores[0].ultima_leitura = new Date();
    repository.findOperationalContextById.mockResolvedValueOnce(context);

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'SENSOR_50_RESPOSTA',
          status: 'APROVADO',
        }),
      ]),
    );
  });

  it('recusa sensor sem leitura recente registrada no sensor fisico', async () => {
    const context = makeContext();
    context.tanques[0].sensores[0].acoplamento = null;
    context.tanques[0].sensores[0].ultima_leitura = new Date(
      Date.now() - 120_000,
    );
    repository.findOperationalContextById.mockResolvedValueOnce(context);

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'SENSOR_50_RESPOSTA',
          status: 'NAO_CONFIRMADO',
          acao_corretiva: expect.objectContaining({
            codigo: 'AGUARDAR_TELEMETRIA_SENSOR',
          }),
        }),
      ]),
    );
  });

  it('reprova sensor de vacuo marcado como falha mesmo com leitura recente', async () => {
    const context = makeContext();
    context.tanques[0].sensores[1].status_sensor = statussensor.FALHA;
    repository.findOperationalContextById.mockResolvedValueOnce(context);

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'SENSOR_51_STATUS',
          status: 'REPROVADO',
        }),
      ]),
    );
  });

  it('prioriza a calibracao pendente mesmo quando o sensor novo esta INATIVO', async () => {
    const context = makeContext();
    context.tanques[0].sensores[1].status_sensor = statussensor.INATIVO;
    repository.findOperationalContextById.mockResolvedValueOnce(context);

    const result = await service.validarSensor(10, 51);

    expect(result).toMatchObject({
      codigo: 'SENSOR_51_CALIBRACAO',
      status: 'REPROVADO',
      acao_corretiva: {
        codigo: 'CALIBRAR_SENSOR',
        metodo: 'POST',
        endpoint: '/configuracoes/sensores/51/calibracao/iniciar',
        disponivel: true,
      },
    });
  });

  it('orienta finalizar uma calibracao que ja esta em andamento', async () => {
    const context = makeContext();
    context.tanques[0].sensores[1].modo_calibracao_ativo = true;
    repository.findOperationalContextById.mockResolvedValueOnce(context);

    const result = await service.validarSensor(10, 51);

    expect(result.acao_corretiva).toMatchObject({
      codigo: 'CONTINUAR_CALIBRACAO_SENSOR',
      metodo: 'POST',
      endpoint: '/configuracoes/sensores/51/calibracao/finalizar',
    });
  });

  it('solicita liberacao separada depois de uma calibracao valida', async () => {
    const context = makeContext();
    const sensor = context.tanques[0].sensores[1];
    sensor.calibrado_em = new Date(Date.now() - 1_000);
    sensor.calibracao_valida_ate = new Date(Date.now() + 86_400_000);
    sensor.liberado_em = null;
    repository.findOperationalContextById.mockResolvedValueOnce(context);

    const result = await service.validarSensor(10, 51);

    expect(result.acao_corretiva).toMatchObject({
      codigo: 'LIBERAR_SENSOR',
      metodo: 'PATCH',
      endpoint: '/configuracoes/sensores/51/ativar',
    });
  });

  it('exige leitura diagnostica quando sensor de vacuo carrega acoplamento do tanque', async () => {
    const context = makeContext();
    context.tanques[0].sensores[0].acoplamento = {
      id_sensor: 60,
      id_tanque: 30,
      status_acoplamento: StatusAcoplamentoMangueira.ACOPLADA,
      sinal_detectado: true,
      ultima_verificacao: new Date(),
      ultimo_evento_em: new Date(),
      ativo: true,
    };
    context.tanques[0].sensores[0].ultima_leitura = new Date();
    repository.findOperationalContextById.mockResolvedValueOnce(context);

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'SENSOR_50_RESPOSTA',
          status: 'APROVADO',
        }),
      ]),
    );
  });

  it('nao exige leitura diagnostica do sensor de acoplamento na regra generica de sensores', async () => {
    const context = makeContext();
    context.tanques[0].sensores[0].ultima_leitura = null;
    repository.findOperationalContextById.mockResolvedValueOnce(context);

    const result = await service.executar(10, user);

    expect(result.itens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'SENSOR_50_ACOPLAMENTO',
          status: 'APROVADO',
        }),
        expect.objectContaining({
          grupo: 'ACOPLAMENTO',
          status: 'APROVADO',
        }),
      ]),
    );
  });

  it('bloqueia validar valvula quando ha processo ativo', async () => {
    repository.findActiveProcessId.mockResolvedValueOnce(10);

    await expect(service.validarValvula(10, 99, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('confirma o teste seguro apenas com telemetria v2 nova e coerente', async () => {
    const result = await service.validarValvula(10, 99, user);

    expect(mqttConfig.claimOperationalControlLease).toHaveBeenCalledWith(
      expect.any(String),
      'PROCESS_PREFLIGHT_SAFE_STATE',
    );
    expect(mqtt.prepareHardwareForStart).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'APROVADO',
      aprovado: true,
      detalhes: {
        estado_controlador_confirmado: true,
        feedback_mecanico_disponivel: false,
        snapshot_recebido: true,
      },
    });
    expect(mqttConfig.releaseOperationalControlLease).toHaveBeenCalledWith(
      expect.any(String),
    );
    expect(logs.registerUserAction).toHaveBeenCalledWith(
      expect.objectContaining({
        acao: 'VALVULA_PRECHECK_ESTADO_SEGURO',
      }),
    );
  });

  it('nao aprova o teste quando a preparacao segura falha e libera o lease', async () => {
    mqtt.prepareHardwareForStart.mockResolvedValueOnce({
      success: false,
      message: 'ACK de fechamento ausente.',
      id_processo: 10,
      command_results: [],
      command_failures: [
        { comando: 'FECHAR_TODAS_VALVULAS', message: 'timeout' },
      ],
    });

    const result = await service.validarValvula(10, 99, user);

    expect(result).toMatchObject({ status: 'FALHA', aprovado: false });
    expect(
      mqttConfig.findLatestHardwareStatusSnapshotAfter,
    ).not.toHaveBeenCalled();
    expect(mqttConfig.releaseOperationalControlLease).toHaveBeenCalled();
  });

  it('reprova telemetria cujo relogio nao comprova estado posterior aos comandos', async () => {
    mqttConfig.findLatestHardwareStatusSnapshotAfter.mockImplementationOnce(
      (...args: unknown[]) => {
        const marker = args[0] as Date;
        const receivedAt = new Date(marker.getTime() + 200);
        return Promise.resolve({
          id: 2,
          topic: 'tsea/status',
          receivedAt,
          statusAt: new Date(marker.getTime() - 10_000),
          payload: makeSafeHardwareStatus(receivedAt),
        });
      },
    );

    const result = await service.validarValvula(10, 99, user);

    expect(result).toMatchObject({
      status: 'REPROVADO',
      aprovado: false,
      detalhes: {
        estado_controlador_confirmado: false,
        feedback_mecanico_disponivel: false,
        snapshot_recebido: true,
      },
    });
    expect(result.mensagem).toContain('depois dos comandos');
  });

  it('bloqueia abrir valvula sem processo ativo', async () => {
    await expect(service.abrirValvula(10, 99, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('confirma abertura de valvula somente apos ACK EXECUTADO', async () => {
    repository.findById.mockResolvedValueOnce({
      id_processo: 10,
      status_processo: statusprocesso.EM_EXECUCAO,
    });
    repository.findActiveProcessId.mockResolvedValueOnce(10);

    const result = await service.abrirValvula(10, 99, user);

    expect(commandService.abrirValvula).toHaveBeenCalled();
    expect(result.status).toBe('APROVADO');
    expect(result.evidencia).toContain('ack=EXECUTADO');
  });

  it('preserva o sucesso da abertura confirmada quando a auditoria falha', async () => {
    repository.findById.mockResolvedValueOnce({
      id_processo: 10,
      status_processo: statusprocesso.EM_EXECUCAO,
    });
    repository.findActiveProcessId.mockResolvedValueOnce(10);
    logs.registerUserAction.mockRejectedValueOnce(
      new Error('PostgreSQL indisponivel'),
    );
    const loggerError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    const result = await service.abrirValvula(10, 99, user);

    expect(commandService.abrirValvula).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'APROVADO',
      aprovado: true,
      evidencia: expect.stringContaining('ack=EXECUTADO'),
    });
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Falha ao registrar auditoria pos-ACK'),
    );
  });

  it('preserva o sucesso do fechamento confirmado quando a auditoria falha', async () => {
    repository.findById.mockResolvedValueOnce({
      id_processo: 10,
      status_processo: statusprocesso.EM_EXECUCAO,
    });
    repository.findActiveProcessId.mockResolvedValueOnce(10);
    logs.registerUserAction.mockRejectedValueOnce(
      new Error('PostgreSQL indisponivel'),
    );
    const loggerError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    const result = await service.fecharValvula(10, 99, user);

    expect(commandService.fecharValvula).toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'APROVADO',
      aprovado: true,
      evidencia: expect.stringContaining('ack=EXECUTADO'),
    });
    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Falha ao registrar auditoria pos-ACK'),
    );
  });

  it('bloqueia a rota generica para valvula da bomba auxiliar', async () => {
    repository.findById.mockResolvedValueOnce({
      id_processo: 10,
      status_processo: statusprocesso.EM_EXECUCAO,
    });
    repository.findActiveProcessId.mockResolvedValueOnce(10);
    repository.findValveByProcessId.mockResolvedValueOnce({
      ...makeValve(),
      bomba: {
        ...makeValve().bomba,
        tipo_bomba: tipobomba.AUXILIAR,
      },
    });

    await expect(service.abrirValvula(10, 99, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(commandService.abrirValvula).not.toHaveBeenCalled();
  });

  it('bloqueia reabertura da valvula principal de tanque concluido', async () => {
    repository.findById.mockResolvedValueOnce({
      id_processo: 10,
      status_processo: statusprocesso.EM_EXECUCAO,
    });
    repository.findActiveProcessId.mockResolvedValueOnce(10);
    repository.findTankClosureByProcessAndTank.mockResolvedValueOnce({
      status_encerramento: statusencerramentotanque.CONCLUIDO,
    });

    await expect(service.abrirValvula(10, 99, user)).rejects.toThrow(
      'isolamento e retencao concluidos',
    );
    expect(commandService.abrirValvula).not.toHaveBeenCalled();
  });

  function makeReadiness() {
    return {
      credentialsConfigured: true,
      credentialsVerified: true,
      credentialsVerifiedAt: new Date(),
      credentialsFailure: null,
      mqttConnected: true,
      mqttOperational: true,
      esp32Online: true,
      communicationReady: true,
      currentStatus: {
        mqttConnected: true,
        esp32Online: true,
        lastHeartbeatAt: new Date(),
        lastStatusAt: new Date(),
        lastReadingAt: new Date(),
        currentStatus: statusgeralsistema.OPERACIONAL,
        lastError: null,
        updatedAt: new Date(),
      },
    };
  }

  type ValveFixture = {
    id_valvula: number;
    codigo_hardware: string | null;
    id_bomba: number;
    id_tanque: number;
    numero_saida_manifold: number;
    nome_valvula: string;
    status_valvula: StatusValvula;
    ativo: boolean;
    funcao_valvula: funcaovalvula;
    ultimo_acionamento: Date | null;
    bomba: {
      id_bomba: number;
      codigo_hardware: string | null;
      nome: string;
      status_padrao: statusbomba;
      tipo_bomba: tipobomba;
    };
    tanque: {
      id_tanque: number;
      nome: string;
    };
  };

  function makeValve(overrides: Partial<ValveFixture> = {}): ValveFixture {
    return {
      ...makeValveBase(),
      ...overrides,
    };
  }

  function makeValveBase(): ValveFixture {
    return {
      id_valvula: 99,
      codigo_hardware: 'VP_T1',
      id_bomba: 5,
      id_tanque: 30,
      numero_saida_manifold: 1,
      nome_valvula: 'Valvula 1',
      status_valvula: StatusValvula.FECHADA,
      ativo: true,
      funcao_valvula: funcaovalvula.VACUO,
      ultimo_acionamento: null,
      bomba: {
        id_bomba: 5,
        codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
        nome: 'Bomba principal',
        status_padrao: statusbomba.ATIVA,
        tipo_bomba: tipobomba.PRINCIPAL,
      },
      tanque: {
        id_tanque: 30,
        nome: 'Tanque A',
      },
    };
  }

  function makeAuxiliaryValve(): ValveFixture {
    return {
      ...makeValveBase(),
      id_valvula: 100,
      codigo_hardware: 'VA_T1',
      id_bomba: 6,
      numero_saida_manifold: 2,
      nome_valvula: 'Valvula auxiliar 1',
      bomba: {
        id_bomba: 6,
        codigo_hardware: 'BOMBA_VACUO_AUXILIAR',
        nome: 'Bomba auxiliar',
        status_padrao: statusbomba.ATIVA,
        tipo_bomba: tipobomba.AUXILIAR,
      },
    };
  }

  function makeSafeHardwareStatus(enviadoEm: Date) {
    return {
      tipo: 'HARDWARE_STATUS',
      schema_version: 2,
      device_id: 'esp32-test',
      esp32_on: true,
      status_geral: statusgeralsistema.OPERACIONAL,
      emergencia_ativa: false,
      enviado_em: enviadoEm.toISOString(),
      valvulas: [
        {
          id_valvula: 99,
          codigo_hardware: 'VP_T1',
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: false,
          disponivel: true,
        },
        {
          id_valvula: 100,
          codigo_hardware: 'VA_T1',
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: false,
          disponivel: true,
        },
      ],
      bombas: [
        {
          id_bomba: 5,
          codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
          ligada: false,
          disponivel: true,
          falha: false,
        },
        {
          id_bomba: 6,
          codigo_hardware: 'BOMBA_VACUO_AUXILIAR',
          ligada: false,
          disponivel: true,
          falha: false,
        },
      ],
    };
  }

  function makeContext(): ProcessoOperationalContext {
    return {
      id_processo: 10,
      id_usuario: 7,
      nome_processo: 'Processo teste',
      status_processo: statusprocesso.CONFIGURADO,
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
      criado_em: new Date(),
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
              tipo_sensor: tiposensor.ACOPLAMENTO,
              status_integridade: statusintegridadesensor.VALIDO,
              calibrado_em: null,
              calibracao_valida_ate: null,
              modo_calibracao_ativo: false,
              liberado_em: null,
              integridade_ultimo_erro: null,
              ultima_leitura: new Date(),
              ultimo_valor_lido: -70,
              ativo_no_processo: true,
              acoplamento: {
                id_sensor: 50,
                id_tanque: 30,
                status_acoplamento: StatusAcoplamentoMangueira.ACOPLADA,
                sinal_detectado: true,
                ultima_verificacao: new Date(),
                ultimo_evento_em: new Date(),
                ativo: true,
              },
            },
            {
              id_processo_tanque_sensor: 41,
              id_sensor: 51,
              nome_sensor: 'Sensor de vacuo A',
              modelo_sensor: 'XGZP',
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
          last_heartbeat_at: new Date(),
          last_status_at: new Date(),
          last_reading_at: new Date(),
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
});
