import { BadRequestException, Injectable } from '@nestjs/common';
import type { statusprocesso } from '@prisma/client';
import {
  HISTORICO_ALLOWED_DATE_FIELDS,
  HISTORICO_ALLOWED_FILTERS,
  HISTORICO_ALLOWED_ORDER_BY_FIELDS,
  HISTORICO_ALLOWED_ORDER_DIRECTIONS,
  HISTORICO_DASHBOARD_GROUPINGS,
  HISTORICO_DASHBOARD_MAX_RANKING_LIMIT,
  HISTORICO_GRAFICO_VACUO_MAX_LIMIT,
  HISTORICO_MAX_LIMIT,
  HISTORICO_MESSAGES,
  HISTORICO_PROCESS_STATUS,
} from '../constants';
import type {
  HistoricoDashboardQueryDto,
  HistoricoGraficoVacuoQueryDto,
  HistoricoProcessoAlarmesQueryDto,
  HistoricoProcessoEventosQueryDto,
  ListHistoricoProcessosQueryDto,
} from '../dto';

@Injectable()
export class HistoricoQueryValidator {
  validateListQuery(query: ListHistoricoProcessosQueryDto): void {
    this.validateUnknownFilters(query);
    this.validateDateRange(query.data_inicio, query.data_fim);
    this.validateHistoricalStatus(query.status_processo);
    this.validateDateField(query.campo_data);
    this.validateOrderBy(query.order_by);
    this.validateOrderDirection(query.order_direction);
    this.validatePagination(query.page, query.limit);
    this.validateEfficiencyRange(query.eficiencia_min, query.eficiencia_max);
    this.validateExecutionTimeRange(
      query.tempo_execucao_min,
      query.tempo_execucao_max,
    );
    this.validateNumericRange(
      query.vacuo_alvo_min,
      query.vacuo_alvo_max,
      HISTORICO_MESSAGES.INVALID_VACUUM_RANGE,
    );
    this.validateNumericRange(
      query.vacuo_final_min,
      query.vacuo_final_max,
      HISTORICO_MESSAGES.INVALID_VACUUM_RANGE,
    );
  }

  validateDashboardQuery(query: HistoricoDashboardQueryDto): void {
    this.validateDateRange(query.data_inicio, query.data_fim);
    this.validateHistoricalStatus(query.status_processo);
    this.validateDateField(query.campo_data);
    this.validateGrouping(query.agrupamento);
    this.validatePositiveId(query.id_tanque, 'id_tanque deve ser positivo.');

    if (
      this.isValidNumber(query.limite_rankings) &&
      (query.limite_rankings < 1 ||
        query.limite_rankings > HISTORICO_DASHBOARD_MAX_RANKING_LIMIT)
    ) {
      throw new BadRequestException(
        'limite_rankings deve estar dentro do limite permitido.',
      );
    }
  }

  validateVacuumChartQuery(query: HistoricoGraficoVacuoQueryDto): void {
    // A validação do caminho relacional das leituras pertence ao repository. Este validator apenas valida a query recebida.
    this.validateDateRange(query.data_inicio, query.data_fim);
    this.validatePositiveId(query.id_tanque, 'id_tanque deve ser positivo.');
    this.validatePositiveId(query.id_sensor, 'id_sensor deve ser positivo.');
    this.validateOrderDirection(query.order_direction);

    if (
      this.isValidNumber(query.limite_pontos) &&
      (query.limite_pontos < 1 ||
        query.limite_pontos > HISTORICO_GRAFICO_VACUO_MAX_LIMIT)
    ) {
      throw new BadRequestException(HISTORICO_MESSAGES.INVALID_LIMIT);
    }
  }

  validateProcessAlarmsQuery(query: HistoricoProcessoAlarmesQueryDto): void {
    this.validateDateRange(query.data_inicio, query.data_fim);
    this.validatePagination(query.page, query.limit);
    this.validateOrderDirection(query.order_direction);
  }

  validateProcessEventsQuery(query: HistoricoProcessoEventosQueryDto): void {
    this.validateDateRange(query.data_inicio, query.data_fim);
    this.validatePagination(query.page, query.limit);
    this.validateOrderDirection(query.order_direction);
  }

  private validateDateRange(dataInicio?: Date, dataFim?: Date): void {
    if (
      dataInicio &&
      dataFim &&
      dataInicio instanceof Date &&
      dataFim instanceof Date &&
      dataInicio.getTime() > dataFim.getTime()
    ) {
      throw new BadRequestException(HISTORICO_MESSAGES.INVALID_DATE_RANGE);
    }
  }

  private validateHistoricalStatus(status?: statusprocesso): void {
    if (
      status &&
      !HISTORICO_PROCESS_STATUS.some(
        (historicalStatus) => historicalStatus === status,
      )
    ) {
      throw new BadRequestException(HISTORICO_MESSAGES.INVALID_STATUS);
    }
  }

  private validateDateField(campoData?: string): void {
    if (
      campoData &&
      !HISTORICO_ALLOWED_DATE_FIELDS.some((field) => field === campoData)
    ) {
      throw new BadRequestException('O campo de data informado e invalido.');
    }
  }

  private validateGrouping(agrupamento?: string): void {
    if (
      agrupamento &&
      !HISTORICO_DASHBOARD_GROUPINGS.some(
        (grouping) => grouping === agrupamento,
      )
    ) {
      throw new BadRequestException('O agrupamento informado e invalido.');
    }
  }

  private validateOrderBy(orderBy?: string): void {
    if (
      orderBy &&
      !HISTORICO_ALLOWED_ORDER_BY_FIELDS.some((field) => field === orderBy)
    ) {
      throw new BadRequestException(HISTORICO_MESSAGES.INVALID_ORDER_BY);
    }
  }

  private validateOrderDirection(direction?: string): void {
    if (
      direction &&
      !HISTORICO_ALLOWED_ORDER_DIRECTIONS.some(
        (allowedDirection) => allowedDirection === direction,
      )
    ) {
      throw new BadRequestException(HISTORICO_MESSAGES.INVALID_ORDER_DIRECTION);
    }
  }

  private validatePagination(page?: number, limit?: number): void {
    if (this.isValidNumber(page) && page < 1) {
      throw new BadRequestException(HISTORICO_MESSAGES.INVALID_PAGE);
    }

    if (
      this.isValidNumber(limit) &&
      (limit < 1 || limit > HISTORICO_MAX_LIMIT)
    ) {
      throw new BadRequestException(HISTORICO_MESSAGES.INVALID_LIMIT);
    }
  }

  private validateNumericRange(
    min?: number,
    max?: number,
    message: string = HISTORICO_MESSAGES.INVALID_VACUUM_RANGE,
  ): void {
    if (this.isValidNumber(min) && this.isValidNumber(max) && min > max) {
      throw new BadRequestException(message);
    }
  }

  private validateEfficiencyRange(min?: number, max?: number): void {
    if (
      (this.isValidNumber(min) && (min < 0 || min > 100)) ||
      (this.isValidNumber(max) && (max < 0 || max > 100))
    ) {
      throw new BadRequestException(
        HISTORICO_MESSAGES.INVALID_EFFICIENCY_RANGE,
      );
    }

    this.validateNumericRange(
      min,
      max,
      HISTORICO_MESSAGES.INVALID_EFFICIENCY_RANGE,
    );
  }

  private validateExecutionTimeRange(min?: number, max?: number): void {
    if (
      (this.isValidNumber(min) && min < 0) ||
      (this.isValidNumber(max) && max < 0)
    ) {
      throw new BadRequestException(
        HISTORICO_MESSAGES.INVALID_EXECUTION_TIME_RANGE,
      );
    }

    this.validateNumericRange(
      min,
      max,
      HISTORICO_MESSAGES.INVALID_EXECUTION_TIME_RANGE,
    );
  }

  private validatePositiveId(value?: number, message?: string): void {
    if (this.isValidNumber(value) && value <= 0) {
      throw new BadRequestException(message ?? 'Identificador invalido.');
    }
  }

  private validateUnknownFilters(query: ListHistoricoProcessosQueryDto): void {
    const unknownFilters = Object.keys(query).filter(
      (key) => !HISTORICO_ALLOWED_FILTERS.some((filter) => filter === key),
    );

    if (unknownFilters.length > 0) {
      throw new BadRequestException('A consulta possui filtros desconhecidos.');
    }
  }

  private isValidNumber(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
}
