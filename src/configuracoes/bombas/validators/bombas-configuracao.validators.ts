import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfiguracoesCurrentUser } from '../../common/configuracoes-current-user.interface';
import { normalizeSearch, validateOrderBy } from '../../common/query.helpers';
import {
  BOMBAS_ORDER_BY_FIELDS,
  BombasOrderBy,
  QueryBombasConfiguracaoDto,
} from '../dto/query-bombas-configuracao.dto';
import { CreateBombaConfiguracaoDto } from '../dto/create-bomba-configuracao.dto';
import { UpdateBombaConfiguracaoDto } from '../dto/update-bomba-configuracao.dto';

export function hasAtLeastOneBombaField(
  dto: UpdateBombaConfiguracaoDto,
): boolean {
  return (
    dto.nome !== undefined ||
    dto.tipo_bomba !== undefined ||
    dto.status_padrao !== undefined ||
    dto.entrada_por_pressao !== undefined ||
    dto.entrada_por_tempo !== undefined ||
    dto.encerramento_automatico !== undefined
  );
}

export function buildBombaCreateData(
  dto: CreateBombaConfiguracaoDto,
  id_configuracao_sistema: number,
  currentUser: ConfiguracoesCurrentUser,
): Prisma.bombasUncheckedCreateInput {
  return {
    id_configuracao_sistema,
    id_usuario_alteracao: currentUser.id_usuario,
    nome: dto.nome.trim(),
    tipo_bomba: dto.tipo_bomba,
    status_padrao: dto.status_padrao,
    entrada_por_pressao: dto.entrada_por_pressao ?? false,
    entrada_por_tempo: dto.entrada_por_tempo ?? false,
    encerramento_automatico: dto.encerramento_automatico ?? true,
    atualizado_em: new Date(),
  };
}

export function buildBombaUpdateData(
  dto: UpdateBombaConfiguracaoDto,
  currentUser: ConfiguracoesCurrentUser,
): Prisma.bombasUncheckedUpdateInput {
  if (!hasAtLeastOneBombaField(dto)) {
    throw new BadRequestException(
      'Informe ao menos um campo valido para atualizar.',
    );
  }

  const data: Prisma.bombasUncheckedUpdateInput = {
    id_usuario_alteracao: currentUser.id_usuario,
    atualizado_em: new Date(),
  };

  if (dto.nome !== undefined) {
    data.nome = dto.nome.trim();
  }
  if (dto.tipo_bomba !== undefined) {
    data.tipo_bomba = dto.tipo_bomba;
  }
  if (dto.status_padrao !== undefined) {
    data.status_padrao = dto.status_padrao;
  }
  if (dto.entrada_por_pressao !== undefined) {
    data.entrada_por_pressao = dto.entrada_por_pressao;
  }
  if (dto.entrada_por_tempo !== undefined) {
    data.entrada_por_tempo = dto.entrada_por_tempo;
  }
  if (dto.encerramento_automatico !== undefined) {
    data.encerramento_automatico = dto.encerramento_automatico;
  }

  return data;
}

export function validateBombaOrderBy(orderBy?: BombasOrderBy) {
  return validateOrderBy(orderBy, BOMBAS_ORDER_BY_FIELDS, 'bombas') ?? 'nome';
}

export function buildBombaWhere(
  query: QueryBombasConfiguracaoDto,
): Prisma.bombasWhereInput {
  const busca = normalizeSearch(query.busca);
  const where: Prisma.bombasWhereInput = {};

  if (busca) {
    where.nome = {
      contains: busca,
      mode: 'insensitive',
    };
  }

  if (query.status_padrao !== undefined) {
    where.status_padrao = query.status_padrao;
  }

  if (query.tipo_bomba !== undefined) {
    where.tipo_bomba = query.tipo_bomba;
  }

  return where;
}
