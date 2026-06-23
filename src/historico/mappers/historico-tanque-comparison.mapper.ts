import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  HistoricoTanqueComparisonResponse,
  HistoricoTanqueRankingItem,
} from '../interfaces';

type DecimalCompatible = Prisma.Decimal | number | string | null | undefined;

interface HistoricoTanqueRankingItemRaw {
  id_tanque: number;
  nome_tanque: string;
  total_processos: number;
  total_concluidos: number;
  total_falhas: number;
  eficiencia_media: DecimalCompatible;
  tempo_execucao_medio: DecimalCompatible;
  vacuo_medio: DecimalCompatible;
  total_alarmes: number;
  total_alarmes_criticos: number;
}

@Injectable()
export class HistoricoTanqueComparisonMapper {
  toRankingItem(
    raw: HistoricoTanqueRankingItemRaw,
  ): HistoricoTanqueRankingItem {
    return {
      id_tanque: raw.id_tanque,
      nome_tanque: raw.nome_tanque,
      total_processos: this.toCount(raw.total_processos),
      total_concluidos: this.toCount(raw.total_concluidos),
      total_falhas: this.toCount(raw.total_falhas),
      eficiencia_media: this.decimalToNumber(raw.eficiencia_media),
      tempo_execucao_medio: this.decimalToNumber(raw.tempo_execucao_medio),
      vacuo_medio: this.decimalToNumber(raw.vacuo_medio),
      total_alarmes: this.toCount(raw.total_alarmes),
      total_alarmes_criticos: this.toCount(raw.total_alarmes_criticos),
    };
  }

  toRankingList(
    raw: HistoricoTanqueRankingItemRaw[],
  ): HistoricoTanqueRankingItem[] {
    return raw.map((item) => this.toRankingItem(item));
  }

  toResponse(
    raw: HistoricoTanqueRankingItemRaw[],
  ): HistoricoTanqueComparisonResponse {
    return {
      data: this.toRankingList(raw),
    };
  }

  private decimalToNumber(value: DecimalCompatible): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      return this.stringToNumber(value);
    }

    return this.stringToNumber(value.toString());
  }

  private stringToNumber(value: string): number | null {
    const parsed = Number(value.trim());

    return Number.isFinite(parsed) ? parsed : null;
  }

  private toCount(value: number | null | undefined): number {
    return Number.isFinite(value) && value !== null && value !== undefined
      ? Math.max(0, Math.trunc(value))
      : 0;
  }
}
