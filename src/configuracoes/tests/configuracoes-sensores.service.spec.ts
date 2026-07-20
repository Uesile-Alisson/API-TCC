import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  Prisma,
  protocolosensor,
  statussensor,
  statusintegridadesensor,
  tiposensor,
} from '@prisma/client';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
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
  alarmes: {
    updateMany: ReturnType<typeof asyncMock>;
  };
};

type OperationalInterlockMock = {
  executeProtectedEquipmentMutation: ReturnType<typeof asyncMock>;
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
  status_integridade: statusintegridadesensor;
  fator_calibracao: Prisma.Decimal;
  offset_calibracao: Prisma.Decimal;
  calibrado_em: Date | null;
  calibracao_valida_ate: Date | null;
  liberado_em: Date | null;
  modo_calibracao_ativo: boolean;
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
    status_integridade: statusintegridadesensor.VALIDO,
    fator_calibracao: new Prisma.Decimal(1),
    offset_calibracao: new Prisma.Decimal(0),
    calibrado_em: new Date('2026-01-01T00:00:00.000Z'),
    calibracao_valida_ate: new Date('2027-01-01T00:00:00.000Z'),
    liberado_em: new Date('2026-01-01T00:00:00.000Z'),
    modo_calibracao_ativo: false,
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
  let operationalInterlock: OperationalInterlockMock;
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
      alarmes: {
        updateMany: asyncMock(),
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
    service = new ConfiguracoesSensoresService(
      prisma as unknown as PrismaService,
      operationalInterlock as unknown as MqttConfigService,
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

    await service.ativar(1, { id_usuario: 7 });
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
    expect(
      operationalInterlock.executeProtectedEquipmentMutation,
    ).toHaveBeenNthCalledWith(1, 'ACTIVATE_SENSOR', expect.any(Function));
    expect(
      operationalInterlock.executeProtectedEquipmentMutation,
    ).toHaveBeenNthCalledWith(2, 'DEACTIVATE_SENSOR', expect.any(Function));
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

  it('inicia calibracao pelo intertravamento central e mantem sensor inativo', async () => {
    prisma.sensores.findFirst.mockResolvedValue(makeSensorRecord());
    prisma.sensores.update.mockResolvedValue(
      makeSensorRecord({
        status_sensor: statussensor.INATIVO,
        status_integridade: statusintegridadesensor.PENDENTE_CALIBRACAO,
        modo_calibracao_ativo: true,
      }),
    );

    const result = await service.iniciarCalibracao(1, { id_usuario: 7 });

    expect(result.status_sensor).toBe(statussensor.INATIVO);
    expect(prisma.sensores.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          modo_calibracao_ativo: true,
          status_integridade: statusintegridadesensor.PENDENTE_CALIBRACAO,
          id_usuario_calibracao: 7,
        }),
      }),
    );
    expect(
      operationalInterlock.executeProtectedEquipmentMutation,
    ).toHaveBeenCalledWith('START_SENSOR_CALIBRATION', expect.any(Function));
  });

  it('calcula fator a partir da referencia e da leitura bruta sem ativar automaticamente', async () => {
    prisma.sensores.findFirst.mockResolvedValue({
      ...makeSensorRecord(),
      modo_calibracao_ativo: true,
      ultimo_valor_bruto: new Prisma.Decimal(-50),
    });
    prisma.sensores.update.mockResolvedValue(
      makeSensorRecord({
        status_sensor: statussensor.INATIVO,
        status_integridade: statusintegridadesensor.VALIDO,
        modo_calibracao_ativo: false,
      }),
    );

    await service.calibrar(
      1,
      {
        valor_referencia: -80,
        referencia: 'Padrao LAB-001',
      },
      { id_usuario: 7 },
    );

    expect(prisma.sensores.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fator_calibracao: new Prisma.Decimal('1.6'),
          status_sensor: statussensor.INATIVO,
          status_integridade: statusintegridadesensor.VALIDO,
          modo_calibracao_ativo: false,
        }),
      }),
    );
    expect(
      operationalInterlock.executeProtectedEquipmentMutation,
    ).toHaveBeenCalledWith('FINISH_SENSOR_CALIBRATION', expect.any(Function));
  });

  it('nao executa escrita quando o intertravamento operacional bloqueia', async () => {
    operationalInterlock.executeProtectedEquipmentMutation.mockRejectedValue(
      new ConflictException('Processo ativo.'),
    );

    await expect(service.desativar(1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.sensores.findFirst).not.toHaveBeenCalled();
    expect(prisma.sensores.update).not.toHaveBeenCalled();
  });

  it('findSensoresByTanque retorna NotFoundException para tanque inexistente', async () => {
    prisma.tanques.findUnique.mockResolvedValue(null);

    await expect(service.findSensoresByTanque(99, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
