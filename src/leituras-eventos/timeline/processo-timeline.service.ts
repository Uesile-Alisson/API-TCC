import { Injectable } from '@nestjs/common';
import {
  TIMELINE_DEFAULT_INCLUDE_EVENTOS,
  TIMELINE_DEFAULT_INCLUDE_LEITURAS,
  TIMELINE_DEFAULT_LIMIT,
  TIMELINE_MAX_LIMIT,
} from '../constants';
import type {
  ProcessoTimelineResponse,
  TimelineItem,
  TimelineItemSeverity,
} from '../interfaces';
import type {
  BuildProcessTimelineInput,
  ProcessoTimelineEventoInput,
  ProcessoTimelineLeituraInput,
  TimelineBuildOptions,
  TimelineNormalizedEvent,
} from './processo-timeline.types';

type NumericLike = {
  toNumber?: () => number;
  toString?: () => string;
};

@Injectable()
export class ProcessoTimelineService {
  buildProcessTimeline(
    input: BuildProcessTimelineInput,
  ): ProcessoTimelineResponse {
    const options = this.normalizeOptions(input);
    const leituraItems = options.incluir_leituras
      ? this.buildLeituraItems(input.leituras ?? [])
      : [];
    const eventoItems = options.incluir_eventos
      ? this.buildEventoItems(input.eventos ?? [])
      : [];
    const merged = this.mergeTimelineItems(leituraItems, eventoItems);
    const sorted = this.sortTimelineItems(merged);
    const limited = this.limitTimelineItems(sorted, options.limit);

    return {
      id_processo: input.id_processo,
      items: limited,
      total_items: merged.length,
      generated_at: new Date(),
    };
  }

  normalizeOptions(input: BuildProcessTimelineInput): TimelineBuildOptions {
    return {
      incluir_leituras:
        input.incluir_leituras ?? TIMELINE_DEFAULT_INCLUDE_LEITURAS,
      incluir_eventos:
        input.incluir_eventos ?? TIMELINE_DEFAULT_INCLUDE_EVENTOS,
      limit: this.resolveLimit(input.limit),
    };
  }

  buildLeituraItems(leituras: ProcessoTimelineLeituraInput[]): TimelineItem[] {
    return leituras.map((leitura) => {
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
          recebido_em: leitura.recebido_em ?? null,
        },
      };
    });
  }

  buildEventoItems(eventos: ProcessoTimelineEventoInput[]): TimelineItem[] {
    return eventos.map((evento) => {
      const normalizedEvent = this.normalizeEvent(evento);

      return {
        type: 'EVENTO',
        timestamp: evento.ocorrido_em,
        id: evento.id_evento_processo,
        title: normalizedEvent.title,
        description: normalizedEvent.description,
        severity: normalizedEvent.severity,
        value: null,
        unit: null,
        metadata: {
          id_processo: evento.id_processo,
          id_processo_tanque_sensor: evento.id_processo_tanque_sensor ?? null,
          tipo_evento: evento.tipo_evento,
          origem_evento: evento.origem_evento,
        },
      };
    });
  }

  mergeTimelineItems(
    leituraItems: TimelineItem[],
    eventoItems: TimelineItem[],
  ): TimelineItem[] {
    return [...leituraItems, ...eventoItems];
  }

  sortTimelineItems(items: TimelineItem[]): TimelineItem[] {
    return [...items].sort((current, next) => {
      const currentTime = this.getTimestampTime(current.timestamp);
      const nextTime = this.getTimestampTime(next.timestamp);

      if (currentTime !== nextTime) {
        return currentTime - nextTime;
      }

      const currentPriority = this.getItemTypePriority(current.type);
      const nextPriority = this.getItemTypePriority(next.type);

      if (currentPriority !== nextPriority) {
        return currentPriority - nextPriority;
      }

      return current.id - next.id;
    });
  }

  limitTimelineItems(items: TimelineItem[], limit?: number): TimelineItem[] {
    return items.slice(0, this.resolveLimit(limit));
  }

  filterTimelineItemsByDate(
    items: TimelineItem[],
    start?: Date,
    end?: Date,
  ): TimelineItem[] {
    const startTime = start ? this.getTimestampTime(start) : null;
    const endTime = end ? this.getTimestampTime(end) : null;

    return items.filter((item) => {
      const itemTime = this.getTimestampTime(item.timestamp);
      const isAfterStart = startTime === null || itemTime >= startTime;
      const isBeforeEnd = endTime === null || itemTime <= endTime;

      return isAfterStart && isBeforeEnd;
    });
  }

  normalizeSeverity(value: unknown): TimelineItemSeverity {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toUpperCase();

    switch (normalized) {
      case 'INFO':
      case 'MEDIO':
      case 'CRITICO':
        return normalized;
      default:
        return null;
    }
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

  private normalizeEvent(
    evento: ProcessoTimelineEventoInput,
  ): TimelineNormalizedEvent {
    const severity = this.normalizeSeverity(evento.severidade_evento);

    return {
      severity,
      title: `Evento operacional: ${evento.tipo_evento}`,
      description: this.buildEventoDescription(
        evento.origem_evento,
        evento.severidade_evento,
      ),
    };
  }

  private buildEventoDescription(
    origemEvento: string,
    severidadeEvento: string,
  ): string | null {
    const origem = origemEvento.trim();
    const severidade = severidadeEvento.trim();

    if (origem && severidade) {
      return `Origem: ${origem}. Severidade: ${severidade}.`;
    }

    if (origem) {
      return `Origem: ${origem}.`;
    }

    if (severidade) {
      return `Severidade: ${severidade}.`;
    }

    return null;
  }

  private resolveLimit(limit?: number): number {
    if (!Number.isFinite(limit) || limit === undefined || limit <= 0) {
      return TIMELINE_DEFAULT_LIMIT;
    }

    return Math.min(limit, TIMELINE_MAX_LIMIT);
  }

  private getTimestampTime(date: Date): number {
    const time = date.getTime();

    return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
  }

  private getItemTypePriority(type: TimelineItem['type']): number {
    return type === 'EVENTO' ? 1 : 2;
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
