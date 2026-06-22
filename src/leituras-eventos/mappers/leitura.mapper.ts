import { Injectable } from '@nestjs/common';
import type {
  LeituraDetails,
  LeituraListResponse,
  LeituraResponse,
  PaginationMeta,
} from '../interfaces';

type DecimalLike = {
  toNumber?: () => number;
  toString?: () => string;
};

interface LeituraRaw {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  valor_vacuo: unknown;
  leitura_em: Date;
  recebido_em: Date;
}

interface LeituraDetailsRaw extends LeituraRaw {
  processo?: {
    id_processo: number;
    nome_processo: string | null;
    status_processo: string;
    iniciado_em: Date | null;
    finalizado_em: Date | null;
  } | null;
  processo_tanque?: {
    id_processo_tanque: number;
    id_tanque: number;
    nome_tanque: string | null;
    vacuo_alvo: unknown;
    vacuo_inicial: unknown;
    vacuo_final: unknown;
    vacuo_medio: unknown;
    status_tanque_processo: string;
  } | null;
  sensor?: {
    id_sensor: number;
    nome_sensor: string;
    modelo_sensor: string | null;
    unidade_medida: string | null;
    status_sensor: string;
  } | null;
}

@Injectable()
export class LeituraMapper {
  decimalToNumber(value: unknown): number | null {
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

  toResponse(leitura: LeituraRaw): LeituraResponse {
    return {
      id_leitura_sensor: leitura.id_leitura_sensor,
      id_processo_tanque_sensor: leitura.id_processo_tanque_sensor,
      valor_vacuo: this.decimalToNumber(leitura.valor_vacuo),
      leitura_em: leitura.leitura_em,
      recebido_em: leitura.recebido_em,
    };
  }

  toDetails(leitura: LeituraDetailsRaw): LeituraDetails {
    return {
      id_leitura_sensor: leitura.id_leitura_sensor,
      id_processo_tanque_sensor: leitura.id_processo_tanque_sensor,
      valor_vacuo: this.decimalToNumber(leitura.valor_vacuo),
      leitura_em: leitura.leitura_em,
      recebido_em: leitura.recebido_em,
      processo: leitura.processo
        ? {
            id_processo: leitura.processo.id_processo,
            nome_processo: leitura.processo.nome_processo,
            status_processo: leitura.processo.status_processo,
            iniciado_em: leitura.processo.iniciado_em,
            finalizado_em: leitura.processo.finalizado_em,
          }
        : null,
      processo_tanque: leitura.processo_tanque
        ? {
            id_processo_tanque: leitura.processo_tanque.id_processo_tanque,
            id_tanque: leitura.processo_tanque.id_tanque,
            nome_tanque: leitura.processo_tanque.nome_tanque,
            vacuo_alvo: this.decimalToNumber(
              leitura.processo_tanque.vacuo_alvo,
            ),
            vacuo_inicial: this.decimalToNumber(
              leitura.processo_tanque.vacuo_inicial,
            ),
            vacuo_final: this.decimalToNumber(
              leitura.processo_tanque.vacuo_final,
            ),
            vacuo_medio: this.decimalToNumber(
              leitura.processo_tanque.vacuo_medio,
            ),
            status_tanque_processo:
              leitura.processo_tanque.status_tanque_processo,
          }
        : null,
      sensor: leitura.sensor
        ? {
            id_sensor: leitura.sensor.id_sensor,
            nome_sensor: leitura.sensor.nome_sensor,
            modelo_sensor: leitura.sensor.modelo_sensor,
            unidade_medida: leitura.sensor.unidade_medida,
            status_sensor: leitura.sensor.status_sensor,
          }
        : null,
    };
  }

  toListResponse(
    leituras: LeituraRaw[],
    total: number,
    page: number,
    limit: number,
  ): LeituraListResponse {
    const meta = this.buildPaginationMeta(total, page, limit);

    return {
      data: leituras.map((leitura) => this.toResponse(leitura)),
      meta,
    };
  }

  private buildPaginationMeta(
    total: number,
    page: number,
    limit: number,
  ): PaginationMeta {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 1;
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
    const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeLimit);

    return {
      page: safePage,
      limit: safeLimit,
      total: safeTotal,
      total_pages: totalPages,
      has_next_page: safePage < totalPages,
      has_previous_page: safePage > 1,
    };
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
