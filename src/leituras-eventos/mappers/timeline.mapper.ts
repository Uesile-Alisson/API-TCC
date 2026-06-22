import { Injectable } from '@nestjs/common';
import { TIMELINE_DEFAULT_LIMIT, TIMELINE_MAX_LIMIT } from '../constants';
import type {
  ProcessoTimelineResponse,
  TimelineItem,
  TimelineItemSeverity,
} from '../interfaces';

type DecimalLike = {
  toNumber?: () => number;
  toString?: () => string;
};

interface TimelineLeituraRaw {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  valor_vacuo: unknown;
  leitura_em: Date;
  recebido_em: Date;
  unidade_medida?: string | null;
}

interface TimelineEventoRaw {
  id_evento_processo: number;
  id_processo: number;
  id_processo_tanque_sensor: number | null;
  tipo_evento: string;
  origem_evento: string;
  severidade_evento: string;
  ocorrido_em: Date;
}

@Injectable()
export class TimelineMapper {
  leituraToTimelineItem(leitura: TimelineLeituraRaw): TimelineItem {
    const valorVacuo = this.toNumberOrNull(leitura.valor_vacuo);

    return {
      type: 'LEITURA',
      timestamp: leitura.leitura_em,
      id: leitura.id_leitura_sensor,
      title: 'Leitura de vácuo registrada',
      description:
        valorVacuo === null
          ? 'Leitura registrada sem valor de vácuo.'
          : `Valor de vácuo registrado: ${valorVacuo}`,
      severity: null,
      value: valorVacuo,
      unit: leitura.unidade_medida ?? null,
      metadata: {
        id_processo_tanque_sensor: leitura.id_processo_tanque_sensor,
        recebido_em: leitura.recebido_em,
      },
    };
  }

  eventoToTimelineItem(evento: TimelineEventoRaw): TimelineItem {
    const severity = this.normalizeSeverity(evento.severidade_evento);

    return {
      type: 'EVENTO',
      timestamp: evento.ocorrido_em,
      id: evento.id_evento_processo,
      title: `Evento operacional: ${evento.tipo_evento}`,
      description: this.buildEventoDescription(evento.origem_evento, severity),
      severity,
      value: null,
      unit: null,
      metadata: {
        id_processo: evento.id_processo,
        id_processo_tanque_sensor: evento.id_processo_tanque_sensor,
        tipo_evento: evento.tipo_evento,
        origem_evento: evento.origem_evento,
      },
    };
  }

  sortItemsByTimestamp(items: TimelineItem[]): TimelineItem[] {
    return [...items].sort(
      (current, next) => current.timestamp.getTime() - next.timestamp.getTime(),
    );
  }

  limitItems(items: TimelineItem[], limit?: number): TimelineItem[] {
    const safeLimit = this.resolveLimit(limit);

    return items.slice(0, safeLimit);
  }

  toTimelineResponse(
    id_processo: number,
    items: TimelineItem[],
    limit?: number,
  ): ProcessoTimelineResponse {
    const orderedItems = this.sortItemsByTimestamp(items);
    const limitedItems = this.limitItems(orderedItems, limit);

    return {
      id_processo,
      items: limitedItems,
      total_items: items.length,
      generated_at: new Date(),
    };
  }

  private normalizeSeverity(value: unknown): TimelineItemSeverity {
    switch (value) {
      case 'INFO':
      case 'MEDIO':
      case 'CRITICO':
        return value;
      default:
        return null;
    }
  }

  private buildEventoDescription(
    origem: string,
    severity: TimelineItemSeverity,
  ): string | null {
    if (origem && severity) {
      return `Origem: ${origem}. Severidade: ${severity}.`;
    }

    if (origem) {
      return `Origem: ${origem}.`;
    }

    if (severity) {
      return `Severidade: ${severity}.`;
    }

    return null;
  }

  private resolveLimit(limit?: number): number {
    if (!Number.isFinite(limit) || limit === undefined || limit <= 0) {
      return TIMELINE_DEFAULT_LIMIT;
    }

    return Math.min(limit, TIMELINE_MAX_LIMIT);
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
