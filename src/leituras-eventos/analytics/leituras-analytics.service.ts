import { Injectable } from '@nestjs/common';
import type {
  LeituraAnalyticsInput,
  LeituraValorNormalizado,
  LeiturasAnalyticsResult,
  LeiturasPeriodoAnalise,
  LeiturasStats,
} from './leituras-analytics.types';

type NumericLike = {
  toNumber?: () => number;
  toString?: () => string;
};

@Injectable()
export class LeiturasAnalyticsService {
  normalizeLeitura(leitura: LeituraAnalyticsInput): LeituraValorNormalizado {
    return {
      id_leitura_sensor: leitura.id_leitura_sensor,
      id_processo_tanque_sensor: leitura.id_processo_tanque_sensor,
      valor_vacuo: this.toNumberOrNull(leitura.valor_vacuo),
      leitura_em: leitura.leitura_em,
      recebido_em: leitura.recebido_em ?? null,
    };
  }

  normalizeLeituras(
    leituras: LeituraAnalyticsInput[],
  ): LeituraValorNormalizado[] {
    return leituras.map((leitura) => this.normalizeLeitura(leitura));
  }

  calculateTotalLeituras(leituras: LeituraAnalyticsInput[]): number {
    return leituras.length;
  }

  calculateTotalLeiturasValidas(leituras: LeituraAnalyticsInput[]): number {
    return this.getValoresValidos(leituras).length;
  }

  calculateTotalLeiturasInvalidas(leituras: LeituraAnalyticsInput[]): number {
    return (
      this.calculateTotalLeituras(leituras) -
      this.calculateTotalLeiturasValidas(leituras)
    );
  }

  calculateVacuoMinimo(leituras: LeituraAnalyticsInput[]): number | null {
    const valoresValidos = this.getValoresValidos(leituras);

    return valoresValidos.length > 0 ? Math.min(...valoresValidos) : null;
  }

  calculateVacuoMaximo(leituras: LeituraAnalyticsInput[]): number | null {
    const valoresValidos = this.getValoresValidos(leituras);

    return valoresValidos.length > 0 ? Math.max(...valoresValidos) : null;
  }

  calculateVacuoMedio(leituras: LeituraAnalyticsInput[]): number | null {
    const valoresValidos = this.getValoresValidos(leituras);

    if (valoresValidos.length === 0) {
      return null;
    }

    const total = valoresValidos.reduce(
      (accumulator, value) => accumulator + value,
      0,
    );

    return this.roundMetric(total / valoresValidos.length);
  }

  calculatePrimeiraLeitura(
    leituras: LeituraAnalyticsInput[],
  ): LeituraValorNormalizado | null {
    const leiturasOrdenadas = this.sortByLeituraEm(
      this.normalizeLeituras(leituras),
    );

    return leiturasOrdenadas[0] ?? null;
  }

  calculateUltimaLeitura(
    leituras: LeituraAnalyticsInput[],
  ): LeituraValorNormalizado | null {
    const leiturasOrdenadas = this.sortByLeituraEm(
      this.normalizeLeituras(leituras),
    );

    return leiturasOrdenadas[leiturasOrdenadas.length - 1] ?? null;
  }

  calculateVariacaoVacuo(leituras: LeituraAnalyticsInput[]): number | null {
    const leiturasValidas = this.getLeiturasValidasOrdenadas(leituras);
    const primeiraLeituraValida = leiturasValidas[0] ?? null;
    const ultimaLeituraValida =
      leiturasValidas[leiturasValidas.length - 1] ?? null;

    if (!primeiraLeituraValida || !ultimaLeituraValida) {
      return null;
    }

    return this.roundMetric(
      ultimaLeituraValida.valor_vacuo - primeiraLeituraValida.valor_vacuo,
    );
  }

  calculatePeriodoAnalise(
    leituras: LeituraAnalyticsInput[],
  ): LeiturasPeriodoAnalise {
    const primeiraLeitura = this.calculatePrimeiraLeitura(leituras);
    const ultimaLeitura = this.calculateUltimaLeitura(leituras);

    if (!primeiraLeitura || !ultimaLeitura) {
      return {
        inicio: null,
        fim: null,
        duracao_ms: null,
        duracao_segundos: null,
        duracao_minutos: null,
      };
    }

    const duracaoMs =
      ultimaLeitura.leitura_em.getTime() - primeiraLeitura.leitura_em.getTime();
    const safeDuracaoMs = Number.isFinite(duracaoMs) ? duracaoMs : null;

    return {
      inicio: primeiraLeitura.leitura_em,
      fim: ultimaLeitura.leitura_em,
      duracao_ms: safeDuracaoMs,
      duracao_segundos: this.roundMetric(
        safeDuracaoMs === null ? null : safeDuracaoMs / 1000,
      ),
      duracao_minutos: this.roundMetric(
        safeDuracaoMs === null ? null : safeDuracaoMs / 60000,
      ),
    };
  }

  calculateStats(leituras: LeituraAnalyticsInput[]): LeiturasStats {
    const primeiraLeitura = this.calculatePrimeiraLeitura(leituras);
    const ultimaLeitura = this.calculateUltimaLeitura(leituras);
    const leiturasValidas = this.getLeiturasValidasOrdenadas(leituras);
    const primeiraLeituraValida = leiturasValidas[0] ?? null;
    const ultimaLeituraValida =
      leiturasValidas[leiturasValidas.length - 1] ?? null;

    return {
      total_leituras: this.calculateTotalLeituras(leituras),
      total_leituras_validas: leiturasValidas.length,
      total_leituras_invalidas: leituras.length - leiturasValidas.length,
      vacuo_minimo: this.calculateVacuoMinimo(leituras),
      vacuo_maximo: this.calculateVacuoMaximo(leituras),
      vacuo_medio: this.calculateVacuoMedio(leituras),
      primeira_leitura_em: primeiraLeitura?.leitura_em ?? null,
      ultima_leitura_em: ultimaLeitura?.leitura_em ?? null,
      primeiro_valor_vacuo: primeiraLeituraValida?.valor_vacuo ?? null,
      ultimo_valor_vacuo: ultimaLeituraValida?.valor_vacuo ?? null,
      variacao_vacuo: this.calculateVariacaoVacuo(leituras),
    };
  }

  calculateAnalytics(
    leituras: LeituraAnalyticsInput[],
  ): LeiturasAnalyticsResult {
    return {
      stats: this.calculateStats(leituras),
      periodo: this.calculatePeriodoAnalise(leituras),
      generated_at: new Date(),
    };
  }

  roundMetric(value: number | null | undefined, decimals = 2): number | null {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }

    const safeDecimals = Number.isFinite(decimals)
      ? Math.min(Math.max(Math.trunc(decimals), 0), 6)
      : 2;
    const factor = 10 ** safeDecimals;

    return Math.round(value * factor) / factor;
  }

  toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      return this.stringToNumber(value);
    }

    if (!this.isNumericLike(value)) {
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

  private getValoresValidos(leituras: LeituraAnalyticsInput[]): number[] {
    return this.normalizeLeituras(leituras)
      .map((leitura) => leitura.valor_vacuo)
      .filter((value): value is number => value !== null);
  }

  private getLeiturasValidasOrdenadas(
    leituras: LeituraAnalyticsInput[],
  ): Array<LeituraValorNormalizado & { valor_vacuo: number }> {
    return this.sortByLeituraEm(this.normalizeLeituras(leituras)).filter(
      (leitura): leitura is LeituraValorNormalizado & { valor_vacuo: number } =>
        leitura.valor_vacuo !== null,
    );
  }

  private sortByLeituraEm(
    leituras: LeituraValorNormalizado[],
  ): LeituraValorNormalizado[] {
    return [...leituras].sort(
      (current, next) =>
        current.leitura_em.getTime() - next.leitura_em.getTime(),
    );
  }

  private isNumericLike(value: unknown): value is NumericLike {
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
