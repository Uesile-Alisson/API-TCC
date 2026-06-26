import { Prisma } from '@prisma/client';
import { ConfiguracoesSistemaResponseDto } from './dto/configuracoes-sistema-response.dto';

export const configuracoesSistemaSelect = {
  id_configuracao_sistema: true,
  id_usuario_alteracao: true,
  tempo_maximo_padrao: true,
  encerramento_automatico: true,
  limite_seguranca_vacuo: true,
  vacuo_padrao: true,
  quantidade_maxima_tanques: true,
  status_geral_sistema: true,
  versao_sistema: true,
  tolerancia_vacuo_percentual: true,
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
      limite_seguranca_vacuo: config.limite_seguranca_vacuo.toNumber(),
      vacuo_padrao: config.vacuo_padrao.toNumber(),
      quantidade_maxima_tanques: config.quantidade_maxima_tanques,
      status_geral_sistema: config.status_geral_sistema,
      versao_sistema: config.versao_sistema,
      tolerancia_vacuo_percentual:
        config.tolerancia_vacuo_percentual.toNumber(),
      criado_em: config.criado_em,
      atualizado_em: config.atualizado_em,
    };
  }
}
