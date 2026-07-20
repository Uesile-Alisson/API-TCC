import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { statusbomba, tipobomba } from '@prisma/client';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesBombasService } from '../bombas/configuracoes-bombas.service';
import { asyncMock, makeBombaRecord } from './configuracoes-test-helpers';

type PrismaMock = {
  $transaction: ReturnType<typeof asyncMock>;
  bombas: {
    findMany: ReturnType<typeof asyncMock>;
    count: ReturnType<typeof asyncMock>;
    findUnique: ReturnType<typeof asyncMock>;
    create: ReturnType<typeof asyncMock>;
    update: ReturnType<typeof asyncMock>;
  };
  configuracoessistema: {
    findFirst: ReturnType<typeof asyncMock>;
  };
};

describe('ConfiguracoesBombasService', () => {
  let prisma: PrismaMock;
  let executeProtectedEquipmentMutation: ReturnType<typeof asyncMock>;
  let service: ConfiguracoesBombasService;

  beforeEach(() => {
    prisma = {
      $transaction: asyncMock(),
      bombas: {
        findMany: asyncMock(),
        count: asyncMock(),
        findUnique: asyncMock(),
        create: asyncMock(),
        update: asyncMock(),
      },
      configuracoessistema: {
        findFirst: asyncMock(),
      },
    };
    executeProtectedEquipmentMutation = asyncMock();
    executeProtectedEquipmentMutation.mockImplementation(
      async (...args: unknown[]) => {
        const mutation = args[1] as (tx: PrismaMock) => Promise<unknown>;
        return mutation(prisma);
      },
    );
    service = new ConfiguracoesBombasService(
      prisma as unknown as PrismaService,
      {
        executeProtectedEquipmentMutation,
      } as unknown as MqttConfigService,
    );
  });

  it('findAll retorna lista paginada', async () => {
    prisma.$transaction.mockResolvedValue([[makeBombaRecord()], 1]);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('findOne lanca NotFoundException quando bomba nao existe', async () => {
    prisma.bombas.findUnique.mockResolvedValue(null);

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rejeita duplicidade de nome', async () => {
    prisma.bombas.findUnique.mockResolvedValue({ id_bomba: 1 });

    await expect(
      service.create(
        {
          nome: 'Bomba Principal',
          tipo_bomba: tipobomba.PRINCIPAL,
          status_padrao: statusbomba.ATIVA,
        },
        { id_usuario: 7 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(executeProtectedEquipmentMutation).toHaveBeenCalledWith(
      'CREATE_PUMP',
      expect.any(Function),
    );
  });

  it('update rejeita PATCH vazio', async () => {
    prisma.bombas.findUnique.mockResolvedValue(makeBombaRecord());

    await expect(
      service.update(1, {}, { id_usuario: 7 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(executeProtectedEquipmentMutation).toHaveBeenCalledWith(
      'UPDATE_PUMP',
      expect.any(Function),
    );
  });

  it('ativar e desativar atualizam status_padrao', async () => {
    prisma.bombas.findUnique.mockResolvedValue(makeBombaRecord());
    prisma.bombas.update.mockResolvedValue(makeBombaRecord());

    await service.ativar(1, { id_usuario: 7 });
    await service.desativar(1, { id_usuario: 7 });

    expect(executeProtectedEquipmentMutation).toHaveBeenNthCalledWith(
      1,
      'ACTIVATE_PUMP',
      expect.any(Function),
    );
    expect(executeProtectedEquipmentMutation).toHaveBeenNthCalledWith(
      2,
      'DEACTIVATE_PUMP',
      expect.any(Function),
    );

    expect(prisma.bombas.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          status_padrao: statusbomba.ATIVA,
          id_usuario_alteracao: 7,
        }),
      }),
    );
    expect(prisma.bombas.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status_padrao: statusbomba.INATIVA,
          id_usuario_alteracao: 7,
        }),
      }),
    );
  });

  it('nao consulta nem altera bomba quando o intertravamento bloqueia', async () => {
    executeProtectedEquipmentMutation.mockRejectedValueOnce(
      new ConflictException('Processo operacional ativo.'),
    );

    await expect(
      service.create(
        {
          nome: 'Bomba Principal',
          tipo_bomba: tipobomba.PRINCIPAL,
          status_padrao: statusbomba.ATIVA,
        },
        { id_usuario: 7 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.bombas.findUnique).not.toHaveBeenCalled();
    expect(prisma.configuracoessistema.findFirst).not.toHaveBeenCalled();
    expect(prisma.bombas.create).not.toHaveBeenCalled();
  });
});
