import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  StatusAcoplamentoMangueira,
  StatusValvula,
  funcaovalvula,
  nivelacesso,
  statusbomba,
  statusconexaomqtt,
  statusgeralsistema,
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
  let mqtt: { getHardwareReadiness: SyncMock };
  let socket: { emitPrecheckResult: SyncMock };
  let commandService: {
    abrirValvula: AsyncMock;
    fecharValvula: AsyncMock;
  };
  let mqttConfig: { getConfig: AsyncMock };

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
      }),
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

    await expect(service.validarValvula(10, 99)).rejects.toBeInstanceOf(
      ConflictException,
    );
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

  function makeContext() {
    return {
      id_processo: 10,
      id_usuario: 7,
      nome_processo: 'Processo teste',
      status_processo: statusprocesso.CONFIGURADO,
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
