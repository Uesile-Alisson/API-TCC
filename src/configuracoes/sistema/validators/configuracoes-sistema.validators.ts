import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfiguracoesCurrentUser } from '../../common/configuracoes-current-user.interface';
import { UpdateConfiguracoesSistemaDto } from '../dto/update-configuracoes-sistema.dto';

export function hasAtLeastOneConfiguracaoSistemaField(
  dto: UpdateConfiguracoesSistemaDto,
): boolean {
  return (
    dto.tempo_maximo_padrao !== undefined ||
    dto.encerramento_automatico !== undefined ||
    dto.limite_seguranca_vacuo !== undefined ||
    dto.vacuo_padrao !== undefined ||
    dto.quantidade_maxima_tanques !== undefined ||
    dto.status_geral_sistema !== undefined ||
    dto.versao_sistema !== undefined ||
    dto.tolerancia_vacuo_percentual !== undefined
  );
}

export function buildConfiguracoesSistemaUpdateData(
  dto: UpdateConfiguracoesSistemaDto,
  currentUser: ConfiguracoesCurrentUser,
): Prisma.configuracoessistemaUncheckedUpdateInput {
  if (!hasAtLeastOneConfiguracaoSistemaField(dto)) {
    throw new BadRequestException(
      'Informe ao menos um campo valido para atualizar.',
    );
  }

  const data: Prisma.configuracoessistemaUncheckedUpdateInput = {
    id_usuario_alteracao: currentUser.id_usuario,
    atualizado_em: new Date(),
  };

  if (dto.tempo_maximo_padrao !== undefined) {
    data.tempo_maximo_padrao = dto.tempo_maximo_padrao;
  }
  if (dto.encerramento_automatico !== undefined) {
    data.encerramento_automatico = dto.encerramento_automatico;
  }
  if (dto.limite_seguranca_vacuo !== undefined) {
    data.limite_seguranca_vacuo = dto.limite_seguranca_vacuo;
  }
  if (dto.vacuo_padrao !== undefined) {
    data.vacuo_padrao = dto.vacuo_padrao;
  }
  if (dto.quantidade_maxima_tanques !== undefined) {
    data.quantidade_maxima_tanques = dto.quantidade_maxima_tanques;
  }
  if (dto.status_geral_sistema !== undefined) {
    data.status_geral_sistema = dto.status_geral_sistema;
  }
  if (dto.versao_sistema !== undefined) {
    data.versao_sistema = dto.versao_sistema.trim();
  }
  if (dto.tolerancia_vacuo_percentual !== undefined) {
    data.tolerancia_vacuo_percentual = dto.tolerancia_vacuo_percentual;
  }

  return data;
}
