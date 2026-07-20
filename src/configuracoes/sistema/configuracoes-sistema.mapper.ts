import { Prisma } from '@prisma/client';
import { ConfiguracoesSistemaResponseDto } from './dto/configuracoes-sistema-response.dto';

export const configuracoesSistemaSelect = {
  id_configuracao_sistema: true,
  id_usuario_alteracao: true,
  tempo_maximo_padrao: true,
  encerramento_automatico: true,
  tempo_estabilizacao_vacuo_segundos: true,
  estabilizacao_cobertura_minima_percentual: true,
  intervalo_leitura_esperado_ms: true,
  timeout_leitura_sensor_ms: true,
  tempo_retencao_vacuo_segundos: true,
  perda_vacuo_maxima_retencao: true,
  limite_seguranca_vacuo: true,
  vacuo_padrao: true,
  quantidade_maxima_tanques: true,
  status_geral_sistema: true,
  versao_sistema: true,
  tolerancia_vacuo_percentual: true,
  estagnacao_janela_segundos: true,
  estagnacao_variacao_minima: true,
  estagnacao_leituras_minimas: true,
  estagnacao_janelas_consecutivas: true,
  estagnacao_tempo_minimo_bomba_principal_segundos: true,
  estagnacao_tempo_maximo_sem_progresso_segundos: true,
  estagnacao_fator_minimo_proximidade_alvo: true,
  auxilio_janela_avaliacao_segundos: true,
  auxilio_melhoria_minima: true,
  auxilio_timeout_segundos: true,
  criado_em: true,
  atualizado_em: true,
} satisfies Prisma.configuracoessistemaSelect;

export type ConfiguracoesSistemaRecord = Prisma.configuracoessistemaGetPayload<{
  select: typeof configuracoesSistemaSelect;
}>;

export class ConfiguracoesSistemaMapper {
  static toResponse(
    config: ConfiguracoesSistemaRecord,
  ): ConfiguracoesSistemaResponseDto {
    return {
      id_configuracao_sistema: config.id_configuracao_sistema,
      id_usuario_alteracao: config.id_usuario_alteracao ?? null,
      tempo_maximo_padrao: config.tempo_maximo_padrao,
      encerramento_automatico: config.encerramento_automatico,
      tempo_estabilizacao_vacuo_segundos:
        config.tempo_estabilizacao_vacuo_segundos,
      estabilizacao_cobertura_minima_percentual:
        config.estabilizacao_cobertura_minima_percentual.toNumber(),
      intervalo_leitura_esperado_ms: config.intervalo_leitura_esperado_ms,
      timeout_leitura_sensor_ms: config.timeout_leitura_sensor_ms,
      tempo_retencao_vacuo_segundos: config.tempo_retencao_vacuo_segundos,
      perda_vacuo_maxima_retencao:
        config.perda_vacuo_maxima_retencao.toNumber(),
      limite_seguranca_vacuo: config.limite_seguranca_vacuo.toNumber(),
      vacuo_padrao: config.vacuo_padrao.toNumber(),
      quantidade_maxima_tanques: config.quantidade_maxima_tanques,
      status_geral_sistema: config.status_geral_sistema,
      versao_sistema: config.versao_sistema,
      tolerancia_vacuo_percentual:
        config.tolerancia_vacuo_percentual.toNumber(),
      estagnacao_janela_segundos: config.estagnacao_janela_segundos,
      estagnacao_variacao_minima: config.estagnacao_variacao_minima.toNumber(),
      estagnacao_leituras_minimas: config.estagnacao_leituras_minimas,
      estagnacao_janelas_consecutivas: config.estagnacao_janelas_consecutivas,
      estagnacao_tempo_minimo_bomba_principal_segundos:
        config.estagnacao_tempo_minimo_bomba_principal_segundos ?? 30,
      estagnacao_tempo_maximo_sem_progresso_segundos:
        config.estagnacao_tempo_maximo_sem_progresso_segundos ?? 180,
      estagnacao_fator_minimo_proximidade_alvo:
        config.estagnacao_fator_minimo_proximidade_alvo?.toNumber() ?? 0.35,
      auxilio_janela_avaliacao_segundos:
        config.auxilio_janela_avaliacao_segundos ?? 30,
      auxilio_melhoria_minima: config.auxilio_melhoria_minima?.toNumber() ?? 1,
      auxilio_timeout_segundos: config.auxilio_timeout_segundos ?? 180,
      criado_em: config.criado_em,
      atualizado_em: config.atualizado_em,
    };
  }
}
