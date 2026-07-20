import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { statusgeralsistema, StatusValvula } from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoGeneralClosureService } from '../../processos/lifecycle';
import { BombaHardwareStatusService } from '../bombas/bomba-hardware-status.service';
import { MqttConfigService } from '../config/mqtt-config.service';
import { ValvulaHardwareStatusService } from '../valvulas/valvula-hardware-status.service';
import { StatusHandler } from './status.handler';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('StatusHandler', () => {
  it.each([
    {
      scenario: 'antigo',
      sentAt: '2020-01-01T00:00:00.000Z',
      receivedAt: new Date('2026-07-01T12:00:01.000Z'),
    },
    {
      scenario: 'futuro',
      sentAt: '2099-12-31T23:59:59.000Z',
      receivedAt: new Date('2026-07-01T12:00:02.000Z'),
    },
  ])(
    'preserva enviado_em $scenario como horario declarado, mas persiste freshness com receivedAt',
    async ({ sentAt, receivedAt }) => {
      const prisma = {
        configuracoessistema: {
          findFirst: asyncMock().mockResolvedValue({
            id_configuracao_sistema: 1,
            status_geral_sistema: statusgeralsistema.ALERTA,
          }),
          update: asyncMock().mockResolvedValue({}),
        },
      };

      const mqttConfig = {
        updateLastSync: asyncMock().mockResolvedValue(undefined),
        registerHardwareStatusSnapshot:
          asyncMock().mockResolvedValue(undefined),
      };

      const valveStatus = {
        processStatusPayload: asyncMock().mockResolvedValue([]),
      };
      const pumpStatus = {
        processStatusPayload: asyncMock().mockResolvedValue([]),
      };
      const generalClosure = {
        reconcileControllerEmergency: asyncMock().mockResolvedValue(null),
      };

      const handler = new StatusHandler(
        prisma as unknown as PrismaService,
        mqttConfig as unknown as MqttConfigService,
        pumpStatus as unknown as BombaHardwareStatusService,
        valveStatus as unknown as ValvulaHardwareStatusService,
        generalClosure as unknown as ProcessoGeneralClosureService,
      );

      const result = await handler.handle({
        topic: 'tsea/status',
        payload: {
          esp32_on: true,
          status_geral: statusgeralsistema.OPERACIONAL,
          mensagem: 'ESP32 operacional',
          device_id: 'esp32-tsea-simulado',
          sensores_ativos: 3,
          valvulas: {},
          tanques: {},
          enviado_em: sentAt,
        },
        qos: 1,
        retain: false,
        receivedAt,
      });

      expect(result?.status_em).toEqual(new Date(sentAt));
      expect(result?.receivedAt).toEqual(receivedAt);
      expect(valveStatus.processStatusPayload).toHaveBeenCalledWith(
        {},
        receivedAt,
      );
      expect(pumpStatus.processStatusPayload).toHaveBeenCalledWith(
        undefined,
        receivedAt,
      );
      expect(mqttConfig.registerHardwareStatusSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'tsea/status',
          receivedAt,
          statusAt: new Date(sentAt),
          payload: expect.objectContaining({
            tipo: 'HARDWARE_STATUS',
            esp32_on: true,
            enviado_em: sentAt,
          }),
        }),
      );
    },
  );

  it('nao usa mensagem retida como evidencia temporal nova do hardware', async () => {
    const prisma = {
      configuracoessistema: {
        findFirst: asyncMock().mockResolvedValue({
          id_configuracao_sistema: 1,
          status_geral_sistema: statusgeralsistema.OPERACIONAL,
        }),
        update: asyncMock().mockResolvedValue({}),
      },
    };
    const mqttConfig = {
      updateLastSync: asyncMock().mockResolvedValue(undefined),
      registerHardwareStatusSnapshot: asyncMock().mockResolvedValue(undefined),
    };
    const valveStatus = {
      processStatusPayload: asyncMock().mockResolvedValue([]),
    };
    const pumpStatus = {
      processStatusPayload: asyncMock().mockResolvedValue([]),
    };
    const generalClosure = {
      reconcileControllerEmergency: asyncMock().mockResolvedValue(null),
    };
    const handler = new StatusHandler(
      prisma as unknown as PrismaService,
      mqttConfig as unknown as MqttConfigService,
      pumpStatus as unknown as BombaHardwareStatusService,
      valveStatus as unknown as ValvulaHardwareStatusService,
      generalClosure as unknown as ProcessoGeneralClosureService,
    );

    await handler.handle({
      topic: 'tsea/status',
      payload: {
        esp32_on: true,
        status_geral: statusgeralsistema.OPERACIONAL,
        enviado_em: '2099-12-31T23:59:59.000Z',
      },
      qos: 1,
      retain: true,
      receivedAt: new Date('2026-07-19T18:00:00.000Z'),
    });

    expect(pumpStatus.processStatusPayload).toHaveBeenCalledWith(
      undefined,
      new Date(0),
    );
    expect(valveStatus.processStatusPayload).toHaveBeenCalledWith(
      undefined,
      new Date(0),
    );
    expect(mqttConfig.registerHardwareStatusSnapshot).not.toHaveBeenCalled();
    expect(generalClosure.reconcileControllerEmergency).not.toHaveBeenCalled();
  });

  it('reconcilia no processo uma parada acionada fisicamente e reportada em status novo', async () => {
    const prisma = {
      configuracoessistema: {
        findFirst: asyncMock().mockResolvedValue({
          id_configuracao_sistema: 1,
          status_geral_sistema: statusgeralsistema.FALHA,
        }),
        update: asyncMock().mockResolvedValue({}),
      },
    };
    const mqttConfig = {
      updateLastSync: asyncMock().mockResolvedValue(undefined),
      registerHardwareStatusSnapshot: asyncMock().mockResolvedValue(undefined),
    };
    const pumpStatus = {
      processStatusPayload: asyncMock().mockResolvedValue([]),
    };
    const valveStatus = {
      processStatusPayload: asyncMock().mockResolvedValue([]),
    };
    const generalClosure = {
      reconcileControllerEmergency: asyncMock().mockResolvedValue({
        idempotent: false,
      }),
    };
    const handler = new StatusHandler(
      prisma as unknown as PrismaService,
      mqttConfig as unknown as MqttConfigService,
      pumpStatus as unknown as BombaHardwareStatusService,
      valveStatus as unknown as ValvulaHardwareStatusService,
      generalClosure as unknown as ProcessoGeneralClosureService,
    );

    const result = await handler.handle({
      topic: 'tsea/status',
      payload: {
        esp32_on: true,
        status_geral: statusgeralsistema.FALHA,
        device_id: 'ESP32_TSEA_01',
        emergencia_ativa: true,
        erro_atual: 'PARADA_EMERGENCIA_FISICA',
        enviado_em: '2026-07-19T18:00:00.000Z',
      },
      qos: 1,
      retain: false,
      receivedAt: new Date('2026-07-19T18:00:00.500Z'),
    });

    expect(generalClosure.reconcileControllerEmergency).toHaveBeenCalledWith({
      motivo: expect.stringContaining('PARADA_EMERGENCIA_FISICA'),
    });
    expect(result).toMatchObject({
      emergencia_ativa: true,
      erro_atual: 'PARADA_EMERGENCIA_FISICA',
      emergency_stop_reconciled: true,
    });
  });

  it('aceita status oficial v2 com as seis valvulas tipadas', () => {
    const dto = MqttPayloadValidator.validateStatus({
      tipo: 'HARDWARE_STATUS',
      schema_version: 2,
      esp32_on: true,
      status_geral: statusgeralsistema.OPERACIONAL,
      device_id: 'ESP32_TSEA_01',
      valvulas: ['VP_T1', 'VA_T1', 'VP_T2', 'VA_T2', 'VP_T3', 'VA_T3'].map(
        (codigo_hardware, index) => ({
          codigo_hardware,
          id_tanque: Math.floor(index / 2) + 1,
          numero_saida_manifold: Math.floor(index / 2) + 1,
          tipo: codigo_hardware.startsWith('VP_') ? 'PRINCIPAL' : 'AUXILIAR',
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: false,
          disponivel: true,
        }),
      ),
      bombas: [
        {
          codigo_hardware: 'BOMBA_PRINCIPAL',
          ligada: true,
          disponivel: true,
          falha: false,
        },
        {
          codigo_hardware: 'BOMBA_AUXILIAR',
          ligada: false,
          disponivel: true,
          falha: false,
        },
      ],
      enviado_em: '2026-07-01T12:00:00.000Z',
    });

    expect(Array.isArray(dto.valvulas)).toBe(true);
    expect(dto.valvulas).toHaveLength(6);
    expect(dto.bombas).toHaveLength(2);
  });

  it('rejeita status oficial v2 sem telemetria fisica das bombas', () => {
    expect(() =>
      MqttPayloadValidator.validateStatus({
        tipo: 'HARDWARE_STATUS',
        schema_version: 2,
        esp32_on: true,
        status_geral: statusgeralsistema.OPERACIONAL,
        valvulas: [],
        enviado_em: '2026-07-01T12:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });

  it('mantem compatibilidade explicita com status legado v1', () => {
    expect(() =>
      MqttPayloadValidator.validateStatus({
        schema_version: 1,
        esp32_on: true,
        status_geral: statusgeralsistema.OPERACIONAL,
        valvulas: {
          '1': {
            id_valvula: 1,
            status_valvula: StatusValvula.FECHADA,
            ack: true,
            falha: false,
          },
        },
        enviado_em: '2026-07-01T12:00:00.000Z',
      }),
    ).not.toThrow();
  });

  it('rejeita versao MQTT nao suportada', () => {
    expect(() =>
      MqttPayloadValidator.validateStatus({
        tipo: 'HARDWARE_STATUS',
        schema_version: 3,
        esp32_on: true,
        status_geral: statusgeralsistema.OPERACIONAL,
        valvulas: [],
        enviado_em: '2026-07-01T12:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });
});
