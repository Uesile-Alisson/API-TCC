import { Injectable } from '@nestjs/common';
import { Prisma, tipoleiturasensor } from '@prisma/client';
import {
  DEFAULT_LEITURAS_ORDER_BY,
  DEFAULT_LEITURAS_ORDER_DIRECTION,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  GRAFICO_VACUO_DEFAULT_LIMIT,
  GRAFICO_VACUO_MAX_LIMIT,
  MAX_LIMIT,
} from '../constants';
import { GraficoVacuoQueryDto, ListLeiturasQueryDto } from '../dto';
import { PrismaService } from '../../prisma/prisma.service';

const leituraListSelect = {
  id_leitura_sensor: true,
  id_processo_tanque_sensor: true,
  valor_vacuo: true,
  leitura_em: true,
  recebido_em: true,
  unidade_medida: true,
  processostanquessensores: {
    select: {
      id_processo_tanque_sensor: true,
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
          processos: {
            select: {
              id_processo: true,
              nome_processo: true,
              status_processo: true,
            },
          },
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
} satisfies Prisma.leiturasensoresSelect;

const leituraDetailsSelect = {
  id_leitura_sensor: true,
  id_processo_tanque_sensor: true,
  valor_vacuo: true,
  leitura_em: true,
  recebido_em: true,
  unidade_medida: true,
  processostanquessensores: {
    select: {
      id_processo_tanque_sensor: true,
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
          vacuo_alvo: true,
          vacuo_inicial: true,
          vacuo_final: true,
          vacuo_medio: true,
          status_tanque_processo: true,
          processos: {
            select: {
              id_processo: true,
              nome_processo: true,
              status_processo: true,
              iniciado_em: true,
              finalizado_em: true,
            },
          },
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
} satisfies Prisma.leiturasensoresSelect;

const leituraChartSelect = {
  id_leitura_sensor: true,
  id_processo_tanque_sensor: true,
  valor_vacuo: true,
  leitura_em: true,
} satisfies Prisma.leiturasensoresSelect;

const leituraStatsSelect = {
  id_leitura_sensor: true,
  id_processo_tanque_sensor: true,
  valor_vacuo: true,
  leitura_em: true,
  recebido_em: true,
} satisfies Prisma.leiturasensoresSelect;

export type LeituraListRecord = Prisma.leiturasensoresGetPayload<{
  select: typeof leituraListSelect;
}>;

export type LeituraDetailsRecord = Prisma.leiturasensoresGetPayload<{
  select: typeof leituraDetailsSelect;
}>;

export type LeituraChartRecord = Prisma.leiturasensoresGetPayload<{
  select: typeof leituraChartSelect;
}>;

export type LeituraStatsRecord = Prisma.leiturasensoresGetPayload<{
  select: typeof leituraStatsSelect;
}>;

export interface LeiturasListAndCountResult {
  data: LeituraListRecord[];
  total: number;
  page: number;
  limit: number;
}

type PaginationConfig = {
  page: number;
  limit: number;
  skip: number;
  take: number;
};

type OrderDirection = 'asc' | 'desc';

@Injectable()
export class LeiturasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListLeiturasQueryDto = {}): Promise<LeituraListRecord[]> {
    const { skip, take } = this.getPagination(query);

    return this.prisma.leiturasensores.findMany({
      where: this.buildWhere(query),
      orderBy: this.buildOrderBy(query),
      skip,
      take,
      select: leituraListSelect,
    });
  }

  async count(query: ListLeiturasQueryDto = {}): Promise<number> {
    return this.prisma.leiturasensores.count({
      where: this.buildWhere(query),
    });
  }

  async listAndCount(
    query: ListLeiturasQueryDto = {},
  ): Promise<LeiturasListAndCountResult> {
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

  async findById(id_leitura_sensor: number): Promise<LeituraListRecord | null> {
    return this.prisma.leiturasensores.findUnique({
      where: {
        id_leitura_sensor,
      },
      select: leituraListSelect,
    });
  }

  async findDetailsById(
    id_leitura_sensor: number,
  ): Promise<LeituraDetailsRecord | null> {
    return this.prisma.leiturasensores.findUnique({
      where: {
        id_leitura_sensor,
      },
      select: leituraDetailsSelect,
    });
  }

  async findByProcess(
    id_processo: number,
    query: ListLeiturasQueryDto = {},
  ): Promise<LeituraListRecord[]> {
    return this.list({
      ...query,
      id_processo,
    });
  }

  async findByProcessTanqueSensor(
    id_processo_tanque_sensor: number,
    query: ListLeiturasQueryDto = {},
  ): Promise<LeituraListRecord[]> {
    return this.list({
      ...query,
      id_processo_tanque_sensor,
    });
  }

  async findChartDataByProcess(
    id_processo: number,
    query: GraficoVacuoQueryDto = {},
  ): Promise<LeituraChartRecord[]> {
    return this.prisma.leiturasensores.findMany({
      where: this.buildChartWhere({
        ...query,
        id_processo,
      }),
      orderBy: {
        leitura_em: 'asc',
      },
      take: this.getChartLimit(query),
      select: leituraChartSelect,
    });
  }

  async findChartDataByProcessTanqueSensor(
    id_processo_tanque_sensor: number,
    query: GraficoVacuoQueryDto = {},
  ): Promise<LeituraChartRecord[]> {
    return this.prisma.leiturasensores.findMany({
      where: this.buildChartWhere({
        ...query,
        id_processo_tanque_sensor,
      }),
      orderBy: {
        leitura_em: 'asc',
      },
      take: this.getChartLimit(query),
      select: leituraChartSelect,
    });
  }

  async getStatsByProcess(id_processo: number): Promise<LeituraStatsRecord[]> {
    return this.prisma.leiturasensores.findMany({
      where: this.buildWhere({ id_processo }),
      orderBy: {
        leitura_em: 'asc',
      },
      select: leituraStatsSelect,
    });
  }

  private buildWhere(
    query: ListLeiturasQueryDto = {},
  ): Prisma.leiturasensoresWhereInput {
    const where: Prisma.leiturasensoresWhereInput = {
      tipo_leitura: tipoleiturasensor.VACUO,
    };
    const processostanquessensoresWhere =
      this.buildProcessoTanqueSensorWhere(query);

    if (processostanquessensoresWhere) {
      where.processostanquessensores = processostanquessensoresWhere;
    }

    if (this.isPositiveInteger(query.id_processo_tanque_sensor)) {
      where.id_processo_tanque_sensor = query.id_processo_tanque_sensor;
    }

    if (query.leitura_de || query.leitura_ate) {
      where.leitura_em = {
        ...(query.leitura_de ? { gte: query.leitura_de } : {}),
        ...(query.leitura_ate ? { lte: query.leitura_ate } : {}),
      };
    }

    if (query.recebido_de || query.recebido_ate) {
      where.recebido_em = {
        ...(query.recebido_de ? { gte: query.recebido_de } : {}),
        ...(query.recebido_ate ? { lte: query.recebido_ate } : {}),
      };
    }

    if (
      this.isFiniteNumber(query.valor_minimo) ||
      this.isFiniteNumber(query.valor_maximo)
    ) {
      where.valor_vacuo = {
        ...(this.isFiniteNumber(query.valor_minimo)
          ? { gte: query.valor_minimo }
          : {}),
        ...(this.isFiniteNumber(query.valor_maximo)
          ? { lte: query.valor_maximo }
          : {}),
      };
    }

    return where;
  }

  private buildOrderBy(
    query: ListLeiturasQueryDto = {},
  ): Prisma.leiturasensoresOrderByWithRelationInput {
    const direction = this.resolveOrderDirection(
      query.order_direction,
      DEFAULT_LEITURAS_ORDER_DIRECTION,
    );

    switch (query.order_by) {
      case 'recebido_em':
        return { recebido_em: direction };
      case 'valor_vacuo':
        return { valor_vacuo: direction };
      case 'leitura_em':
      default:
        return { [DEFAULT_LEITURAS_ORDER_BY]: direction };
    }
  }

  private getPagination(query: ListLeiturasQueryDto = {}): PaginationConfig {
    const page = this.isPositiveInteger(query.page) ? query.page : DEFAULT_PAGE;
    const limit = this.resolveLimit(query.limit, DEFAULT_LIMIT, MAX_LIMIT);

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  private getChartLimit(query: GraficoVacuoQueryDto = {}): number {
    return this.resolveLimit(
      query.limit,
      GRAFICO_VACUO_DEFAULT_LIMIT,
      GRAFICO_VACUO_MAX_LIMIT,
    );
  }

  private buildChartWhere(
    query: GraficoVacuoQueryDto & {
      id_processo?: number;
      id_processo_tanque_sensor?: number;
    },
  ): Prisma.leiturasensoresWhereInput {
    const where = this.buildWhere({
      id_processo: query.id_processo,
      id_processo_tanque_sensor: query.id_processo_tanque_sensor,
      leitura_de: query.leitura_de,
      leitura_ate: query.leitura_ate,
    });

    if (this.isPositiveInteger(query.id_processo_tanque_sensor)) {
      where.id_processo_tanque_sensor = query.id_processo_tanque_sensor;
    }

    return where;
  }

  private buildProcessoTanqueSensorWhere(
    query: ListLeiturasQueryDto,
  ): Prisma.processostanquessensoresWhereInput | null {
    const processostanques: Prisma.processostanquesWhereInput = {};

    if (this.isPositiveInteger(query.id_processo)) {
      processostanques.id_processo = query.id_processo;
    }

    if (this.isPositiveInteger(query.id_processo_tanque)) {
      processostanques.id_processo_tanque = query.id_processo_tanque;
    }

    if (Object.keys(processostanques).length === 0) {
      return null;
    }

    return {
      processostanques,
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

  private resolveLimit(
    value: number | undefined,
    defaultLimit: number,
    maxLimit: number,
  ): number {
    if (!this.isPositiveInteger(value)) {
      return defaultLimit;
    }

    return Math.min(value, maxLimit);
  }

  private isPositiveInteger(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }

  private isFiniteNumber(value: number | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
}
