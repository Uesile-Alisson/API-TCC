import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeSearch, validateOrderBy } from '../../common/query.helpers';
import { CreateTanqueConfiguracaoDto } from '../dto/create-tanque-configuracao.dto';
import {
  QueryTanquesConfiguracaoDto,
  TANQUES_ORDER_BY_FIELDS,
  TanquesOrderBy,
} from '../dto/query-tanques-configuracao.dto';
import { UpdateTanqueConfiguracaoDto } from '../dto/update-tanque-configuracao.dto';

export function hasAtLeastOneTanqueField(
  dto: UpdateTanqueConfiguracaoDto,
): boolean {
  return (
    dto.nome !== undefined ||
    dto.volume !== undefined ||
    dto.unidade_volume !== undefined ||
    dto.vacuo_padrao !== undefined ||
    dto.status_tanque !== undefined
  );
}

export function buildTanqueCreateData(
  dto: CreateTanqueConfiguracaoDto,
): Prisma.tanquesUncheckedCreateInput {
  return {
    nome: dto.nome.trim(),
    volume: dto.volume,
    unidade_volume: dto.unidade_volume.trim(),
    vacuo_padrao: dto.vacuo_padrao,
    status_tanque: dto.status_tanque,
    atualizado_em: new Date(),
  };
}

export function buildTanqueUpdateData(
  dto: UpdateTanqueConfiguracaoDto,
): Prisma.tanquesUncheckedUpdateInput {
  if (!hasAtLeastOneTanqueField(dto)) {
    throw new BadRequestException(
      'Informe ao menos um campo valido para atualizar.',
    );
  }

  const data: Prisma.tanquesUncheckedUpdateInput = {
    atualizado_em: new Date(),
  };

  if (dto.nome !== undefined) {
    data.nome = dto.nome.trim();
  }
  if (dto.volume !== undefined) {
    data.volume = dto.volume;
  }
  if (dto.unidade_volume !== undefined) {
    data.unidade_volume = dto.unidade_volume.trim();
  }
  if (dto.vacuo_padrao !== undefined) {
    data.vacuo_padrao = dto.vacuo_padrao;
  }
  if (dto.status_tanque !== undefined) {
    data.status_tanque = dto.status_tanque;
  }

  return data;
}

export function validateTanqueOrderBy(orderBy?: TanquesOrderBy) {
  return validateOrderBy(orderBy, TANQUES_ORDER_BY_FIELDS, 'tanques') ?? 'nome';
}

export function buildTanqueWhere(
  query: QueryTanquesConfiguracaoDto,
): Prisma.tanquesWhereInput {
  const busca = normalizeSearch(query.busca);
  const where: Prisma.tanquesWhereInput = {};

  if (busca) {
    where.nome = {
      contains: busca,
      mode: 'insensitive',
    };
  }

  if (query.status_tanque !== undefined) {
    where.status_tanque = query.status_tanque;
  }

  return where;
}
