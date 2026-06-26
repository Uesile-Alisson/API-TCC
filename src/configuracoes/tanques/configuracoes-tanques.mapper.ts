import { Prisma } from '@prisma/client';
import { TanqueConfiguracaoResponseDto } from './dto/tanque-configuracao-response.dto';

export const tanqueConfiguracaoSelect = {
  id_tanque: true,
  nome: true,
  volume: true,
  unidade_volume: true,
  vacuo_padrao: true,
  status_tanque: true,
  criado_em: true,
  atualizado_em: true,
} satisfies Prisma.tanquesSelect;

export type TanqueConfiguracaoRecord = Prisma.tanquesGetPayload<{
  select: typeof tanqueConfiguracaoSelect;
}>;

export class ConfiguracoesTanquesMapper {
  static toResponse(
    record: TanqueConfiguracaoRecord,
  ): TanqueConfiguracaoResponseDto {
    return {
      id_tanque: record.id_tanque,
      nome: record.nome,
      volume: record.volume.toNumber(),
      unidade_volume: record.unidade_volume,
      vacuo_padrao: record.vacuo_padrao.toNumber(),
      status_tanque: record.status_tanque,
      criado_em: record.criado_em,
      atualizado_em: record.atualizado_em,
    };
  }
}
