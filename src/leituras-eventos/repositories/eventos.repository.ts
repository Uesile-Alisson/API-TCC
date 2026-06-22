import { Injectable } from '@nestjs/common';
import { Prisma, severidadeevento } from '@prisma/client';
import {
  DEFAULT_EVENTOS_ORDER_BY,
  DEFAULT_EVENTOS_ORDER_DIRECTION,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
} from '../constants';
import { ListEventosQueryDto } from '../dto';
import { PrismaService } from '../../prisma/prisma.service';

const eventoListSelect = {
  id_evento_processo: true,
  id_processo: true,
  id_processo_tanque_sensor: true,
  tipo_evento: true,
  origem_evento: true,
  severidade_evento: true,
  ocorrido_em: true,
  processos: {
    select: {
      id_processo: true,
      nome_processo: true,
      status_processo: true,
    },
  },
  processostanquessensores: {
    select: {
      id_processo_tanque_sensor: true,
      id_processo_tanque: true,
      id_sensor: true,
      sensores: {
        select: {
          id_sensor: true,
          nome: true,
          modelo: true,
          unidade_medida: true,
          status_sensor: true,
        },
      },
      processostanques: {
        select: {
          id_processo_tanque: true,
          id_tanque: true,
          status_tanque_processo: true,
          tanques: {
            select: {
              id_tanque: true,
              nome: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.eventosSelect;

const eventoDetailsSelect = {
  id_evento_processo: true,
  id_processo: true,
  id_processo_tanque_sensor: true,
  tipo_evento: true,
  origem_evento: true,
  severidade_evento: true,
  ocorrido_em: true,
  processos: {
    select: {
      id_processo: true,
      nome_processo: true,
      status_processo: true,
      iniciado_em: true,
      finalizado_em: true,
    },
  },
  processostanquessensores: {
    select: {
      id_processo_tanque_sensor: true,
      id_processo_tanque: true,
      id_sensor: true,
      sensores: {
        select: {
          id_sensor: true,
          nome: true,
          modelo: true,
          unidade_medida: true,
          status_sensor: true,
        },
      },
      processostanques: {
        select: {
          id_processo_tanque: true,
          id_tanque: true,
          status_tanque_processo: true,
          tanques: {
            select: {
              id_tanque: true,
              nome: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.eventosSelect;

const eventoTimelineSelect = {
  id_evento_processo: true,
  id_processo: true,
  id_processo_tanque_sensor: true,
  tipo_evento: true,
  origem_evento: true,
  severidade_evento: true,
  ocorrido_em: true,
} satisfies Prisma.eventosSelect;

export type EventoListRecord = Prisma.eventosGetPayload<{
  select: typeof eventoListSelect;
}>;

export type EventoDetailsRecord = Prisma.eventosGetPayload<{
  select: typeof eventoDetailsSelect;
}>;

export type EventoTimelineRecord = Prisma.eventosGetPayload<{
  select: typeof eventoTimelineSelect;
}>;

export interface EventosListAndCountResult {
  data: EventoListRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface EventStatsByProcessResult {
  total_eventos: number;
  eventos_criticos: number;
  eventos_medios: number;
  eventos_info: number;
  primeiro_evento_em: Date | null;
  ultimo_evento_em: Date | null;
}

type PaginationConfig = {
  page: number;
  limit: number;
  skip: number;
  take: number;
};

type OrderDirection = 'asc' | 'desc';

@Injectable()
export class EventosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListEventosQueryDto = {}): Promise<EventoListRecord[]> {
    const { skip, take } = this.getPagination(query);

    return this.prisma.eventos.findMany({
      where: this.buildWhere(query),
      orderBy: this.buildOrderBy(query),
      skip,
      take,
      select: eventoListSelect,
    });
  }

  async count(query: ListEventosQueryDto = {}): Promise<number> {
    return this.prisma.eventos.count({
      where: this.buildWhere(query),
    });
  }

  async listAndCount(
    query: ListEventosQueryDto = {},
  ): Promise<EventosListAndCountResult> {
    const { page, limit } = this.getPagination(query);
    const [data, total] = await Promise.all([
      this.list(query),
      this.count(query),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findById(id_evento_processo: number): Promise<EventoListRecord | null> {
    return this.prisma.eventos.findUnique({
      where: {
        id_evento_processo,
      },
      select: eventoListSelect,
    });
  }

  async findDetailsById(
    id_evento_processo: number,
  ): Promise<EventoDetailsRecord | null> {
    return this.prisma.eventos.findUnique({
      where: {
        id_evento_processo,
      },
      select: eventoDetailsSelect,
    });
  }

  async findByProcess(
    id_processo: number,
    query: ListEventosQueryDto = {},
  ): Promise<EventoListRecord[]> {
    return this.list({
      ...query,
      id_processo,
    });
  }

  async findByProcessTanqueSensor(
    id_processo_tanque_sensor: number,
    query: ListEventosQueryDto = {},
  ): Promise<EventoListRecord[]> {
    return this.list({
      ...query,
      id_processo_tanque_sensor,
    });
  }

  async getEventStatsByProcess(
    id_processo: number,
  ): Promise<EventStatsByProcessResult> {
    const where: Prisma.eventosWhereInput = {
      id_processo,
    };
    const [
      totalEventos,
      eventosCriticos,
      eventosMedios,
      eventosInfo,
      primeiroEvento,
      ultimoEvento,
    ] = await Promise.all([
      this.prisma.eventos.count({ where }),
      this.prisma.eventos.count({
        where: {
          id_processo,
          severidade_evento: severidadeevento.CRITICO,
        },
      }),
      this.prisma.eventos.count({
        where: {
          id_processo,
          severidade_evento: severidadeevento.AVISO,
        },
      }),
      this.prisma.eventos.count({
        where: {
          id_processo,
          severidade_evento: severidadeevento.INFO,
        },
      }),
      this.prisma.eventos.findFirst({
        where,
        orderBy: {
          ocorrido_em: 'asc',
        },
        select: {
          ocorrido_em: true,
        },
      }),
      this.prisma.eventos.findFirst({
        where,
        orderBy: {
          ocorrido_em: 'desc',
        },
        select: {
          ocorrido_em: true,
        },
      }),
    ]);

    return {
      total_eventos: totalEventos,
      eventos_criticos: eventosCriticos,
      eventos_medios: eventosMedios,
      eventos_info: eventosInfo,
      primeiro_evento_em: primeiroEvento?.ocorrido_em ?? null,
      ultimo_evento_em: ultimoEvento?.ocorrido_em ?? null,
    };
  }

  async findTimelineEventsByProcess(
    id_processo: number,
    query: ListEventosQueryDto = {},
  ): Promise<EventoTimelineRecord[]> {
    const { take } = this.getPagination(query);

    return this.prisma.eventos.findMany({
      where: this.buildWhere({
        ...query,
        id_processo,
      }),
      orderBy: {
        ocorrido_em: 'asc',
      },
      take,
      select: eventoTimelineSelect,
    });
  }

  private buildWhere(
    query: ListEventosQueryDto = {},
  ): Prisma.eventosWhereInput {
    const where: Prisma.eventosWhereInput = {};

    if (this.isPositiveInteger(query.id_processo)) {
      where.id_processo = query.id_processo;
    }

    if (this.isPositiveInteger(query.id_processo_tanque_sensor)) {
      where.id_processo_tanque_sensor = query.id_processo_tanque_sensor;
    }

    if (query.tipo_evento) {
      where.tipo_evento = query.tipo_evento;
    }

    if (query.origem_evento) {
      where.origem_evento = query.origem_evento;
    }

    if (query.severidade_evento) {
      where.severidade_evento = query.severidade_evento;
    }

    if (query.ocorrido_de || query.ocorrido_ate) {
      where.ocorrido_em = {
        ...(query.ocorrido_de ? { gte: query.ocorrido_de } : {}),
        ...(query.ocorrido_ate ? { lte: query.ocorrido_ate } : {}),
      };
    }

    return where;
  }

  private buildOrderBy(
    query: ListEventosQueryDto = {},
  ): Prisma.eventosOrderByWithRelationInput {
    const direction = this.resolveOrderDirection(
      query.order_direction,
      DEFAULT_EVENTOS_ORDER_DIRECTION,
    );

    switch (query.order_by) {
      case 'tipo_evento':
        return { tipo_evento: direction };
      case 'severidade_evento':
        return { severidade_evento: direction };
      case 'ocorrido_em':
      default:
        return { [DEFAULT_EVENTOS_ORDER_BY]: direction };
    }
  }

  private getPagination(query: ListEventosQueryDto = {}): PaginationConfig {
    const page = this.isPositiveInteger(query.page) ? query.page : DEFAULT_PAGE;
    const limit = this.resolveLimit(query.limit);

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  private resolveOrderDirection(
    direction: string | undefined,
    fallback: string,
  ): OrderDirection {
    return direction === 'asc' || direction === 'desc'
      ? direction
      : fallback === 'asc'
        ? 'asc'
        : 'desc';
  }

  private resolveLimit(value: number | undefined): number {
    if (!this.isPositiveInteger(value)) {
      return DEFAULT_LIMIT;
    }

    return Math.min(value, MAX_LIMIT);
  }

  private isPositiveInteger(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }
}
