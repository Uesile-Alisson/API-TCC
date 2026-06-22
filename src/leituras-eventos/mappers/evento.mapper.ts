import { Injectable } from '@nestjs/common';
import type {
  EventoDetails,
  EventoListResponse,
  EventoResponse,
  PaginationMeta,
} from '../interfaces';

interface EventoRaw {
  id_evento_processo: number;
  id_processo: number;
  id_processo_tanque_sensor: number | null;
  tipo_evento: EventoResponse['tipo_evento'];
  origem_evento: EventoResponse['origem_evento'];
  severidade_evento: EventoResponse['severidade_evento'];
  ocorrido_em: Date;
}

interface EventoDetailsRaw extends EventoRaw {
  processo?: {
    id_processo: number;
    nome_processo: string | null;
    status_processo: string;
    iniciado_em: Date | null;
    finalizado_em: Date | null;
  } | null;
  processo_tanque_sensor?: {
    id_processo_tanque_sensor: number;
    id_processo_tanque: number;
    id_sensor: number;
  } | null;
  sensor?: {
    id_sensor: number;
    nome_sensor: string;
    modelo_sensor: string | null;
    unidade_medida: string | null;
    status_sensor: string;
  } | null;
  tanque?: {
    id_processo_tanque: number;
    id_tanque: number;
    nome_tanque: string | null;
    status_tanque_processo: string;
  } | null;
}

@Injectable()
export class EventoMapper {
  toResponse(evento: EventoRaw): EventoResponse {
    return {
      id_evento_processo: evento.id_evento_processo,
      id_processo: evento.id_processo,
      id_processo_tanque_sensor: evento.id_processo_tanque_sensor,
      tipo_evento: evento.tipo_evento,
      origem_evento: evento.origem_evento,
      severidade_evento: evento.severidade_evento,
      ocorrido_em: evento.ocorrido_em,
    };
  }

  toDetails(evento: EventoDetailsRaw): EventoDetails {
    return {
      id_evento_processo: evento.id_evento_processo,
      id_processo: evento.id_processo,
      id_processo_tanque_sensor: evento.id_processo_tanque_sensor,
      tipo_evento: evento.tipo_evento,
      origem_evento: evento.origem_evento,
      severidade_evento: evento.severidade_evento,
      ocorrido_em: evento.ocorrido_em,
      processo: evento.processo
        ? {
            id_processo: evento.processo.id_processo,
            nome_processo: evento.processo.nome_processo,
            status_processo: evento.processo.status_processo,
            iniciado_em: evento.processo.iniciado_em,
            finalizado_em: evento.processo.finalizado_em,
          }
        : null,
      processo_tanque_sensor: evento.processo_tanque_sensor
        ? {
            id_processo_tanque_sensor:
              evento.processo_tanque_sensor.id_processo_tanque_sensor,
            id_processo_tanque:
              evento.processo_tanque_sensor.id_processo_tanque,
            id_sensor: evento.processo_tanque_sensor.id_sensor,
          }
        : null,
      sensor: evento.sensor
        ? {
            id_sensor: evento.sensor.id_sensor,
            nome_sensor: evento.sensor.nome_sensor,
            modelo_sensor: evento.sensor.modelo_sensor,
            unidade_medida: evento.sensor.unidade_medida,
            status_sensor: evento.sensor.status_sensor,
          }
        : null,
      tanque: evento.tanque
        ? {
            id_processo_tanque: evento.tanque.id_processo_tanque,
            id_tanque: evento.tanque.id_tanque,
            nome_tanque: evento.tanque.nome_tanque,
            status_tanque_processo: evento.tanque.status_tanque_processo,
          }
        : null,
    };
  }

  toListResponse(
    eventos: EventoRaw[],
    total: number,
    page: number,
    limit: number,
  ): EventoListResponse {
    const meta = this.buildPaginationMeta(total, page, limit);

    return {
      data: eventos.map((evento) => this.toResponse(evento)),
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
}
