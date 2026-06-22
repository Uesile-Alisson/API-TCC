import { Injectable } from '@nestjs/common';
import {
  DEFAULT_GRAFICO_VACUO_INTERVALO,
  GRAFICO_VACUO_DEFAULT_LIMIT,
  GRAFICO_VACUO_MAX_LIMIT,
} from '../constants';
import type { LeituraChartPoint, LeituraChartResponse } from '../interfaces';

type DecimalLike = {
  toNumber?: () => number;
  toString?: () => string;
};

interface GraficoVacuoLeituraRaw {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  valor_vacuo: unknown;
  leitura_em: Date;
}

interface GraficoVacuoResponseInput {
  id_processo: number;
  id_processo_tanque_sensor?: number | null;
  vacuo_alvo?: unknown;
  leituras: GraficoVacuoLeituraRaw[];
  intervalo?: string | null;
  limit?: number;
}

@Injectable()
export class GraficoVacuoMapper {
  toChartPoint(leitura: GraficoVacuoLeituraRaw): LeituraChartPoint {
    return {
      timestamp: leitura.leitura_em,
      valor_vacuo: this.toNumberOrNull(leitura.valor_vacuo),
      id_leitura_sensor: leitura.id_leitura_sensor,
      id_processo_tanque_sensor: leitura.id_processo_tanque_sensor,
    };
  }

  toChartResponse(input: GraficoVacuoResponseInput): LeituraChartResponse {
    const pontos = input.leituras.map((leitura) => this.toChartPoint(leitura));
    const limitedPontos = this.limitChartPoints(pontos, input.limit);

    return {
      id_processo: input.id_processo,
      id_processo_tanque_sensor: input.id_processo_tanque_sensor ?? null,
      vacuo_alvo: this.toNumberOrNull(input.vacuo_alvo),
      pontos: limitedPontos,
      total_pontos: limitedPontos.length,
      intervalo: input.intervalo ?? DEFAULT_GRAFICO_VACUO_INTERVALO,
      generated_at: new Date(),
    };
  }

  limitChartPoints(
    pontos: LeituraChartPoint[],
    limit?: number,
  ): LeituraChartPoint[] {
    const safeLimit = this.resolveLimit(limit);

    return pontos.slice(0, safeLimit);
  }

  private resolveLimit(limit?: number): number {
    if (!Number.isFinite(limit) || limit === undefined || limit <= 0) {
      return GRAFICO_VACUO_DEFAULT_LIMIT;
    }

    return Math.min(limit, GRAFICO_VACUO_MAX_LIMIT);
  }

  private toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      return this.stringToNumber(value);
    }

    if (!this.isDecimalLike(value)) {
      return null;
    }

    if (typeof value.toNumber === 'function') {
      try {
        const parsed = value.toNumber();

        return Number.isFinite(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }

    if (typeof value.toString === 'function') {
      try {
        return this.stringToNumber(value.toString());
      } catch {
        return null;
      }
    }

    return null;
  }

  private isDecimalLike(value: unknown): value is DecimalLike {
    return typeof value === 'object' && value !== null;
  }

  private stringToNumber(value: string): number | null {
    const normalized = value.trim();

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : null;
  }
}
