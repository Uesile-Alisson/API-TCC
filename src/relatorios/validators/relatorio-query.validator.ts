import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { formatorelatorio, nivelacesso, tiporelatorio } from '@prisma/client';

import {
  RELATORIO_ALLOWED_ORDER_BY_FIELDS,
  RELATORIO_ALLOWED_ORDER_DIRECTIONS,
  RELATORIO_MESSAGES,
} from '../constants';
import { ListRelatoriosQueryDto } from '../dto';

export interface ValidateRestrictedFiltersParams {
  query: ListRelatoriosQueryDto;
  nivel_acesso: nivelacesso;
}

@Injectable()
export class RelatorioQueryValidator {
  validateListQuery(query: ListRelatoriosQueryDto): void {
    this.validateDateRange(query.data_inicio, query.data_fim);
    this.validateTypeFormatCombination(
      query.tipo_relatorio,
      query.formato_relatorio,
    );
    this.validateOrderBy(query.order_by);
    this.validateOrderDirection(query.order_direction);
  }

  validateRestrictedFilters(params: ValidateRestrictedFiltersParams): void {
    if (
      params.query.id_usuario !== undefined &&
      params.nivel_acesso === nivelacesso.OPERADOR
    ) {
      throw new ForbiddenException(
        RELATORIO_MESSAGES.PERMISSION.FORBIDDEN_FILTER_USER,
      );
    }
  }

  validateDateRange(data_inicio?: Date, data_fim?: Date): void {
    if (data_inicio !== undefined && !this.isValidDate(data_inicio)) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.VALIDATION.INVALID_DATE_RANGE,
      );
    }

    if (data_fim !== undefined && !this.isValidDate(data_fim)) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.VALIDATION.INVALID_DATE_RANGE,
      );
    }

    if (data_inicio && data_fim && data_inicio > data_fim) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.VALIDATION.INVALID_DATE_RANGE,
      );
    }
  }

  validateOrderBy(order_by?: string): void {
    const normalized = order_by?.trim();

    if (!normalized) {
      return;
    }

    const allowed = RELATORIO_ALLOWED_ORDER_BY_FIELDS.some(
      (field) => field === normalized,
    );

    if (!allowed) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.VALIDATION.INVALID_ORDER_FIELD,
      );
    }
  }

  validateOrderDirection(order_direction?: string): void {
    const normalized = order_direction?.trim().toLowerCase();

    if (!normalized) {
      return;
    }

    const allowed = RELATORIO_ALLOWED_ORDER_DIRECTIONS.some(
      (direction) => direction === normalized,
    );

    if (!allowed) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.VALIDATION.INVALID_ORDER_DIRECTION,
      );
    }
  }

  validateTypeFormatCombination(
    tipo_relatorio?: tiporelatorio,
    formato_relatorio?: formatorelatorio,
  ): void {
    if (!tipo_relatorio || !formato_relatorio) {
      return;
    }

    if (tipo_relatorio === tiporelatorio.PROCESSO) {
      if (
        formato_relatorio === formatorelatorio.PDF ||
        formato_relatorio === formatorelatorio.XLSX
      ) {
        return;
      }

      throw new BadRequestException(
        RELATORIO_MESSAGES.PROCESS.PROCESS_INVALID_FORMAT,
      );
    }

    if (tipo_relatorio === tiporelatorio.ALARME) {
      if (formato_relatorio === formatorelatorio.PDF) {
        return;
      }

      throw new BadRequestException(
        RELATORIO_MESSAGES.ALARM.ALARM_INVALID_FORMAT,
      );
    }

    throw new BadRequestException(RELATORIO_MESSAGES.FORMAT.INVALID_FORMAT);
  }

  private isValidDate(value: Date): boolean {
    return value instanceof Date && Number.isFinite(value.getTime());
  }
}
