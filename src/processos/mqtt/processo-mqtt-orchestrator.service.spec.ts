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
import { HardwareState } from '../../mqtt-hardware/interfaces/hardware-state.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoMqttOrchestratorService } from './processo-mqtt-orchestrator.service';
import { ProcessoMqttCommandContext } from './processo-mqtt.types';

type CommandServiceMock = {
  desligarTodasBombas: Mock<() => Promise<CommandResult>>;
  fecharTodasValvulas: Mock<() => Promise<CommandResult>>;
  sincronizarHardware: Mock<() => Promise<CommandResult>>;
  iniciarProcessoVacuo: Mock<() => Promise<CommandResult>>;
  paradaEmergencia: Mock<
    (params: { motivo: string }) => Promise<CommandResult>
  >;
};

type MqttHealthServiceMock = {
  getCurrentState: Mock<() => HardwareState>;
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

      paradaEmergencia: jest
        .fn<(params: { motivo: string }) => Promise<CommandResult>>()
        .mockResolvedValue(commandResult(MQTT_COMMANDS.PARADA_EMERGENCIA)),
    };

    mqttHealthService = {
      getCurrentState: jest
        .fn<() => HardwareState>()
        .mockReturnValue(hardwareState),
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
      prisma as unknown as PrismaService,
    );
  });

  it('getHardwareReadiness retorna estado atual do hardware', () => {
    const result = service.getHardwareReadiness();

    expect(result).toEqual({
      mqttConnected: true,
      esp32Online: true,
      communicationReady: true,
      currentStatus: hardwareState,
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
          }),
        ],
      }),
    );
  });

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

  it('executeEmergencyStop chama paradaEmergencia', async () => {
    const result = await service.executeEmergencyStop({
      id_processo: 10,
      motivo: 'Falha crítica',
    });

    expect(result.success).toBe(true);
    expect(commandService.paradaEmergencia).toHaveBeenCalledWith({
      motivo: 'Processo 10: Falha crítica',
    });
    expect(result.command_results).toHaveLength(1);
  });

  it('shutdownAllActuators desliga bombas e fecha valvulas', async () => {
    const result = await service.shutdownAllActuators(10);

    expect(result).toMatchObject({
      success: true,
      id_processo: 10,
    });
    expect(commandService.desligarTodasBombas).toHaveBeenCalledTimes(1);
    expect(commandService.fecharTodasValvulas).toHaveBeenCalledTimes(1);
  });

  it('retorna success false quando comando falha', async () => {
    commandService.desligarTodasBombas.mockRejectedValueOnce(
      new Error('Broker indisponível'),
    );

    const result = await service.shutdownAllActuators(10);

    expect(result).toEqual({
      success: false,
      message: 'Broker indisponível',
      id_processo: 10,
    });
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

  function processoRecord(): unknown {
    return {
      id_processo: 10,
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
              {
                id_valvula: 70,
                codigo_hardware: 'VP_T1',
                nome_valvula: 'Valvula Vacuo',
                funcao_valvula: 'VACUO',
              },
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
