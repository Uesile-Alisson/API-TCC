import { Injectable } from '@nestjs/common';
import type { Prisma, statustanqueprocesso } from '@prisma/client';
import type { HistoricoTanqueSummary } from '../interfaces';

type DecimalCompatible = Prisma.Decimal | number | string | null | undefined;

interface HistoricoTanqueSummaryRaw {
  id_processo_tanque: number;
  id_tanque: number;
  tanques?: {
    id_tanque: number;
    nome: string;
  } | null;
  status_tanque_processo: statustanqueprocesso;
  vacuo_alvo: DecimalCompatible;
  vacuo_inicial: DecimalCompatible;
  vacuo_final: DecimalCompatible;
  vacuo_medio: DecimalCompatible;
  eficiencia: DecimalCompatible;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  _count?: {
    processostanquessensores?: number;
    alarmes?: number;
  };
  quantidade_leituras?: number;
  total_alarmes?: number;
  total_alarmes_criticos?: number;
}

@Injectable()
export class HistoricoTanqueMapper {
  toSummary(raw: HistoricoTanqueSummaryRaw): HistoricoTanqueSummary {
    return {
      id_processo_tanque: raw.id_processo_tanque,
      id_tanque: raw.id_tanque,
      nome_tanque: raw.tanques?.nome ?? 'Tanque não identificado',
      status_tanque_processo: raw.status_tanque_processo,
      vacuo_alvo: this.decimalToNumber(raw.vacuo_alvo) ?? 0,
      vacuo_inicial: this.decimalToNumber(raw.vacuo_inicial),
      vacuo_final: this.decimalToNumber(raw.vacuo_final),
      vacuo_medio: this.decimalToNumber(raw.vacuo_medio),
      eficiencia: this.decimalToNumber(raw.eficiencia),
      iniciado_em: raw.iniciado_em,
      finalizado_em: raw.finalizado_em,
      quantidade_sensores: this.toCount(raw._count?.processostanquessensores),
      quantidade_leituras: this.toCount(raw.quantidade_leituras),
      total_alarmes: this.toCount(raw.total_alarmes ?? raw._count?.alarmes),
      total_alarmes_criticos: this.toCount(raw.total_alarmes_criticos),
    };
  }

  toSummaryList(raw: HistoricoTanqueSummaryRaw[]): HistoricoTanqueSummary[] {
    return raw.map((item) => this.toSummary(item));
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
