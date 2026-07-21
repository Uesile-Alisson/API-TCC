import { statusgeralsistema } from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';

import { CommandService } from '../../mqtt-hardware/commands/command.service';
import {
  CommandName,
  MQTT_COMMANDS,
} from '../../mqtt-hardware/commands/interfaces/command-name.interface';
import { CommandResult } from '../../mqtt-hardware/commands/interfaces/command-result.interface';
import { MqttHealthService } from '../../mqtt-hardware/connection/mqtt-health.service';
import { MqttCredentialsService } from '../../mqtt-hardware/config/mqtt-credentials.service';
import { HardwareState } from '../../mqtt-hardware/interfaces/hardware-state.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoMqttOrchestratorService } from './processo-mqtt-orchestrator.service';
import { ProcessoMqttCommandContext } from './processo-mqtt.types';

type CommandServiceMock = {
  desligarTodasBombas: Mock<() => Promise<CommandResult>>;
  fecharTodasValvulas: Mock<() => Promise<CommandResult>>;
  sincronizarHardware: Mock<() => Promise<CommandResult>>;
  iniciarProcessoVacuo: Mock<(...args: unknown[]) => Promise<CommandResult>>;
  abrirValvula: Mock<(...args: unknown[]) => Promise<CommandResult>>;
  ligarBomba: Mock<(...args: unknown[]) => Promise<CommandResult>>;
  paradaEmergencia: Mock<
    (params: { motivo: string }) => Promise<CommandResult>
  >;
};

type MqttHealthServiceMock = {
  getCurrentState: Mock<() => HardwareState>;
  isCurrentConfigApplied: Mock<() => boolean>;
};

type PrismaServiceMock = {
  processos: {
    findUnique: Mock<() => Promise<unknown>>;
  };
  configuracoessistema: {
    findFirst: Mock<() => Promise<unknown>>;
  };
  bombas: {
    findFirst: Mock<() => Promise<unknown>>;
  };
};

describe('ProcessoMqttOrchestratorService', () => {
  let service: ProcessoMqttOrchestratorService;
  let commandService: CommandServiceMock;
  let mqttHealthService: MqttHealthServiceMock;
  let mqttCredentialsService: {
    getCredentialReadiness: Mock<() => unknown>;
  };
  let prisma: PrismaServiceMock;

  const context: ProcessoMqttCommandContext = {
    id_processo: 10,
    tanques: [
      {
        id_processo_tanque: 20,
        id_tanque: 30,
        nome_tanque: 'Tanque A',
      },
    ],
    sensores: [
      {
        id_processo_tanque_sensor: 40,
        id_sensor: 50,
        id_tanque: 30,
        nome_sensor: 'Sensor A',
      },
    ],
  };

  const hardwareState: HardwareState = {
    mqttConnected: true,
    esp32Online: true,
    lastHeartbeatAt: new Date('2026-01-01T00:00:00Z'),
    lastStatusAt: new Date('2026-01-01T00:00:00Z'),
    lastReadingAt: new Date('2026-01-01T00:00:00Z'),
    currentStatus: statusgeralsistema.OPERACIONAL,
    lastError: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    commandService = {
      desligarTodasBombas: jest
        .fn<() => Promise<CommandResult>>()
        .mockResolvedValue(commandResult(MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS)),

      fecharTodasValvulas: jest
        .fn<() => Promise<CommandResult>>()
        .mockResolvedValue(commandResult(MQTT_COMMANDS.FECHAR_TODAS_VALVULAS)),

      sincronizarHardware: jest
        .fn<() => Promise<CommandResult>>()
        .mockResolvedValue(commandResult(MQTT_COMMANDS.SINCRONIZAR_HARDWARE)),

      iniciarProcessoVacuo: jest
        .fn<() => Promise<CommandResult>>()
        .mockResolvedValue(commandResult(MQTT_COMMANDS.INICIAR_PROCESSO_VACUO)),

      abrirValvula: jest
        .fn<(...args: unknown[]) => Promise<CommandResult>>()
        .mockResolvedValue(commandResult(MQTT_COMMANDS.ABRIR_VALVULA)),

      ligarBomba: jest
        .fn<(...args: unknown[]) => Promise<CommandResult>>()
        .mockResolvedValue(commandResult(MQTT_COMMANDS.LIGAR_BOMBA)),

      paradaEmergencia: jest
        .fn<(params: { motivo: string }) => Promise<CommandResult>>()
        .mockResolvedValue(commandResult(MQTT_COMMANDS.PARADA_EMERGENCIA)),
    };

    mqttHealthService = {
      getCurrentState: jest
        .fn<() => HardwareState>()
        .mockReturnValue(hardwareState),
      isCurrentConfigApplied: jest.fn<() => boolean>().mockReturnValue(true),
    };
    mqttCredentialsService = {
      getCredentialReadiness: jest.fn<() => unknown>().mockReturnValue({
        usuarioConfigurado: true,
        senhaConfigurada: true,
        credenciaisConfiguradas: true,
        credenciaisVerificadas: true,
        verificadasEm: new Date('2026-01-01T00:00:00Z'),
        ultimaFalha: null,
        atualizadoEm: new Date('2026-01-01T00:00:00Z'),
      }),
    };

    prisma = {
      processos: {
        findUnique: jest
          .fn<() => Promise<unknown>>()
          .mockResolvedValue(processoRecord()),
      },
      configuracoessistema: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          limite_seguranca_vacuo: -95,
          tolerancia_vacuo_percentual: 10,
        }),
      },
      bombas: {
        findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({
          id_bomba: 1,
          codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
          nome: 'Bomba de Vacuo Principal',
          tipo_bomba: 'PRINCIPAL',
        }),
      },
    };

    service = new ProcessoMqttOrchestratorService(
      commandService as unknown as CommandService,
      mqttHealthService as unknown as MqttHealthService,
      mqttCredentialsService as unknown as MqttCredentialsService,
      prisma as unknown as PrismaService,
    );
  });

  it('getHardwareReadiness retorna estado atual do hardware', () => {
    const result = service.getHardwareReadiness();

    expect(result).toEqual({
      credentialsConfigured: true,
      credentialsVerified: true,
      credentialsVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      credentialsFailure: null,
      mqttConnected: true,
      configurationApplied: true,
      mqttOperational: true,
      esp32Online: true,
      communicationReady: true,
      currentStatus: hardwareState,
    });
  });

  it('nao considera a comunicacao pronta antes de o broker verificar as credenciais', () => {
    mqttCredentialsService.getCredentialReadiness.mockReturnValueOnce({
      usuarioConfigurado: true,
      senhaConfigurada: true,
      credenciaisConfiguradas: true,
      credenciaisVerificadas: false,
      verificadasEm: null,
      ultimaFalha: 'Credenciais recusadas.',
      atualizadoEm: new Date(),
    });

    expect(service.getHardwareReadiness()).toMatchObject({
      credentialsConfigured: true,
      credentialsVerified: false,
      mqttConnected: true,
      mqttOperational: false,
      esp32Online: true,
      communicationReady: false,
    });
  });

  it('nao considera MQTT operacional quando a configuracao persistida nao foi aplicada', () => {
    mqttHealthService.isCurrentConfigApplied.mockReturnValueOnce(false);

    expect(service.getHardwareReadiness()).toMatchObject({
      mqttConnected: true,
      configurationApplied: false,
      mqttOperational: false,
      communicationReady: false,
    });
  });

  it('prepareHardwareForStart desliga atuadores e sincroniza hardware', async () => {
    const result = await service.prepareHardwareForStart(context);

    expect(result.success).toBe(true);
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
    expect(commandService.sincronizarHardware).toHaveBeenCalledTimes(1);
    expect(result.command_results).toHaveLength(3);
  });

  it('startVacuumOperation publica comando real com mapeamento de hardware', async () => {
    const result = await service.startVacuumOperation(context);

    expect(result.success).toBe(true);
    expect(commandService.iniciarProcessoVacuo).toHaveBeenCalledTimes(1);
    expect(commandService.iniciarProcessoVacuo).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'INICIAR_PROCESSO_VACUO',
        schema_version: 2,
        id_processo: 10,
        bomba: expect.objectContaining({
          codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
        }),
        tanques: [
          expect.objectContaining({
            codigo_hardware: 'TANQUE_1',
            sensor_vacuo: expect.objectContaining({
              codigo_hardware: 'VACUO_T1',
            }),
            sensor_acoplamento: expect.objectContaining({
              codigo_hardware: 'ACOP_T1',
            }),
            valvulas: expect.arrayContaining([
              expect.objectContaining({
                codigo_hardware: 'VP_T1',
                tipo: 'PRINCIPAL',
                bomba_codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
                numero_saida_manifold: 1,
              }),
              expect.objectContaining({
                codigo_hardware: 'VA_T1',
                tipo: 'AUXILIAR',
                bomba_codigo_hardware: 'BOMBA_VACUO_AUXILIAR',
                numero_saida_manifold: 1,
              }),
            ]),
          }),
        ],
      }),
      { id_processo: 10 },
    );
    expect(commandService.abrirValvula).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10 }),
      70,
      'VP_T1',
      { id_tanque: 30, id_processo_tanque: 20 },
    );
    expect(commandService.ligarBomba).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 10 }),
      1,
      'BOMBA_VACUO_PRINCIPAL',
    );
    expect(result.command_results).toHaveLength(3);
  });

  it('executa rollback seguro quando a bomba principal nao confirma inicio', async () => {
    commandService.ligarBomba.mockRejectedValueOnce(
      new Error('ACK da bomba expirou'),
    );

    const result = await service.startVacuumOperation(context);

    expect(result.success).toBe(false);
    expect(result.message).toContain('ACK da bomba expirou');
    expect(result.message).toContain('Parada segura confirmada');
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
    expect(result.command_results).toHaveLength(4);
  });

  it.each([
    {
      label: 'principal',
      fixture: { includeMain: false },
      expected: 'exatamente uma valvula principal',
    },
    {
      label: 'auxiliar',
      fixture: { includeAuxiliary: false },
      expected: 'exatamente uma valvula auxiliar',
    },
  ])(
    'bloqueia inicio quando faltar valvula $label',
    async ({ fixture, expected }) => {
      prisma.processos.findUnique.mockResolvedValueOnce(
        processoRecord(fixture),
      );

      const result = await service.startVacuumOperation(context);

      expect(result.success).toBe(false);
      expect(result.message).toContain(expected);
      expect(commandService.iniciarProcessoVacuo).not.toHaveBeenCalled();
    },
  );

  it('pauseVacuumOperation desliga atuadores', async () => {
    const result = await service.pauseVacuumOperation(context);

    expect(result.success).toBe(true);
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
    expect(result.command_results).toHaveLength(2);
  });

  it('finishVacuumOperation desliga atuadores', async () => {
    const result = await service.finishVacuumOperation(context);

    expect(result.success).toBe(true);
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
  });

  it('interruptVacuumOperation desliga atuadores', async () => {
    const result = await service.interruptVacuumOperation(context);

    expect(result.success).toBe(true);
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
  });

  it('shutdownAllActuators desliga bombas e fecha valvulas', async () => {
    const result = await service.shutdownAllActuators(10);

    expect(result).toEqual({
      success: true,
      message: 'Atuadores desligados com segurança.',
      id_processo: 10,
      command_results: [
        commandResult(MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS),
        commandResult(MQTT_COMMANDS.FECHAR_TODAS_VALVULAS),
      ],
    });
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
  });

  it('tenta fechar valvulas quando desligar bombas falha e preserva o resultado parcial', async () => {
    commandService.desligarTodasBombas.mockRejectedValueOnce(
      new Error('Broker indisponível'),
    );

    const result = await service.shutdownAllActuators(10);

    expect(result).toEqual({
      success: false,
      message:
        'Falha ao confirmar todos os comandos de parada segura: DESLIGAR_TODAS_BOMBAS: Broker indisponível',
      id_processo: 10,
      command_results: [commandResult(MQTT_COMMANDS.FECHAR_TODAS_VALVULAS)],
      command_failures: [
        {
          comando: MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS,
          message: 'Broker indisponível',
        },
      ],
    });
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
  });

  it('preserva o desligamento das bombas quando fechar valvulas falha', async () => {
    commandService.fecharTodasValvulas.mockRejectedValueOnce(
      new Error('ACK das válvulas expirou'),
    );

    const result = await service.shutdownAllActuators(10);

    expect(result).toEqual({
      success: false,
      message:
        'Falha ao confirmar todos os comandos de parada segura: FECHAR_TODAS_VALVULAS: ACK das válvulas expirou',
      id_processo: 10,
      command_results: [commandResult(MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS)],
      command_failures: [
        {
          comando: MQTT_COMMANDS.FECHAR_TODAS_VALVULAS,
          message: 'ACK das válvulas expirou',
        },
      ],
    });
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
  });

  it('relata independentemente a falha dos dois comandos de parada segura', async () => {
    commandService.desligarTodasBombas.mockRejectedValueOnce(
      new Error('Falha nas bombas'),
    );
    commandService.fecharTodasValvulas.mockRejectedValueOnce(
      new Error('Falha nas válvulas'),
    );

    const result = await service.shutdownAllActuators(10);

    expect(result).toEqual({
      success: false,
      message:
        'Falha ao confirmar todos os comandos de parada segura: DESLIGAR_TODAS_BOMBAS: Falha nas bombas; FECHAR_TODAS_VALVULAS: Falha nas válvulas',
      id_processo: 10,
      command_results: [],
      command_failures: [
        {
          comando: MQTT_COMMANDS.DESLIGAR_TODAS_BOMBAS,
          message: 'Falha nas bombas',
        },
        {
          comando: MQTT_COMMANDS.FECHAR_TODAS_VALVULAS,
          message: 'Falha nas válvulas',
        },
      ],
    });
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
  });

  function commandResult(comando: CommandName): CommandResult {
    return {
      comando,
      topic: 'tsea/comandos',
      qos: 1,
      retain: false,
      correlation_id: `corr-${comando}`,
      published_at: new Date('2026-01-01T00:00:00Z'),
    };
  }

  function processoRecord(
    options: { includeMain?: boolean; includeAuxiliary?: boolean } = {},
  ): unknown {
    return {
      id_processo: 10,
      modo_operacao_auxiliar: 'AUTOMATICO',
      vacuo_alvo: -80,
      processostanques: [
        {
          id_processo_tanque: 20,
          id_tanque: 30,
          vacuo_alvo: -80,
          tanques: {
            id_tanque: 30,
            nome: 'Tanque A',
            codigo_hardware: 'TANQUE_1',
            sensoresacoplamentomangueiras: {
              sensores: {
                id_sensor: 60,
                codigo_hardware: 'ACOP_T1',
                nome: 'Sensor Acoplamento',
                unidade_medida: 'estado',
              },
            },
            valvulas: [
              ...(options.includeMain === false
                ? []
                : [
                    {
                      id_valvula: 70,
                      codigo_hardware: 'VP_T1',
                      numero_saida_manifold: 1,
                      nome_valvula: 'Valvula principal do tanque 1',
                      funcao_valvula: 'VACUO',
                      id_bomba: 1,
                      bombas: {
                        id_bomba: 1,
                        codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
                        nome: 'Bomba de Vacuo Principal',
                        tipo_bomba: 'PRINCIPAL',
                      },
                    },
                  ]),
              ...(options.includeAuxiliary === false
                ? []
                : [
                    {
                      id_valvula: 71,
                      codigo_hardware: 'VA_T1',
                      numero_saida_manifold: 1,
                      nome_valvula: 'Valvula auxiliar do tanque 1',
                      funcao_valvula: 'VACUO',
                      id_bomba: 2,
                      bombas: {
                        id_bomba: 2,
                        codigo_hardware: 'BOMBA_VACUO_AUXILIAR',
                        nome: 'Bomba Auxiliar de Estabilizacao',
                        tipo_bomba: 'AUXILIAR',
                      },
                    },
                  ]),
            ],
          },
          processostanquessensores: [
            {
              id_processo_tanque_sensor: 40,
              id_sensor: 50,
              sensores: {
                id_sensor: 50,
                codigo_hardware: 'VACUO_T1',
                nome: 'Sensor Vacuo',
                tipo_sensor: 'VACUO',
                unidade_medida: 'kPa',
              },
            },
          ],
        },
      ],
    };
  }
});
