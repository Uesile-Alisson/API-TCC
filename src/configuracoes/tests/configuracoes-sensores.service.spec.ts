import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { protocolosensor, statussensor, tiposensor } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesSensoresService } from '../sensores/configuracoes-sensores.service';
import { asyncMock } from './configuracoes-test-helpers';

type PrismaMock = {
  $transaction: ReturnType<typeof asyncMock>;
  sensores: {
    findMany: ReturnType<typeof asyncMock>;
    count: ReturnType<typeof asyncMock>;
    findFirst: ReturnType<typeof asyncMock>;
    findUnique: ReturnType<typeof asyncMock>;
    create: ReturnType<typeof asyncMock>;
    update: ReturnType<typeof asyncMock>;
  };
  tanques: {
    findUnique: ReturnType<typeof asyncMock>;
  };
};

type SensorTestRecord = {
  id_sensor: number;
  id_tanque: number;
  nome: string;
  modelo: string;
  protocolo: protocolosensor;
  tipo_sensor: tiposensor;
  unidade_medida: string;
  status_sensor: statussensor;
  criado_em: Date;
  atualizado_em: Date;
  excluido_em: Date | null;
  tanques: {
    id_tanque: number;
    nome: string;
  };
};

function makeSensorRecord(
  overrides: Partial<SensorTestRecord> = {},
): SensorTestRecord {
  return {
    id_sensor: 1,
    id_tanque: 5,
    nome: 'Sensor Vacuo 01',
    modelo: 'MPX5700',
    protocolo: protocolosensor.I2C,
    tipo_sensor: tiposensor.VACUO,
    unidade_medida: 'kPa',
    status_sensor: statussensor.ATIVO,
    criado_em: new Date('2026-01-01T00:00:00.000Z'),
    atualizado_em: new Date('2026-01-01T00:00:00.000Z'),
    excluido_em: null,
    tanques: {
      id_tanque: 5,
      nome: 'Tanque A',
    },
    ...overrides,
  };
}

describe('ConfiguracoesSensoresService', () => {
  let prisma: PrismaMock;
  let service: ConfiguracoesSensoresService;

  beforeEach(() => {
    prisma = {
      $transaction: asyncMock(),
      sensores: {
        findMany: asyncMock(),
        count: asyncMock(),
        findFirst: asyncMock(),
        findUnique: asyncMock(),
        create: asyncMock(),
        update: asyncMock(),
      },
      tanques: {
        findUnique: asyncMock(),
      },
    };
    service = new ConfiguracoesSensoresService(
      prisma as unknown as PrismaService,
    );
  });

  it('findAll retorna lista paginada e aplica filtros seguros', async () => {
    prisma.$transaction.mockResolvedValue([[makeSensorRecord()], 1]);

    const result = await service.findAll({
      page: 1,
      limit: 10,
      status_sensor: statussensor.ATIVO,
      tipo_sensor: tiposensor.VACUO,
      order_by: 'nome',
      order_direction: 'asc',
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      total_pages: 1,
    });
  });

  it('findOne retorna NotFoundException quando sensor nao existe', async () => {
    prisma.sensores.findFirst.mockResolvedValue(null);

    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create rejeita duplicidade de nome', async () => {
    prisma.sensores.findUnique.mockResolvedValue({ id_sensor: 1 });

    await expect(
      service.create({
        nome: 'Sensor Vacuo 01',
        modelo: 'MPX5700',
        protocolo: protocolosensor.I2C,
        unidade_medida: 'kPa',
        status_sensor: statussensor.ATIVO,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update rejeita PATCH vazio', async () => {
    prisma.sensores.findFirst.mockResolvedValue(makeSensorRecord());

    await expect(service.update(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('ativar e desativar atualizam status_sensor', async () => {
    prisma.sensores.findFirst.mockResolvedValue(makeSensorRecord());
    prisma.sensores.update.mockResolvedValue(makeSensorRecord());

    await service.ativar(1);
    await service.desativar(1);

    expect(prisma.sensores.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status_sensor: statussensor.ATIVO }),
      }),
    );
    expect(prisma.sensores.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ status_sensor: statussensor.INATIVO }),
      }),
    );
  });

  it('findSensoresByTanque valida tanque e retorna opcoes com id_sensor', async () => {
    prisma.tanques.findUnique.mockResolvedValue({ id_tanque: 5 });
    prisma.sensores.findMany.mockResolvedValue([makeSensorRecord()]);

    const result = await service.findSensoresByTanque(5, {});

    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id_sensor: 1,
          id_tanque: 5,
          label: 'Sensor Vacuo 01 - MPX5700',
        }),
      ],
      total: 1,
    });
  });

  it('findSensoresByTanque retorna NotFoundException para tanque inexistente', async () => {
    prisma.tanques.findUnique.mockResolvedValue(null);

    await expect(service.findSensoresByTanque(99, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
