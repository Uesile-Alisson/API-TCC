import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import { statusgeralsistema } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesSistemaService } from '../sistema/configuracoes-sistema.service';
import { asyncMock, makeSistemaRecord } from './configuracoes-test-helpers';

type PrismaMock = {
  configuracoessistema: {
    findFirst: ReturnType<typeof asyncMock>;
    update: ReturnType<typeof asyncMock>;
  };
};

type OperationalInterlockMock = {
  executeProtectedEquipmentMutation: ReturnType<typeof asyncMock>;
};

describe('ConfiguracoesSistemaService', () => {
  let prisma: PrismaMock;
  let operationalInterlock: OperationalInterlockMock;
  let systemConfigCache: { invalidate: ReturnType<typeof asyncMock> };
  let readingContextCache: { invalidate: ReturnType<typeof asyncMock> };
  let service: ConfiguracoesSistemaService;

  beforeEach(() => {
    prisma = {
      configuracoessistema: {
        findFirst: asyncMock(),
        update: asyncMock(),
      },
    };
    operationalInterlock = {
      executeProtectedEquipmentMutation: asyncMock(),
    };
    operationalInterlock.executeProtectedEquipmentMutation.mockImplementation(
      async (...args: unknown[]) => {
        const mutation = args[1] as (tx: PrismaMock) => Promise<unknown>;
        return await mutation(prisma);
      },
    );
    systemConfigCache = { invalidate: asyncMock() };
    readingContextCache = { invalidate: asyncMock() };
    service = new ConfiguracoesSistemaService(
      prisma as unknown as PrismaService,
      operationalInterlock as unknown as MqttConfigService,
      systemConfigCache as never,
      readingContextCache as never,
    );
  });

  it('findCurrent retorna configuracao mapeada', async () => {
    prisma.configuracoessistema.findFirst.mockResolvedValue(
      makeSistemaRecord(),
    );

    const result = await service.findCurrent();

    expect(result.vacuo_padrao).toBe(-80.5);
    expect(result.limite_seguranca_vacuo).toBe(-95);
    expect(result.status_geral_sistema).toBe(statusgeralsistema.OPERACIONAL);
    expect(result.estagnacao_janela_segundos).toBe(60);
    expect(result.estagnacao_variacao_minima).toBe(2);
    expect(result.tempo_estabilizacao_vacuo_segundos).toBe(30);
    expect(result.estabilizacao_cobertura_minima_percentual).toBe(80);
  });

  it('findCurrent lanca NotFoundException quando nao existe', async () => {
    prisma.configuracoessistema.findFirst.mockResolvedValue(null);

    await expect(service.findCurrent()).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updateCurrent rejeita PATCH vazio sem consultar banco', async () => {
    await expect(
      service.updateCurrent({}, { id_usuario: 7 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.configuracoessistema.findFirst).not.toHaveBeenCalled();
  });

  it('updateCurrent atualiza campos permitidos e usa usuario autenticado', async () => {
    prisma.configuracoessistema.findFirst.mockResolvedValue(
      makeSistemaRecord(),
    );
    prisma.configuracoessistema.update.mockResolvedValue(
      makeSistemaRecord({
        id_usuario_alteracao: 7,
        tolerancia_vacuo_percentual: { toNumber: () => 12.5 },
        estagnacao_janela_segundos: 90,
        estagnacao_variacao_minima: { toNumber: () => 1.5 },
      }),
    );

    const result = await service.updateCurrent(
      {
        tolerancia_vacuo_percentual: 12.5,
        status_geral_sistema: statusgeralsistema.ALERTA,
        estagnacao_janela_segundos: 90,
        estagnacao_variacao_minima: 1.5,
      },
      { id_usuario: 7 },
    );

    expect(prisma.configuracoessistema.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tolerancia_vacuo_percentual: 12.5,
          status_geral_sistema: statusgeralsistema.ALERTA,
          estagnacao_janela_segundos: 90,
          estagnacao_variacao_minima: 1.5,
          id_usuario_alteracao: 7,
        }),
      }),
    );
    expect(result.id_usuario_alteracao).toBe(7);
    expect(result.estagnacao_janela_segundos).toBe(90);
    expect(result.estagnacao_variacao_minima).toBe(1.5);
    expect(systemConfigCache.invalidate).toHaveBeenCalledTimes(1);
    expect(readingContextCache.invalidate).toHaveBeenCalledTimes(1);
    expect(
      operationalInterlock.executeProtectedEquipmentMutation,
    ).toHaveBeenCalledWith('UPDATE_SYSTEM_CONFIGURATION', expect.any(Function));
  });

  it('updateCurrent rejeita timeout de sensor menor que o intervalo esperado', async () => {
    prisma.configuracoessistema.findFirst.mockResolvedValue(
      makeSistemaRecord(),
    );

    await expect(
      service.updateCurrent(
        { intervalo_leitura_esperado_ms: 5000 },
        { id_usuario: 7 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.configuracoessistema.update).not.toHaveBeenCalled();
  });

  it('nao consulta nem grava quando o intertravamento operacional bloqueia', async () => {
    operationalInterlock.executeProtectedEquipmentMutation.mockRejectedValue(
      new ConflictException('Processo ativo.'),
    );

    await expect(
      service.updateCurrent(
        { estagnacao_janela_segundos: 90 },
        { id_usuario: 7 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.configuracoessistema.findFirst).not.toHaveBeenCalled();
    expect(prisma.configuracoessistema.update).not.toHaveBeenCalled();
  });
});
