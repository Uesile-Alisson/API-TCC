import { Injectable } from '@nestjs/common';
import {
  origemevento,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';
import type {
  HistoricoEventosResumo,
  HistoricoEventoSummary,
} from '../interfaces';

interface HistoricoEventoSummaryRaw {
  id_evento_processo: number;
  id_processo: number;
  id_processo_tanque_sensor: number | null;
  tipo_evento: tipoeventoprocesso;
  origem_evento: origemevento;
  severidade_evento: severidadeevento;
  ocorrido_em: Date;
}

@Injectable()
export class HistoricoEventoMapper {
  toSummary(raw: HistoricoEventoSummaryRaw): HistoricoEventoSummary {
    return {
      id_evento_processo: raw.id_evento_processo,
      id_processo: raw.id_processo,
      id_processo_tanque_sensor: raw.id_processo_tanque_sensor,
      tipo_evento: raw.tipo_evento,
      origem_evento: raw.origem_evento,
      severidade_evento: raw.severidade_evento,
      ocorrido_em: raw.ocorrido_em,
    };
  }

  toSummaryList(raw: HistoricoEventoSummaryRaw[]): HistoricoEventoSummary[] {
    return raw.map((item) => this.toSummary(item));
  }

  toResumo(raw: HistoricoEventoSummaryRaw[]): HistoricoEventosResumo {
    return {
      total: raw.length,
      info: raw.filter(
        (item) => item.severidade_evento === severidadeevento.INFO,
      ).length,
      aviso: raw.filter(
        (item) => item.severidade_evento === severidadeevento.AVISO,
      ).length,
      critico: raw.filter(
        (item) => item.severidade_evento === severidadeevento.CRITICO,
      ).length,
      primeiro_evento_em: this.getFirstEventDate(raw),
      ultimo_evento_em: this.getLastEventDate(raw),
    };
  }

  private getFirstEventDate(raw: HistoricoEventoSummaryRaw[]): Date | null {
    return this.getSortedEventDates(raw)[0] ?? null;
  }

  private getLastEventDate(raw: HistoricoEventoSummaryRaw[]): Date | null {
    const dates = this.getSortedEventDates(raw);

    return dates[dates.length - 1] ?? null;
  }

  private getSortedEventDates(raw: HistoricoEventoSummaryRaw[]): Date[] {
    return raw
      .map((item) => item.ocorrido_em)
      .sort((current, next) => current.getTime() - next.getTime());
  }
}
