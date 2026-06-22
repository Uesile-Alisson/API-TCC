import { BadRequestException, Injectable } from '@nestjs/common';

import {
  GraficoVacuoQueryDto,
  ListEventosQueryDto,
  ListLeiturasQueryDto,
  ProcessoTimelineQueryDto,
} from '../dto';
import {
  GRAFICO_VACUO_INTERVALOS,
  GRAFICO_VACUO_MAX_LIMIT,
  LEITURAS_EVENTOS_MESSAGES,
  TIMELINE_MAX_LIMIT,
} from '../constants';

@Injectable()
export class LeiturasEventosQueryValidator {
  validateDateRange(start?: Date | null, end?: Date | null): void {
    if (!this.isValidDate(start) || !this.isValidDate(end)) {
      return;
    }

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException(
        LEITURAS_EVENTOS_MESSAGES.INVALID_DATE_RANGE,
      );
    }
  }

  validateValueRange(min?: number | null, max?: number | null): void {
    if (!this.isFiniteNumber(min) || !this.isFiniteNumber(max)) {
      return;
    }

    if (min > max) {
      throw new BadRequestException(
        LEITURAS_EVENTOS_MESSAGES.INVALID_VALUE_RANGE,
      );
    }
  }

  validateListLeiturasQuery(query: ListLeiturasQueryDto): void {
    this.validateDateRange(query.leitura_de, query.leitura_ate);
    this.validateDateRange(query.recebido_de, query.recebido_ate);
    this.validateValueRange(query.valor_minimo, query.valor_maximo);
  }

  validateListEventosQuery(query: ListEventosQueryDto): void {
    this.validateDateRange(query.ocorrido_de, query.ocorrido_ate);
  }

  validateGraficoVacuoQuery(query: GraficoVacuoQueryDto): void {
    this.validateDateRange(query.leitura_de, query.leitura_ate);

    if (
      this.isFiniteNumber(query.limit) &&
      query.limit > GRAFICO_VACUO_MAX_LIMIT
    ) {
      throw new BadRequestException(
        LEITURAS_EVENTOS_MESSAGES.INVALID_CHART_FILTER,
      );
    }

    if (
      query.intervalo !== undefined &&
      !GRAFICO_VACUO_INTERVALOS.some(
        (intervalo) => intervalo === query.intervalo,
      )
    ) {
      throw new BadRequestException(
        LEITURAS_EVENTOS_MESSAGES.INVALID_CHART_FILTER,
      );
    }
  }

  validateTimelineQuery(query: ProcessoTimelineQueryDto): void {
    this.validateDateRange(query.ocorrido_de, query.ocorrido_ate);

    if (this.isFiniteNumber(query.limit) && query.limit > TIMELINE_MAX_LIMIT) {
      throw new BadRequestException(
        LEITURAS_EVENTOS_MESSAGES.INVALID_TIMELINE_FILTER,
      );
    }

    if (query.incluir_leituras === false && query.incluir_eventos === false) {
      throw new BadRequestException(
        LEITURAS_EVENTOS_MESSAGES.INVALID_TIMELINE_FILTER,
      );
    }
  }

  isValidDate(value: unknown): value is Date {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
}
