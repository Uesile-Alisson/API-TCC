import { Prisma } from '@prisma/client';
import { BombaConfiguracaoResponseDto } from './dto/bomba-configuracao-response.dto';

export const bombaConfiguracaoSelect = {
  id_bomba: true,
  id_configuracao_sistema: true,
  id_usuario_alteracao: true,
  nome: true,
  tipo_bomba: true,
  status_padrao: true,
  entrada_por_pressao: true,
  entrada_por_tempo: true,
  encerramento_automatico: true,
  criado_em: true,
  atualizado_em: true,
} satisfies Prisma.bombasSelect;

export type BombaConfiguracaoRecord = Prisma.bombasGetPayload<{
  select: typeof bombaConfiguracaoSelect;
}>;

export class ConfiguracoesBombasMapper {
  static toResponse(
    record: BombaConfiguracaoRecord,
  ): BombaConfiguracaoResponseDto {
    return {
      id_bomba: record.id_bomba,
      id_configuracao_sistema: record.id_configuracao_sistema,
      id_usuario_alteracao: record.id_usuario_alteracao ?? null,
      nome: record.nome,
      tipo_bomba: record.tipo_bomba,
      status_padrao: record.status_padrao,
      entrada_por_pressao: record.entrada_por_pressao,
      entrada_por_tempo: record.entrada_por_tempo,
      encerramento_automatico: record.encerramento_automatico,
      criado_em: record.criado_em,
      atualizado_em: record.atualizado_em,
    };
  }
}
