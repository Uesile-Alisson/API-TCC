import { Injectable } from '@nestjs/common';
import type { formatorelatorio, tiporelatorio } from '@prisma/client';
import type { HistoricoRelatorioSummary } from '../interfaces';

interface HistoricoRelatorioSummaryRaw {
  id_relatorio: number;
  tipo_relatorio: tiporelatorio;
  formato_relatorio: formatorelatorio;
  titulo: string;
  descricao: string | null;
  nome_arquivo: string;
  tamanho_bytes: bigint | number | null;
  gerado_em: Date;
}

@Injectable()
export class HistoricoRelatorioMapper {
  toSummary(raw: HistoricoRelatorioSummaryRaw): HistoricoRelatorioSummary {
    return {
      id_relatorio: raw.id_relatorio,
      tipo_relatorio: raw.tipo_relatorio,
      formato_relatorio: raw.formato_relatorio,
      titulo: raw.titulo,
      descricao: raw.descricao,
      nome_arquivo: raw.nome_arquivo,
      tamanho_bytes: this.bigIntToNumber(raw.tamanho_bytes),
      gerado_em: raw.gerado_em,
    };
  }

  toSummaryList(
    raw: HistoricoRelatorioSummaryRaw[],
  ): HistoricoRelatorioSummary[] {
    return raw.map((item) => this.toSummary(item));
  }

  private bigIntToNumber(value: bigint | number | null): number | null {
    if (value === null) {
      return null;
    }

    const parsed = typeof value === 'bigint' ? Number(value) : value;

    return Number.isFinite(parsed) ? parsed : null;
  }
}
