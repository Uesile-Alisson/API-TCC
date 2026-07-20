/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  etapaencerramentoprocesso,
  etapaencerramentotanque,
  etapapartidaprocesso,
  faseprocesso,
  statusencerramentoprocesso,
  statusencerramentotanque,
  statuspartidaprocesso,
  statusprocesso,
  statustanqueprocesso,
  StatusAcoplamentoMangueira,
  StatusValvula,
} from '@prisma/client';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { MQTT_COMMANDS } from '../../mqtt-hardware/commands/interfaces/command-name.interface';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoLogService } from '../logs';
import { ProcessoMetricsService } from '../metrics';
import { ProcessosRepository } from '../processos.repository';
import { ProcessosSocketGateway } from '../socket';
import { ProcessoGeneralClosureService } from './processo-general-closure.service';

describe('ProcessoGeneralClosureService', () => {
  const baseTime = new Date('2026-07-17T00:00:00.000Z');
  const hardwareTime = new Date('2026-07-17T00:00:01.000Z');

  let state: any;
  let prisma: any;
  let commands: {
    paradaEmergencia: jest.Mock;
    fecharTodasValvulas: jest.Mock;
    desligarTodasBombas: jest.Mock;
  };
  let metrics: { calculateProcessMetrics: jest.Mock };
  let sockets: Record<string, jest.Mock>;
  let mqttConfig: { findLatestHardwareStatusSnapshotAfter: jest.Mock };
  let repository: {
    findReadingsForMetrics: jest.Mock;
    findEmergencyTargetProcessId: jest.Mock;
  };
  let service: ProcessoGeneralClosureService;

  function buildSafeEmergencySnapshot() {
    return {
      tipo: 'HARDWARE_STATUS',
      schema_version: 2,
      esp32_on: true,
      device_id: 'ESP32_TSEA_01',
      status_geral: 'FALHA',
      emergencia_ativa: true,
      bombas: [
        {
          id_bomba: 1,
          codigo_hardware: 'BOMBA_PRINCIPAL',
          ligada: false,
          disponivel: true,
          falha: false,
        },
        {
          id_bomba: 2,
          codigo_hardware: 'BOMBA_AUXILIAR',
          ligada: false,
          disponivel: true,
          falha: false,
        },
      ],
      valvulas: [
        {
          id_valvula: 11,
          codigo_hardware: 'VP_T1',
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: false,
          disponivel: true,
        },
        {
          id_valvula: 12,
          codigo_hardware: 'VA_T1',
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: false,
          disponivel: true,
        },
      ],
      enviado_em: '2026-07-19T18:00:00.000Z',
    };
  }

  function buildState() {
    return {
      id_processo: 10,
      id_usuario: 7,
      status_processo: statusprocesso.EM_EXECUCAO,
      parada_emergencia: false,
      status_partida: statuspartidaprocesso.INATIVA,
      etapa_partida: etapapartidaprocesso.NENHUMA,
      partida_execucao_bloqueada_ate: null,
      partida_ultimo_erro: null,
      partida_versao: 0,
      fase_processo: faseprocesso.GERANDO_VACUO,
      iniciado_em: new Date('2026-07-16T23:55:00.000Z'),
      tempo_execucao: null,
      encerramento_automatico: true,
      encerramento_versao: 0,
      status_encerramento_geral: statusencerramentoprocesso.AGUARDANDO_TANQUES,
      etapa_encerramento_geral: etapaencerramentoprocesso.NENHUMA,
      encerramento_geral_iniciado_em: null,
      encerramento_geral_finalizado_em: null,
      encerramento_geral_confirmacao_iniciada_em: null,
      encerramento_geral_proxima_tentativa_em: null,
      encerramento_geral_tentativa: 0,
      encerramento_geral_comando_tentativas: 0,
      encerramento_geral_ultimo_erro: null,
      encerramento_geral_id_usuario: null,
      processostanques: [
        {
          id_processo_tanque: 100,
          id_tanque: 1,
          status_tanque_processo: statustanqueprocesso.CONCLUIDO,
          status_encerramento: statusencerramentotanque.CONCLUIDO,
          etapa_encerramento: etapaencerramentotanque.CONCLUIDA,
          tanques: {
            sensoresacoplamentomangueiras: {
              ativo: true,
              sinal_detectado: true,
              status_acoplamento: StatusAcoplamentoMangueira.ACOPLADA,
            },
            valvulas: [
              {
                id_valvula: 11,
                status_valvula: StatusValvula.FECHADA,
                ultimo_acionamento: hardwareTime,
                bombas: {
                  id_bomba: 1,
                  ligada_hardware: false,
                  ultimo_status_hardware_em: hardwareTime,
                },
              },
              {
                id_valvula: 12,
                status_valvula: StatusValvula.FECHADA,
                ultimo_acionamento: hardwareTime,
                bombas: {
                  id_bomba: 2,
                  ligada_hardware: false,
                  ultimo_status_hardware_em: hardwareTime,
                },
              },
            ],
          },
        },
      ],
    };
  }

  function matches(where: Record<string, unknown>): boolean {
    for (const [key, expected] of Object.entries(where)) {
      if (key === 'OR') {
        continue;
      }
      if (key === 'id_processo' && expected !== state.id_processo) {
        return false;
      }
      if (key in state && expected !== state[key]) {
        return false;
      }
    }
    return true;
  }

  function applyData(data: Record<string, any>) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value) {
        state[key] = (state[key] ?? 0) + value.increment;
      } else {
        state[key] = value;
      }
    }
  }

  beforeEach(() => {
    state = buildState();
    const updateMany = jest.fn(async ({ where, data }: any) => {
      if (!matches(where)) {
        return { count: 0 };
      }
      applyData(data);
      return { count: 1 };
    });
    prisma = {
      processos: {
        findMany: jest.fn(async () =>
          state.status_processo === statusprocesso.EM_EXECUCAO ||
          (state.status_processo === statusprocesso.INTERROMPIDO &&
            state.parada_emergencia &&
            [
              statusencerramentoprocesso.INATIVO,
              statusencerramentoprocesso.ENCERRANDO,
              statusencerramentoprocesso.CONFIRMANDO_HARDWARE,
            ].includes(state.status_encerramento_geral))
            ? [{ id_processo: state.id_processo }]
            : [],
        ),
        findUnique: jest.fn(async () => state),
        updateMany,
      },
      processostanques: {
        updateMany: jest.fn(async ({ data }: any) => {
          for (const tank of state.processostanques) {
            Object.assign(tank, data);
          }
          return { count: state.processostanques.length };
        }),
      },
      processosauxiliares: { updateMany: jest.fn(async () => ({ count: 1 })) },
      processostanquesauxiliares: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      bombas: {
        findMany: jest.fn(async () => [
          {
            id_bomba: 1,
            codigo_hardware: 'BOMBA_PRINCIPAL',
          },
          {
            id_bomba: 2,
            codigo_hardware: 'BOMBA_AUXILIAR',
          },
        ]),
      },
      valvulas: {
        findMany: jest.fn(async () => [
          {
            id_valvula: 11,
            codigo_hardware: 'VP_T1',
          },
          {
            id_valvula: 12,
            codigo_hardware: 'VA_T1',
          },
        ]),
      },
      alarmes: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id_alarme: 1 })),
        update: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      eventos: { create: jest.fn(async () => ({})) },
      $queryRaw: jest.fn(async () => [{ id_mqtt_configuracao: 1 }]),
      $transaction: jest.fn(async (operation: (tx: any) => unknown) =>
        operation(prisma),
      ),
    };

    commands = {
      paradaEmergencia: jest.fn(async (options?: any) => ({
        comando: MQTT_COMMANDS.PARADA_EMERGENCIA,
        correlation_id: options?.correlation_id ?? 'emergency-ack',
        ack_status: 'EXECUTADO',
      })),
      fecharTodasValvulas: jest.fn(async (_options?: unknown) => ({
        comando: MQTT_COMMANDS.FECHAR_TODAS_VALVULAS,
        correlation_id: 'close-ack',
        ack_status: 'EXECUTADO',
      })),
      desligarTodasBombas: jest.fn(async (_options?: unknown) => ({
        comando: MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS,
        correlation_id: 'pump-ack',
        ack_status: 'EXECUTADO',
      })),
    };
    metrics = {
      calculateProcessMetrics: jest.fn(() => ({
        id_processo: 10,
        vacuo_alvo: -80,
        vacuo_inicial: -5,
        vacuo_final: -82,
        vacuo_medio: -60,
        eficiencia: 102.5,
        tempo_execucao: 300,
        total_tanques: 1,
        total_sensores: 1,
        total_leituras: 10,
        total_alarmes: 0,
        total_eventos: 0,
        tanques: [],
      })),
    };
    sockets = {
      emitGeneralClosureUpdated: jest.fn(),
      emitEmergencyStop: jest.fn(),
      emitProcessFinished: jest.fn(),
      emitMetricsUpdated: jest.fn(),
      emitStatusChanged: jest.fn(),
    };
    mqttConfig = {
      findLatestHardwareStatusSnapshotAfter: jest.fn(async (marker: Date) => ({
        id: 1,
        topic: 'tsea/status',
        receivedAt: new Date(marker.getTime() + 1),
        statusAt: new Date(marker.getTime() + 1),
        payload: buildSafeEmergencySnapshot(),
      })),
    };
    repository = {
      findReadingsForMetrics: jest.fn(async () => ({
        processostanques: [],
      })),
      findEmergencyTargetProcessId: jest.fn(async () => null),
    };

    service = new ProcessoGeneralClosureService(
      prisma as PrismaService,
      commands as unknown as CommandService,
      repository as unknown as ProcessosRepository,
      metrics as unknown as ProcessoMetricsService,
      {
        registerSystemAction: jest.fn(async () => ({})),
        registerUserAction: jest.fn(async () => ({})),
      } as unknown as ProcessoLogService,
      sockets as unknown as ProcessosSocketGateway,
      mqttConfig as unknown as MqttConfigService,
    );
  });

  it('resolve o processo operacional e usa o coordenador persistente na parada sem alvo explicito', async () => {
    repository.findEmergencyTargetProcessId.mockResolvedValueOnce(10);

    const result = await service.requestEmergencyStopForCurrent({
      motivo: 'Parada solicitada pela interface',
      id_usuario: 7,
    });

    expect(result).toMatchObject({
      escopo: 'PROCESSO',
      id_processo: 10,
      persistencia_confirmada: true,
      confirmacao_controlador: 'PENDENTE',
      processo: {
        idempotent: false,
        state: {
          status: 'AGUARDANDO_CONFIRMACAO',
          hardware_confirmado: false,
        },
      },
    });
    expect(state.status_processo).toBe(statusprocesso.INTERROMPIDO);
    expect(commands.paradaEmergencia).toHaveBeenCalledTimes(1);
    expect(commands.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commands.fecharTodasValvulas).toHaveBeenCalledTimes(1);
  });

  it('sem processo executa fallback global e nao declara persistencia nem confirmacao', async () => {
    commands.paradaEmergencia.mockRejectedValueOnce(
      new Error('ACK de emergencia ausente'),
    );
    commands.desligarTodasBombas.mockRejectedValueOnce(
      new Error('ACK de bombas ausente'),
    );
    commands.fecharTodasValvulas.mockRejectedValueOnce(
      new Error('ACK de valvulas ausente'),
    );

    const result = await service.requestEmergencyStopForCurrent({
      motivo: 'Parada global preventiva',
      id_usuario: 7,
    });

    expect(result).toMatchObject({
      escopo: 'HARDWARE_GLOBAL',
      id_processo: null,
      persistencia_confirmada: false,
      confirmacao_controlador: 'NAO_CONFIRMADA',
      processo: null,
      command_results: [],
    });
    expect(result.command_failures).toEqual([
      {
        comando: MQTT_COMMANDS.PARADA_EMERGENCIA,
        message: 'ACK de emergencia ausente',
      },
      {
        comando: MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS,
        message: 'ACK de bombas ausente',
      },
      {
        comando: MQTT_COMMANDS.FECHAR_TODAS_VALVULAS,
        message: 'ACK de valvulas ausente',
      },
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('executa isolamento, bombas, reconfirmacao e conclui apenas com telemetria', async () => {
    for (let cycle = 0; cycle < 6; cycle += 1) {
      await service.runOnce(baseTime);
    }

    expect(commands.fecharTodasValvulas).toHaveBeenCalledTimes(2);
    expect(commands.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(state.status_processo).toBe(statusprocesso.CONCLUIDO);
    expect(state.fase_processo).toBe(faseprocesso.FINALIZADO);
    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.CONCLUIDO,
    );
    expect(state.etapa_encerramento_geral).toBe(
      etapaencerramentoprocesso.CONCLUIDA,
    );
    expect(sockets.emitProcessFinished).toHaveBeenCalledTimes(1);
  });

  it('aguarda autorizacao humana quando encerramento automatico esta desativado', async () => {
    state.encerramento_automatico = false;
    state.status_encerramento_geral = statusencerramentoprocesso.INATIVO;

    await service.runOnce(baseTime);

    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.AGUARDANDO_ACAO_MANUAL,
    );
    expect(commands.fecharTodasValvulas).not.toHaveBeenCalled();
  });

  it('falha fechado quando a mangueira e desacoplada antes da liberacao', async () => {
    state.status_encerramento_geral = statusencerramentoprocesso.ENCERRANDO;
    state.etapa_encerramento_geral =
      etapaencerramentoprocesso.VALIDANDO_ISOLAMENTO;
    state.processostanques[0].tanques.sensoresacoplamentomangueiras.sinal_detectado = false;

    await service.runOnce(baseTime);

    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.FALHA,
    );
    expect(state.status_processo).toBe(statusprocesso.EM_EXECUCAO);
    expect(commands.desligarTodasBombas).not.toHaveBeenCalled();
  });

  it('mantem processo aberto e agenda repeticao quando ACK seguro falha', async () => {
    state.status_encerramento_geral = statusencerramentoprocesso.ENCERRANDO;
    state.etapa_encerramento_geral =
      etapaencerramentoprocesso.CONFIRMANDO_ISOLAMENTO;
    commands.fecharTodasValvulas.mockRejectedValueOnce(
      new Error('ACK ausente'),
    );

    await service.runOnce(baseTime);

    expect(state.status_processo).toBe(statusprocesso.EM_EXECUCAO);
    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.ENCERRANDO,
    );
    expect(state.encerramento_geral_comando_tentativas).toBe(1);
    expect(state.encerramento_geral_proxima_tentativa_em).toBeInstanceOf(Date);
  });

  it('mantem os demais tanques ativos e inicia somente depois do ultimo concluir', async () => {
    const secondTank = structuredClone(state.processostanques[0]);
    secondTank.id_processo_tanque = 101;
    secondTank.id_tanque = 2;
    secondTank.status_tanque_processo = statustanqueprocesso.GERANDO_VACUO;
    secondTank.status_encerramento = statusencerramentotanque.MONITORANDO;
    secondTank.etapa_encerramento = etapaencerramentotanque.NENHUMA;
    const thirdTank = structuredClone(secondTank);
    thirdTank.id_processo_tanque = 102;
    thirdTank.id_tanque = 3;
    state.processostanques = [...state.processostanques, secondTank, thirdTank];

    await service.runOnce(baseTime);

    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.AGUARDANDO_TANQUES,
    );
    expect(commands.fecharTodasValvulas).not.toHaveBeenCalled();
    expect(commands.desligarTodasBombas).not.toHaveBeenCalled();

    thirdTank.status_tanque_processo = statustanqueprocesso.CONCLUIDO;
    thirdTank.status_encerramento = statusencerramentotanque.CONCLUIDO;
    thirdTank.etapa_encerramento = etapaencerramentotanque.CONCLUIDA;

    await service.runOnce(baseTime);

    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.AGUARDANDO_TANQUES,
    );
    expect(commands.fecharTodasValvulas).not.toHaveBeenCalled();

    secondTank.status_tanque_processo = statustanqueprocesso.CONCLUIDO;
    secondTank.status_encerramento = statusencerramentotanque.CONCLUIDO;
    secondTank.etapa_encerramento = etapaencerramentotanque.CONCLUIDA;

    await service.runOnce(baseTime);

    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.ENCERRANDO,
    );
    expect(state.etapa_encerramento_geral).toBe(
      etapaencerramentoprocesso.VALIDANDO_ISOLAMENTO,
    );
  });

  it('retoma do estagio persistido apos reinicializacao sem repetir etapas anteriores', async () => {
    state.status_encerramento_geral = statusencerramentoprocesso.ENCERRANDO;
    state.etapa_encerramento_geral =
      etapaencerramentoprocesso.DESLIGANDO_BOMBAS;
    state.encerramento_geral_iniciado_em = baseTime;
    state.encerramento_geral_confirmacao_iniciada_em = baseTime;

    const resumedService = new ProcessoGeneralClosureService(
      prisma as PrismaService,
      commands as unknown as CommandService,
      {
        findReadingsForMetrics: jest.fn(async () => ({
          processostanques: [],
        })),
      } as unknown as ProcessosRepository,
      metrics as unknown as ProcessoMetricsService,
      {
        registerSystemAction: jest.fn(async () => ({})),
        registerUserAction: jest.fn(async () => ({})),
      } as unknown as ProcessoLogService,
      sockets as unknown as ProcessosSocketGateway,
      mqttConfig as unknown as MqttConfigService,
    );

    await resumedService.runOnce(baseTime);

    expect(commands.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commands.fecharTodasValvulas).not.toHaveBeenCalled();
    expect(state.etapa_encerramento_geral).toBe(
      etapaencerramentoprocesso.RECONFIRMANDO_VALVULAS,
    );
  });

  it('repete a sequencia segura e falha se a telemetria final continuar ausente', async () => {
    state.status_encerramento_geral =
      statusencerramentoprocesso.CONFIRMANDO_HARDWARE;
    state.etapa_encerramento_geral =
      etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA;
    state.encerramento_geral_confirmacao_iniciada_em = new Date(
      baseTime.getTime() - 20_000,
    );
    state.processostanques[0].tanques.valvulas[0].status_valvula =
      StatusValvula.ABERTA;

    await service.runOnce(baseTime);

    expect(state.status_processo).toBe(statusprocesso.EM_EXECUCAO);
    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.ENCERRANDO,
    );
    expect(state.etapa_encerramento_geral).toBe(
      etapaencerramentoprocesso.CONFIRMANDO_ISOLAMENTO,
    );
    expect(state.encerramento_geral_comando_tentativas).toBe(1);

    state.status_encerramento_geral =
      statusencerramentoprocesso.CONFIRMANDO_HARDWARE;
    state.etapa_encerramento_geral =
      etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA;
    state.encerramento_geral_comando_tentativas = 2;
    state.encerramento_geral_confirmacao_iniciada_em = new Date(
      baseTime.getTime() - 20_000,
    );
    state.encerramento_geral_proxima_tentativa_em = null;

    await service.runOnce(baseTime);

    expect(state.status_processo).toBe(statusprocesso.EM_EXECUCAO);
    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.FALHA,
    );
    expect(state.encerramento_geral_ultimo_erro).toContain(
      'telemetria nao confirmou',
    );
  });

  it('persiste a auditoria na mesma transacao da nova parada de emergencia', async () => {
    const persistAudit = jest.fn(async () => undefined);

    await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Risco operacional',
      id_usuario: 7,
      persistAudit,
    });

    expect(persistAudit).toHaveBeenCalledTimes(1);
    expect(persistAudit).toHaveBeenCalledWith(prisma, 10);
  });

  it('nao persiste auditoria novamente para parada ja concluida', async () => {
    state.status_processo = statusprocesso.INTERROMPIDO;
    state.parada_emergencia = true;
    state.status_encerramento_geral = statusencerramentoprocesso.CONCLUIDO;
    state.etapa_encerramento_geral = etapaencerramentoprocesso.CONCLUIDA;
    const persistAudit = jest.fn(async () => undefined);

    const result = await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Repeticao',
      id_usuario: 7,
      persistAudit,
    });

    expect(result.idempotent).toBe(true);
    expect(persistAudit).not.toHaveBeenCalled();
  });

  it('persiste a interrupcao antes do I/O e tenta os tres comandos independentemente', async () => {
    state.processostanques[0].status_tanque_processo =
      statustanqueprocesso.GERANDO_VACUO;
    state.processostanques[0].status_encerramento =
      statusencerramentotanque.MONITORANDO;
    commands.paradaEmergencia.mockImplementationOnce(async () => {
      expect(state.status_processo).toBe(statusprocesso.INTERROMPIDO);
      expect(state.parada_emergencia).toBe(true);
      expect(state.status_encerramento_geral).toBe(
        statusencerramentoprocesso.ENCERRANDO,
      );
      expect(state.processostanques[0].status_tanque_processo).toBe(
        statustanqueprocesso.INTERROMPIDO,
      );
      throw new Error('ACK de emergencia ausente');
    });
    commands.desligarTodasBombas.mockRejectedValueOnce(
      new Error('ACK de bombas ausente'),
    );

    const result = await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Risco operacional',
      id_usuario: 7,
    });

    expect(commands.paradaEmergencia).toHaveBeenCalledTimes(1);
    expect(commands.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commands.fecharTodasValvulas).toHaveBeenCalledTimes(1);
    expect(
      commands.desligarTodasBombas.mock.invocationCallOrder[0],
    ).toBeLessThan(commands.fecharTodasValvulas.mock.invocationCallOrder[0]);
    expect(result.command_results).toHaveLength(1);
    expect(result.command_failures).toEqual([
      {
        comando: MQTT_COMMANDS.PARADA_EMERGENCIA,
        message: 'ACK de emergencia ausente',
      },
      {
        comando: MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS,
        message: 'ACK de bombas ausente',
      },
    ]);
    expect(result.state.status).toBe('AGUARDANDO_CONFIRMACAO');
    expect(result.state.hardware_confirmado).toBe(false);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.processosauxiliares.updateMany).toHaveBeenCalledWith({
      where: { id_processo: 10 },
      data: expect.objectContaining({
        status_subsistema: 'BLOQUEADO',
        id_usuario_controle_bomba: null,
        controle_bomba_expira_em: null,
      }),
    });
    expect(prisma.processostanquesauxiliares.updateMany).toHaveBeenCalledWith({
      where: { processostanques: { id_processo: 10 } },
      data: expect.objectContaining({
        status_auxilio: 'BLOQUEADO',
        id_usuario_controle_valvula: null,
        controle_valvula_expira_em: null,
      }),
    });
    expect(prisma.alarmes.updateMany).toHaveBeenCalledWith({
      where: {
        id_processo: 10,
        tipo_alarme: 'ESTAGNACAO',
        status_alarme: 'ATIVO',
        resolvido_em: null,
        excluido_em: null,
      },
      data: expect.objectContaining({
        status_alarme: 'NORMALIZADO',
        motivo_resolucao: 'FECHAMENTO_POS_PROCESSO',
      }),
    });
    expect(commands.fecharTodasValvulas.mock.calls[0][0].correlation_id).toBe(
      'process-emergency-p10-r1-c1-fechar-todas-valvulas',
    );
  });

  it('registra as tres falhas sem confirmar o controlador quando todos os comandos falham', async () => {
    commands.paradaEmergencia.mockRejectedValueOnce(
      new Error('parada sem ACK'),
    );
    commands.desligarTodasBombas.mockRejectedValueOnce(
      new Error('bombas sem ACK'),
    );
    commands.fecharTodasValvulas.mockRejectedValueOnce(
      new Error('valvulas sem ACK'),
    );

    const result = await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Falha total simulada',
      id_usuario: 7,
    });

    expect(result.command_results).toEqual([]);
    expect(result.command_failures).toHaveLength(3);
    expect(result.command_failures?.map((failure) => failure.comando)).toEqual([
      MQTT_COMMANDS.PARADA_EMERGENCIA,
      MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS,
      MQTT_COMMANDS.FECHAR_TODAS_VALVULAS,
    ]);
    expect(result.state).toMatchObject({
      status: 'AGUARDANDO_CONFIRMACAO',
      hardware_confirmado: false,
      nivel_confirmacao: 'NAO_CONFIRMADO',
    });
  });

  it('tenta a parada fisica best-effort mesmo quando a persistencia fica indisponivel', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('banco indisponivel'));

    await expect(
      service.requestEmergencyStop({
        id_processo: 10,
        motivo: 'Falha de persistencia simulada',
        id_usuario: 7,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'EMERGENCY_STOP_PERSISTENCE_UNAVAILABLE',
        persistencia_confirmada: false,
        confirmacao_controlador: 'DESCONHECIDA',
      }),
    });
    expect(commands.paradaEmergencia).toHaveBeenCalledTimes(1);
    expect(commands.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commands.fecharTodasValvulas).toHaveBeenCalledTimes(1);
  });

  it('nao deixa uma falha de notificacao impedir os comandos fisicos', async () => {
    sockets.emitEmergencyStop.mockImplementationOnce(() => {
      throw new Error('Socket indisponivel');
    });

    const result = await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Risco operacional',
      id_usuario: 7,
    });

    expect(commands.paradaEmergencia).toHaveBeenCalledTimes(1);
    expect(commands.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commands.fecharTodasValvulas).toHaveBeenCalledTimes(1);
    expect(result.state.status).toBe('AGUARDANDO_CONFIRMACAO');
  });

  it('invalida atomicamente uma partida em andamento antes do comando de emergencia', async () => {
    state.status_processo = statusprocesso.CONFIGURADO;
    state.status_partida = statuspartidaprocesso.EM_ANDAMENTO;
    state.etapa_partida = etapapartidaprocesso.LIGANDO_BOMBA_PRINCIPAL;
    state.partida_execucao_bloqueada_ate = new Date(Date.now() + 60_000);
    state.partida_versao = 4;
    commands.paradaEmergencia.mockImplementationOnce(async (options?: any) => {
      expect(state.status_partida).toBe(statuspartidaprocesso.FALHA);
      expect(state.etapa_partida).toBe(etapapartidaprocesso.FALHA);
      expect(state.partida_execucao_bloqueada_ate).toBeNull();
      expect(state.partida_versao).toBe(5);
      return {
        comando: MQTT_COMMANDS.PARADA_EMERGENCIA,
        correlation_id: options?.correlation_id,
        ack_status: 'EXECUTADO',
      };
    });

    await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Emergencia durante partida',
      id_usuario: 7,
    });

    const staleStartupWrite = await prisma.processos.updateMany({
      where: {
        id_processo: 10,
        status_partida: statuspartidaprocesso.EM_ANDAMENTO,
        partida_versao: 4,
      },
      data: {
        etapa_partida: etapapartidaprocesso.CONFIRMANDO_TELEMETRIA,
      },
    });
    expect(staleStartupWrite.count).toBe(0);
  });

  it('confirma a parada somente com inventario global seguro e posterior ao marcador', async () => {
    const requested = await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Teste de confirmacao',
      id_usuario: 7,
    });
    const marker = state.encerramento_geral_confirmacao_iniciada_em as Date;
    const freshTelemetryAt = new Date(marker.getTime() + 1);
    prisma.bombas.findMany.mockResolvedValue([
      {
        id_bomba: 1,
        codigo_hardware: 'BOMBA_PRINCIPAL',
      },
      {
        id_bomba: 2,
        codigo_hardware: 'BOMBA_AUXILIAR',
      },
    ]);
    prisma.valvulas.findMany.mockResolvedValue([
      {
        id_valvula: 11,
        codigo_hardware: 'VP_T1',
      },
      {
        id_valvula: 12,
        codigo_hardware: 'VA_T1',
      },
    ]);

    expect(requested.state.hardware_confirmado).toBe(false);
    await service.runOnce(freshTelemetryAt);

    expect(state.status_processo).toBe(statusprocesso.INTERROMPIDO);
    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.CONCLUIDO,
    );
    expect((await service.getEmergencyState(10)).status).toBe('CONFIRMADA');
    expect((await service.getEmergencyState(10)).hardware_confirmado).toBe(
      true,
    );
    expect(state.processostanques[0].motivo_bloqueio_encerramento).toContain(
      'saidas logicas do controlador em estado seguro',
    );
    expect(prisma.processosauxiliares.updateMany).toHaveBeenLastCalledWith({
      where: { id_processo: 10 },
      data: expect.objectContaining({
        status_subsistema: 'INATIVO',
        motivo_bloqueio: null,
      }),
    });
    expect(prisma.alarmes.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id_processo: 10,
        titulo: {
          in: expect.arrayContaining([
            'Parada de emergencia sem confirmacao do controlador',
            'Parada de emergencia sem confirmacao fisica',
          ]),
        },
        status_alarme: 'ATIVO',
      }),
      data: expect.objectContaining({
        status_alarme: 'NORMALIZADO',
        bloqueante: false,
        requer_intervencao: false,
      }),
    });
    expect(sockets.emitEmergencyStop).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id_processo: 10,
        parada_emergencia: expect.objectContaining({
          status: 'CONFIRMADA',
          hardware_confirmado: true,
          nivel_confirmacao: 'CONTROLADOR_CONFIRMADO',
          latch_emergencia_confirmado: true,
          saidas_controlador_confirmadas: true,
          feedback_mecanico_disponivel: false,
        }),
      }),
    );
    expect(prisma.valvulas.findMany).toHaveBeenCalledWith({
      where: { ativo: true },
      select: {
        id_valvula: true,
        codigo_hardware: true,
      },
    });
  });

  it.each([
    {
      scenario: 'latch de emergencia inativo',
      mutate: (payload: ReturnType<typeof buildSafeEmergencySnapshot>) => {
        payload.emergencia_ativa = false;
      },
      equalToMarker: false,
      oldStatusTimestamp: false,
    },
    {
      scenario: 'inventario parcial',
      mutate: (payload: ReturnType<typeof buildSafeEmergencySnapshot>) => {
        payload.valvulas = payload.valvulas.slice(0, 1);
      },
      equalToMarker: false,
      oldStatusTimestamp: false,
    },
    {
      scenario: 'identidade duplicada',
      mutate: (payload: ReturnType<typeof buildSafeEmergencySnapshot>) => {
        payload.bombas[1].codigo_hardware = payload.bombas[0].codigo_hardware;
      },
      equalToMarker: false,
      oldStatusTimestamp: false,
    },
    {
      scenario: 'timestamp igual ao marcador',
      mutate: (_payload: ReturnType<typeof buildSafeEmergencySnapshot>) => {},
      equalToMarker: true,
      oldStatusTimestamp: false,
    },
    {
      scenario: 'status antigo entregue depois do marcador',
      mutate: (_payload: ReturnType<typeof buildSafeEmergencySnapshot>) => {},
      equalToMarker: false,
      oldStatusTimestamp: true,
    },
  ])(
    'nao confirma com $scenario',
    async ({ mutate, equalToMarker, oldStatusTimestamp = false }) => {
      await service.requestEmergencyStop({
        id_processo: 10,
        motivo: 'Teste fail-closed',
        id_usuario: 7,
      });
      const marker = state.encerramento_geral_confirmacao_iniciada_em as Date;
      const payload = buildSafeEmergencySnapshot();
      mutate(payload);
      mqttConfig.findLatestHardwareStatusSnapshotAfter.mockResolvedValue({
        id: 2,
        topic: 'tsea/status',
        receivedAt: equalToMarker ? marker : new Date(marker.getTime() + 1),
        statusAt: oldStatusTimestamp
          ? new Date(marker.getTime() - 6_000)
          : new Date(marker.getTime() + 1),
        payload,
      });

      await service.runOnce(new Date(marker.getTime() + 1));

      expect(state.status_encerramento_geral).toBe(
        statusencerramentoprocesso.CONFIRMANDO_HARDWARE,
      );
      expect((await service.getEmergencyState(10)).hardware_confirmado).toBe(
        false,
      );
    },
  );

  it('falha fechado apos tres sequencias e cria um unico alarme critico bloqueante', async () => {
    state.status_processo = statusprocesso.INTERROMPIDO;
    state.parada_emergencia = true;
    state.status_encerramento_geral =
      statusencerramentoprocesso.CONFIRMANDO_HARDWARE;
    state.etapa_encerramento_geral =
      etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA;
    state.encerramento_geral_confirmacao_iniciada_em = new Date(
      baseTime.getTime() - 20_000,
    );
    state.encerramento_geral_proxima_tentativa_em = new Date(
      baseTime.getTime() - 1,
    );
    state.encerramento_geral_tentativa = 1;
    state.encerramento_geral_comando_tentativas = 3;
    prisma.bombas.findMany.mockResolvedValue([
      {
        id_bomba: 1,
        ligada_hardware: true,
        disponivel_hardware: true,
        ultimo_status_hardware_em: baseTime,
      },
    ]);

    await service.runOnce(baseTime);

    expect(state.status_processo).toBe(statusprocesso.INTERROMPIDO);
    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.FALHA,
    );
    expect(state.encerramento_geral_ultimo_erro).toContain(
      'nao confirmou o estado seguro',
    );
    expect(prisma.alarmes.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id_processo: 10,
        titulo: 'Parada de emergencia sem confirmacao do controlador',
        severidade: 'CRITICO',
        status_alarme: 'ATIVO',
        bloqueante: true,
        requer_intervencao: true,
      }),
    });
    expect(sockets.emitEmergencyStop).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parada_emergencia: expect.objectContaining({
          status: 'FALHA',
          requer_intervencao: true,
        }),
      }),
    );

    prisma.alarmes.findFirst.mockResolvedValue({ id_alarme: 1 });
    state.status_encerramento_geral =
      statusencerramentoprocesso.CONFIRMANDO_HARDWARE;
    state.etapa_encerramento_geral =
      etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA;
    state.encerramento_geral_proxima_tentativa_em = new Date(
      baseTime.getTime() - 1,
    );

    await service.runOnce(new Date(baseTime.getTime() + 1_000));
    expect(prisma.alarmes.create).toHaveBeenCalledTimes(1);
    expect(prisma.alarmes.update).toHaveBeenCalledWith({
      where: { id_alarme: 1 },
      data: expect.objectContaining({
        descricao: expect.stringContaining('nao confirmou o estado seguro'),
      }),
    });
  });

  it('retoma inclusive o estado legado INATIVO apos reinicializacao', async () => {
    state.status_processo = statusprocesso.INTERROMPIDO;
    state.parada_emergencia = true;
    state.status_encerramento_geral = statusencerramentoprocesso.INATIVO;
    state.etapa_encerramento_geral = etapaencerramentoprocesso.NENHUMA;
    state.encerramento_geral_confirmacao_iniciada_em = new Date(
      baseTime.getTime() - 90_000,
    );
    state.encerramento_geral_proxima_tentativa_em = new Date(
      baseTime.getTime() - 1,
    );
    state.encerramento_geral_tentativa = 1;
    state.encerramento_geral_id_usuario = 7;

    const restarted = new ProcessoGeneralClosureService(
      prisma as PrismaService,
      commands as unknown as CommandService,
      {
        findReadingsForMetrics: jest.fn(async () => ({
          processostanques: [],
        })),
      } as unknown as ProcessosRepository,
      metrics as unknown as ProcessoMetricsService,
      {
        registerSystemAction: jest.fn(async () => ({})),
        registerUserAction: jest.fn(async () => ({})),
      } as unknown as ProcessoLogService,
      sockets as unknown as ProcessosSocketGateway,
      mqttConfig as unknown as MqttConfigService,
    );

    await restarted.runOnce(baseTime);

    expect(commands.paradaEmergencia).toHaveBeenCalledTimes(1);
    expect(commands.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commands.fecharTodasValvulas).toHaveBeenCalledTimes(1);
    expect(state.status_encerramento_geral).toBe(
      statusencerramentoprocesso.CONFIRMANDO_HARDWARE,
    );
  });

  it('nao duplica uma solicitacao concorrente com lease vigente e repete somente apos o vencimento', async () => {
    state.status_processo = statusprocesso.INTERROMPIDO;
    state.parada_emergencia = true;
    state.status_encerramento_geral =
      statusencerramentoprocesso.CONFIRMANDO_HARDWARE;
    state.etapa_encerramento_geral =
      etapaencerramentoprocesso.AGUARDANDO_TELEMETRIA;
    state.encerramento_geral_iniciado_em = new Date();
    state.encerramento_geral_confirmacao_iniciada_em = new Date();
    state.encerramento_geral_proxima_tentativa_em = new Date(
      Date.now() + 60_000,
    );
    state.encerramento_geral_tentativa = 1;
    state.encerramento_geral_comando_tentativas = 1;

    const concurrent = await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Clique concorrente',
      id_usuario: 7,
    });

    expect(concurrent.idempotent).toBe(true);
    expect(state.encerramento_geral_tentativa).toBe(1);
    expect(commands.paradaEmergencia).not.toHaveBeenCalled();

    state.encerramento_geral_proxima_tentativa_em = new Date(Date.now() - 1);
    const expired = await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Lease vencido',
      id_usuario: 7,
    });

    expect(expired.idempotent).toBe(false);
    expect(state.encerramento_geral_tentativa).toBe(2);
    expect(commands.paradaEmergencia).toHaveBeenCalledTimes(1);
  });

  it.each([statusprocesso.FALHA, statusprocesso.INTERROMPIDO])(
    'aceita a primeira parada segura mesmo quando o processo esta em %s',
    async (initialStatus) => {
      state.status_processo = initialStatus;
      state.parada_emergencia = false;
      state.status_encerramento_geral = statusencerramentoprocesso.INATIVO;
      state.etapa_encerramento_geral = etapaencerramentoprocesso.NENHUMA;
      state.encerramento_geral_iniciado_em = new Date(
        '2026-07-01T00:00:00.000Z',
      );

      const result = await service.requestEmergencyStop({
        id_processo: 10,
        motivo: 'Acionamento conservador',
        id_usuario: 7,
      });

      expect(result.idempotent).toBe(false);
      expect(result.previous_status).toBe(initialStatus);
      expect(state.status_processo).toBe(statusprocesso.INTERROMPIDO);
      expect(state.encerramento_geral_iniciado_em).not.toEqual(
        new Date('2026-07-01T00:00:00.000Z'),
      );
      expect(commands.paradaEmergencia).toHaveBeenCalledTimes(1);
    },
  );

  it('trata parada ja confirmada como idempotente e permite repetir uma falha pendente', async () => {
    state.status_processo = statusprocesso.INTERROMPIDO;
    state.parada_emergencia = true;
    state.status_encerramento_geral = statusencerramentoprocesso.CONCLUIDO;
    state.etapa_encerramento_geral = etapaencerramentoprocesso.CONCLUIDA;

    const confirmed = await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Repeticao',
      id_usuario: 7,
    });

    expect(confirmed.idempotent).toBe(true);
    expect(confirmed.state.status).toBe('CONFIRMADA');
    expect(commands.paradaEmergencia).not.toHaveBeenCalled();

    state.status_encerramento_geral = statusencerramentoprocesso.FALHA;
    state.etapa_encerramento_geral = etapaencerramentoprocesso.FALHA;
    const retry = await service.requestEmergencyStop({
      id_processo: 10,
      motivo: 'Tentativa humana',
      id_usuario: 7,
    });

    expect(retry.idempotent).toBe(false);
    expect(retry.state.status).toBe('AGUARDANDO_CONFIRMACAO');
    expect(commands.paradaEmergencia).toHaveBeenCalledTimes(1);
  });
});
