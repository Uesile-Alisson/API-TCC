import { BadRequestException } from '@nestjs/common';
import { Prisma, statussensor, tiposensor } from '@prisma/client';
import { normalizeSearch, validateOrderBy } from '../../common/query.helpers';
import { CreateSensorConfiguracaoDto } from '../dto/create-sensor-configuracao.dto';
import {
  QuerySensoresConfiguracaoDto,
  SENSORES_ORDER_BY_FIELDS,
  SensoresOrderBy,
} from '../dto/query-sensores-configuracao.dto';
import { UpdateSensorConfiguracaoDto } from '../dto/update-sensor-configuracao.dto';

export function hasAtLeastOneSensorField(
  dto: UpdateSensorConfiguracaoDto,
): boolean {
  return (
    dto.nome !== undefined ||
    dto.modelo !== undefined ||
    dto.protocolo !== undefined ||
    dto.unidade_medida !== undefined ||
    dto.precisao !== undefined ||
    dto.status_sensor !== undefined ||
    dto.tipo_sensor !== undefined ||
    dto.fator_calibracao !== undefined
  );
}

export function buildSensorCreateData(
  dto: CreateSensorConfiguracaoDto,
): Prisma.sensoresUncheckedCreateInput {
  return {
    nome: dto.nome.trim(),
    modelo: dto.modelo.trim(),
    protocolo: dto.protocolo,
    unidade_medida: dto.unidade_medida.trim(),
    precisao: dto.precisao ?? null,
    status_sensor: dto.status_sensor,
    tipo_sensor: dto.tipo_sensor ?? tiposensor.VACUO,
    fator_calibracao: dto.fator_calibracao ?? null,
  };
}

export function buildSensorUpdateData(
  dto: UpdateSensorConfiguracaoDto,
): Prisma.sensoresUncheckedUpdateInput {
  if (!hasAtLeastOneSensorField(dto)) {
    throw new BadRequestException(
      'Informe ao menos um campo valido para atualizar.',
    );
  }

  const data: Prisma.sensoresUncheckedUpdateInput = {};

  if (dto.nome !== undefined) {
    data.nome = dto.nome.trim();
  }
  if (dto.modelo !== undefined) {
    data.modelo = dto.modelo.trim();
  }
  if (dto.protocolo !== undefined) {
    data.protocolo = dto.protocolo;
  }
  if (dto.unidade_medida !== undefined) {
    data.unidade_medida = dto.unidade_medida.trim();
  }
  if (dto.precisao !== undefined) {
    data.precisao = dto.precisao;
  }
  if (dto.status_sensor !== undefined) {
    data.status_sensor = dto.status_sensor;
  }
  if (dto.tipo_sensor !== undefined) {
    data.tipo_sensor = dto.tipo_sensor;
  }
  if (dto.fator_calibracao !== undefined) {
    data.fator_calibracao = dto.fator_calibracao;
  }

  return data;
}

export function validateSensorOrderBy(orderBy?: SensoresOrderBy) {
  return (
    validateOrderBy(orderBy, SENSORES_ORDER_BY_FIELDS, 'sensores') ?? 'nome'
  );
}

export function buildSensorWhere(
  query: QuerySensoresConfiguracaoDto,
): Prisma.sensoresWhereInput {
  const busca = normalizeSearch(query.busca);
  const where: Prisma.sensoresWhereInput = {
    excluido_em: null,
  };

  if (busca) {
    where.OR = [
      { nome: { contains: busca, mode: 'insensitive' } },
      { modelo: { contains: busca, mode: 'insensitive' } },
      { unidade_medida: { contains: busca, mode: 'insensitive' } },
    ];
  }

  if (query.status_sensor !== undefined) {
    where.status_sensor = query.status_sensor;
  }

  if (query.tipo_sensor !== undefined) {
    where.tipo_sensor = query.tipo_sensor;
  }

  if (query.id_tanque !== undefined) {
    where.sensoresacoplamentomangueiras = {
      id_tanque: query.id_tanque,
    };
  }

  return where;
}

export function buildSensoresPorTanqueWhere(
  query: QuerySensoresConfiguracaoDto,
): Prisma.sensoresWhereInput {
  return {
    ...buildSensorWhere({
      ...query,
      id_tanque: undefined,
      status_sensor: query.status_sensor ?? statussensor.ATIVO,
      tipo_sensor: query.tipo_sensor ?? tiposensor.VACUO,
    }),
  };
}
