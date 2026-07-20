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
    dto.tempo_estabilizacao_vacuo_segundos !== undefined ||
    dto.estabilizacao_cobertura_minima_percentual !== undefined ||
    dto.intervalo_leitura_esperado_ms !== undefined ||
    dto.timeout_leitura_sensor_ms !== undefined ||
    dto.tempo_retencao_vacuo_segundos !== undefined ||
    dto.perda_vacuo_maxima_retencao !== undefined ||
    dto.limite_seguranca_vacuo !== undefined ||
    dto.vacuo_padrao !== undefined ||
    dto.quantidade_maxima_tanques !== undefined ||
    dto.status_geral_sistema !== undefined ||
    dto.versao_sistema !== undefined ||
    dto.tolerancia_vacuo_percentual !== undefined ||
    dto.estagnacao_janela_segundos !== undefined ||
    dto.estagnacao_variacao_minima !== undefined ||
    dto.estagnacao_leituras_minimas !== undefined ||
    dto.estagnacao_janelas_consecutivas !== undefined ||
    dto.estagnacao_tempo_minimo_bomba_principal_segundos !== undefined ||
    dto.estagnacao_tempo_maximo_sem_progresso_segundos !== undefined ||
    dto.estagnacao_fator_minimo_proximidade_alvo !== undefined ||
    dto.auxilio_janela_avaliacao_segundos !== undefined ||
    dto.auxilio_melhoria_minima !== undefined ||
    dto.auxilio_timeout_segundos !== undefined
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
  if (dto.tempo_estabilizacao_vacuo_segundos !== undefined) {
    data.tempo_estabilizacao_vacuo_segundos =
      dto.tempo_estabilizacao_vacuo_segundos;
  }
  if (dto.estabilizacao_cobertura_minima_percentual !== undefined) {
    data.estabilizacao_cobertura_minima_percentual =
      dto.estabilizacao_cobertura_minima_percentual;
  }
  if (dto.intervalo_leitura_esperado_ms !== undefined) {
    data.intervalo_leitura_esperado_ms = dto.intervalo_leitura_esperado_ms;
  }
  if (dto.timeout_leitura_sensor_ms !== undefined) {
    data.timeout_leitura_sensor_ms = dto.timeout_leitura_sensor_ms;
  }
  if (dto.tempo_retencao_vacuo_segundos !== undefined) {
    data.tempo_retencao_vacuo_segundos = dto.tempo_retencao_vacuo_segundos;
  }
  if (dto.perda_vacuo_maxima_retencao !== undefined) {
    data.perda_vacuo_maxima_retencao = dto.perda_vacuo_maxima_retencao;
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
  if (dto.estagnacao_janela_segundos !== undefined) {
    data.estagnacao_janela_segundos = dto.estagnacao_janela_segundos;
  }
  if (dto.estagnacao_variacao_minima !== undefined) {
    data.estagnacao_variacao_minima = dto.estagnacao_variacao_minima;
  }
  if (dto.estagnacao_leituras_minimas !== undefined) {
    data.estagnacao_leituras_minimas = dto.estagnacao_leituras_minimas;
  }
  if (dto.estagnacao_janelas_consecutivas !== undefined) {
    data.estagnacao_janelas_consecutivas = dto.estagnacao_janelas_consecutivas;
  }
  if (dto.estagnacao_tempo_minimo_bomba_principal_segundos !== undefined) {
    data.estagnacao_tempo_minimo_bomba_principal_segundos =
      dto.estagnacao_tempo_minimo_bomba_principal_segundos;
  }
  if (dto.estagnacao_tempo_maximo_sem_progresso_segundos !== undefined) {
    data.estagnacao_tempo_maximo_sem_progresso_segundos =
      dto.estagnacao_tempo_maximo_sem_progresso_segundos;
  }
  if (dto.estagnacao_fator_minimo_proximidade_alvo !== undefined) {
    data.estagnacao_fator_minimo_proximidade_alvo =
      dto.estagnacao_fator_minimo_proximidade_alvo;
  }
  if (dto.auxilio_janela_avaliacao_segundos !== undefined) {
    data.auxilio_janela_avaliacao_segundos =
      dto.auxilio_janela_avaliacao_segundos;
  }
  if (dto.auxilio_melhoria_minima !== undefined) {
    data.auxilio_melhoria_minima = dto.auxilio_melhoria_minima;
  }
  if (dto.auxilio_timeout_segundos !== undefined) {
    data.auxilio_timeout_segundos = dto.auxilio_timeout_segundos;
  }

  return data;
}

export function validateConfiguracaoEncerramento(
  dto: UpdateConfiguracoesSistemaDto,
  current: {
    intervalo_leitura_esperado_ms: number;
    timeout_leitura_sensor_ms: number;
  },
): void {
  const intervalo =
    dto.intervalo_leitura_esperado_ms ?? current.intervalo_leitura_esperado_ms;
  const timeout =
    dto.timeout_leitura_sensor_ms ?? current.timeout_leitura_sensor_ms;

  if (timeout < intervalo) {
    throw new BadRequestException(
      'timeout_leitura_sensor_ms deve ser maior ou igual ao intervalo_leitura_esperado_ms.',
    );
  }
}
