import { describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { MqttClientService } from '../connection/mqtt-client.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MqttConfigService } from './mqtt-config.service';
import { Esp32SyncConfigService } from './esp32-sync-config.service';

type AsyncMock = Mock<(...args: unknown[]) => Promise<unknown>>;

const asyncMock = (): AsyncMock =>
  jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe('Esp32SyncConfigService', () => {
  it('publica SYNC_CONFIG com valvulas principais e auxiliares', async () => {
    const publish = asyncMock().mockResolvedValue(undefined);
    const updateLastSync = asyncMock().mockResolvedValue(undefined);
    const getConfig = asyncMock().mockResolvedValue({
      topico_configuracoes: 'tsea/config',
      topico_comandos: 'tsea/comandos',
      topico_leituras: 'tsea/leituras',
      topico_status: 'tsea/status',
      topico_heartbeat: 'tsea/heartbeat',
      topico_alarmes: 'tsea/alarmes',
      topico_acoplamentos: 'tsea/acoplamentos',
      topico_acks: 'tsea/acks',
      timeout_comunicacao: 10000,
    });
    const prisma = {
      configuracoessistema: {
        findFirst: asyncMock().mockResolvedValue({
          vacuo_padrao: -80,
          limite_seguranca_vacuo: -95,
          tolerancia_vacuo_percentual: 10,
        }),
      },
      bombas: {
        findMany: asyncMock().mockResolvedValue([
          makePump(1, 'BOMBA_VACUO_PRINCIPAL', 'PRINCIPAL'),
          makePump(2, 'BOMBA_VACUO_AUXILIAR', 'AUXILIAR'),
        ]),
      },
      tanques: {
        findMany: asyncMock().mockResolvedValue([
          makeTank(1, 'TANQUE_1'),
          makeTank(2, 'TANQUE_2'),
          makeTank(3, 'TANQUE_3'),
        ]),
      },
      valvulas: {
        findMany: asyncMock().mockResolvedValue([
          makeValve(1, 'VP_T1', 1, 1, 'PRINCIPAL', 'TANQUE_1'),
          makeValve(2, 'VA_T1', 1, 2, 'AUXILIAR', 'TANQUE_1'),
          makeValve(3, 'VP_T2', 2, 1, 'PRINCIPAL', 'TANQUE_2'),
          makeValve(4, 'VA_T2', 2, 2, 'AUXILIAR', 'TANQUE_2'),
          makeValve(5, 'VP_T3', 3, 1, 'PRINCIPAL', 'TANQUE_3'),
          makeValve(6, 'VA_T3', 3, 2, 'AUXILIAR', 'TANQUE_3'),
        ]),
      },
      sensores: {
        findMany: asyncMock().mockResolvedValue([]),
      },
    };
    const service = new Esp32SyncConfigService(
      prisma as unknown as PrismaService,
      { publish } as unknown as MqttClientService,
      { getConfig, updateLastSync } as unknown as MqttConfigService,
    );

    await service.publishSyncConfig({ correlation_id: 'sync-1' });

    expect(publish).toHaveBeenCalledWith(
      'tsea/config',
      expect.objectContaining({
        hardware: expect.objectContaining({
          valvulas: expect.arrayContaining([
            expect.objectContaining({
              codigo_hardware: 'VP_T1',
              tipo: 'PRINCIPAL',
              tanque_codigo_hardware: 'TANQUE_1',
            }),
            expect.objectContaining({
              codigo_hardware: 'VA_T1',
              tipo: 'AUXILIAR',
              tanque_codigo_hardware: 'TANQUE_1',
            }),
            expect.objectContaining({ codigo_hardware: 'VA_T2' }),
            expect.objectContaining({ codigo_hardware: 'VA_T3' }),
          ]),
        }),
      }),
      { qos: 1, retain: true },
    );
  });

  function makePump(
    id_bomba: number,
    codigo_hardware: string,
    tipo_bomba: string,
  ) {
    return {
      id_bomba,
      codigo_hardware,
      nome: codigo_hardware,
      tipo_bomba,
      status_padrao: 'ATIVA',
    };
  }

  function makeTank(id_tanque: number, codigo_hardware: string) {
    return {
      id_tanque,
      codigo_hardware,
      nome: codigo_hardware,
      volume: 20,
      unidade_volume: 'L',
      vacuo_padrao: -80,
    };
  }

  function makeValve(
    id_valvula: number,
    codigo_hardware: string,
    id_tanque: number,
    id_bomba: number,
    tipo_bomba: string,
    tanqueCodigo: string,
  ) {
    return {
      id_valvula,
      codigo_hardware,
      id_tanque,
      id_bomba,
      nome_valvula: codigo_hardware,
      numero_saida_manifold: id_valvula,
      funcao_valvula: 'VACUO',
      status_valvula: 'FECHADA',
      ativo: true,
      bombas: {
        id_bomba,
        codigo_hardware:
          tipo_bomba === 'PRINCIPAL'
            ? 'BOMBA_VACUO_PRINCIPAL'
            : 'BOMBA_VACUO_AUXILIAR',
        nome: `Bomba ${tipo_bomba}`,
        tipo_bomba,
      },
      tanques: {
        codigo_hardware: tanqueCodigo,
      },
    };
  }
});
