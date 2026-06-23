import { Injectable } from '@nestjs/common';
import { Prisma, severidadealarme, tiporelatorio } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HISTORICO_ALLOWED_ORDER_BY_FIELDS,
  HISTORICO_ALLOWED_ORDER_DIRECTIONS,
  HISTORICO_DEFAULT_LIMIT,
  HISTORICO_DEFAULT_ORDER_BY,
  HISTORICO_DEFAULT_ORDER_DIRECTION,
  HISTORICO_DEFAULT_PAGE,
  HISTORICO_GRAFICO_VACUO_DEFAULT_LIMIT,
  HISTORICO_GRAFICO_VACUO_MAX_LIMIT,
  HISTORICO_MAX_LIMIT,
  HISTORICO_PROCESS_STATUS,
  type HistoricoOrderByField,
  type HistoricoOrderDirection,
} from '../constants';
import type {
  HistoricoGraficoVacuoQueryDto,
  HistoricoProcessoAlarmesQueryDto,
  HistoricoProcessoEventosQueryDto,
  ListHistoricoProcessosQueryDto,
} from '../dto';

type HistoricoDateField = 'criado_em' | 'iniciado_em' | 'finalizado_em';

const historicoProcessListSelect = {
  id_processo: true,
  nome_processo: true,
  status_processo: true,
  vacuo_alvo: true,
  vacuo_inicial: true,
  vacuo_final: true,
  vacuo_medio: true,
  eficiencia: true,
  tempo_maximo: true,
  tempo_execucao: true,
  iniciado_em: true,
  finalizado_em: true,
  criado_em: true,
  parada_emergencia: true,
  usuarios: {
    select: {
      id_usuario: true,
      nome: true,
    },
  },
  _count: {
    select: {
      processostanques: true,
      alarmes: true,
      eventos: true,
      relatorios: true,
    },
  },
} satisfies Prisma.processosSelect;

const historicoProcessDetailsSelect = {
  id_processo: true,
  nome_processo: true,
  status_processo: true,
  vacuo_alvo: true,
  vacuo_inicial: true,
  vacuo_final: true,
  vacuo_medio: true,
  eficiencia: true,
  tempo_maximo: true,
  tempo_execucao: true,
  iniciado_em: true,
  pausado_em: true,
  retomado_em: true,
  finalizado_em: true,
  criado_em: true,
  parada_emergencia: true,
  usuarios: {
    select: {
      id_usuario: true,
      nome: true,
    },
  },
} satisfies Prisma.processosSelect;

const historicoProcessTankSelect = {
  id_processo_tanque: true,
  id_tanque: true,
  status_tanque_processo: true,
  vacuo_alvo: true,
  vacuo_inicial: true,
  vacuo_final: true,
  vacuo_medio: true,
  eficiencia: true,
  iniciado_em: true,
  finalizado_em: true,
  tanques: {
    select: {
      id_tanque: true,
      nome: true,
    },
  },
  _count: {
    select: {
      processostanquessensores: true,
      alarmes: true,
    },
  },
} satisfies Prisma.processostanquesSelect;

const historicoProcessAlarmSelect = {
  id_alarme: true,
  titulo: true,
  descricao: true,
  tipo_alarme: true,
  severidade: true,
  status_alarme: true,
  origem_alarme: true,
  valor_detectado: true,
  unidade: true,
  ocorrido_em: true,
  resolvido_em: true,
  id_processo: true,
  id_processo_tanque: true,
  id_processo_tanque_sensor: true,
} satisfies Prisma.alarmesSelect;

const historicoProcessEventSelect = {
  id_evento_processo: true,
  id_processo: true,
  id_processo_tanque_sensor: true,
  tipo_evento: true,
  origem_evento: true,
  severidade_evento: true,
  ocorrido_em: true,
} satisfies Prisma.eventosSelect;

const historicoProcessReportSelect = {
  id_relatorio: true,
  tipo_relatorio: true,
  formato_relatorio: true,
  titulo: true,
  descricao: true,
  nome_arquivo: true,
  tamanho_bytes: true,
  gerado_em: true,
} satisfies Prisma.relatoriosSelect;

const historicoVacuumReadingSelect = {
  id_leitura_sensor: true,
  id_processo_tanque_sensor: true,
  valor_vacuo: true,
  leitura_em: true,
  recebido_em: true,
  processostanquessensores: {
    select: {
      id_processo_tanque_sensor: true,
      id_sensor: true,
      sensores: {
        select: {
          id_sensor: true,
          nome: true,
        },
      },
      processostanques: {
        select: {
          id_processo: true,
          id_tanque: true,
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

const criticalAlarmProcessSelect = {
  id_processo: true,
  processostanques: {
    select: {
      id_processo: true,
    },
  },
  processostanquessensores: {
    select: {
      processostanques: {
        select: {
          id_processo: true,
        },
      },
    },
  },
} satisfies Prisma.alarmesSelect;

const criticalAlarmTankSelect = {
  id_processo_tanque: true,
  processostanquessensores: {
    select: {
      id_processo_tanque: true,
    },
  },
} satisfies Prisma.alarmesSelect;

const readingTankSelect = {
  processostanquessensores: {
    select: {
      id_processo_tanque: true,
    },
  },
} satisfies Prisma.leiturasensoresSelect;

type HistoricoProcessListRepositoryRecord = Prisma.processosGetPayload<{
  select: typeof historicoProcessListSelect;
}>;

export type HistoricoProcessDetailsRepositoryRaw = Prisma.processosGetPayload<{
  select: typeof historicoProcessDetailsSelect;
}>;

type HistoricoProcessTankRepositoryRecord = Prisma.processostanquesGetPayload<{
  select: typeof historicoProcessTankSelect;
}>;

export type HistoricoProcessAlarmRepositoryRaw = Prisma.alarmesGetPayload<{
  select: typeof historicoProcessAlarmSelect;
}>;

export type HistoricoProcessEventRepositoryRaw = Prisma.eventosGetPayload<{
  select: typeof historicoProcessEventSelect;
}>;

export type HistoricoProcessReportRepositoryRaw = Prisma.relatoriosGetPayload<{
  select: typeof historicoProcessReportSelect;
}>;

export type HistoricoVacuumReadingRepositoryRaw =
  Prisma.leiturasensoresGetPayload<{
    select: typeof historicoVacuumReadingSelect;
  }>;

type CriticalAlarmProcessRecord = Prisma.alarmesGetPayload<{
  select: typeof criticalAlarmProcessSelect;
}>;

type CriticalAlarmTankRecord = Prisma.alarmesGetPayload<{
  select: typeof criticalAlarmTankSelect;
}>;

export type HistoricoProcessListRepositoryRaw =
  HistoricoProcessListRepositoryRecord & {
    total_alarmes: number;
    total_alarmes_criticos: number;
    total_eventos: number;
    possui_relatorio: boolean;
  };

export type HistoricoProcessTankRepositoryRaw =
  HistoricoProcessTankRepositoryRecord & {
    quantidade_leituras: number;
    total_alarmes: number;
    total_alarmes_criticos: number;
  };

export interface HistoricoProcessListRepositoryResult {
  data: HistoricoProcessListRepositoryRaw[];
  total: number;
  page: number;
  limit: number;
}

export interface HistoricoProcessAlarmsRepositoryResult {
  data: HistoricoProcessAlarmRepositoryRaw[];
  total: number;
  page: number;
  limit: number;
}

export interface HistoricoProcessEventsRepositoryResult {
  data: HistoricoProcessEventRepositoryRaw[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class HistoricoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findHistoricalProcesses(
    query: ListHistoricoProcessosQueryDto,
  ): Promise<HistoricoProcessListRepositoryResult> {
    const page = this.normalizePage(query.page);
    const limit = this.normalizeLimit(query.limit);
    const where = this.buildHistoricalProcessWhere(query);
    const orderBy = this.buildOrderBy(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.processos.findMany({
        where,
        orderBy,
        skip: this.calculateSkip(page, limit),
        take: limit,
        select: historicoProcessListSelect,
      }),
      this.prisma.processos.count({ where }),
    ]);

    return {
      data: await this.withProcessComputedFields(data),
      total,
      page,
      limit,
    };
  }

  async findHistoricalProcessById(
    id_processo: number,
  ): Promise<HistoricoProcessDetailsRepositoryRaw | null> {
    return this.prisma.processos.findFirst({
      where: {
        id_processo,
        status_processo: {
          in: [...HISTORICO_PROCESS_STATUS],
        },
      },
      select: historicoProcessDetailsSelect,
    });
  }

  async findProcessTanks(
    id_processo: number,
  ): Promise<HistoricoProcessTankRepositoryRaw[]> {
    const tanks = await this.prisma.processostanques.findMany({
      where: {
        id_processo,
      },
      orderBy: {
        id_processo_tanque: 'asc',
      },
      select: historicoProcessTankSelect,
    });

    return this.withTankComputedFields(tanks);
  }

  async findProcessAlarms(
    id_processo: number,
    query: HistoricoProcessoAlarmesQueryDto,
  ): Promise<HistoricoProcessAlarmsRepositoryResult> {
    const page = this.normalizePage(query.page);
    const limit = this.normalizeLimit(query.limit);
    const where = this.buildAlarmWhere(id_processo, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alarmes.findMany({
        where,
        orderBy: {
          ocorrido_em: this.resolveOrderDirection(query.order_direction),
        },
        skip: this.calculateSkip(page, limit),
        take: limit,
        select: historicoProcessAlarmSelect,
      }),
      this.prisma.alarmes.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findProcessEvents(
    id_processo: number,
    query: HistoricoProcessoEventosQueryDto,
  ): Promise<HistoricoProcessEventsRepositoryResult> {
    const page = this.normalizePage(query.page);
    const limit = this.normalizeLimit(query.limit);
    const where = this.buildEventWhere(id_processo, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.eventos.findMany({
        where,
        orderBy: {
          ocorrido_em: this.resolveOrderDirection(query.order_direction),
        },
        skip: this.calculateSkip(page, limit),
        take: limit,
        select: historicoProcessEventSelect,
      }),
      this.prisma.eventos.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findProcessReportsMetadata(
    id_processo: number,
  ): Promise<HistoricoProcessReportRepositoryRaw[]> {
    return this.prisma.relatorios.findMany({
      where: {
        id_processo,
        tipo_relatorio: tiporelatorio.PROCESSO,
      },
      orderBy: {
        gerado_em: 'desc',
      },
      select: historicoProcessReportSelect,
    });
  }

  async findVacuumReadingsByProcess(
    id_processo: number,
    query: HistoricoGraficoVacuoQueryDto,
  ): Promise<HistoricoVacuumReadingRepositoryRaw[]> {
    // Leituras não possuem id_processo direto; o filtro por processo deve passar por processostanquessensores -> processostanques.
    return this.prisma.leiturasensores.findMany({
      where: this.buildVacuumReadingsWhere(id_processo, query),
      orderBy: {
        leitura_em: this.resolveOrderDirection(query.order_direction, 'asc'),
      },
      take: this.normalizeVacuumLimit(query.limite_pontos),
      select: historicoVacuumReadingSelect,
    });
  }

  async countHistoricalProcesses(): Promise<number> {
    return this.prisma.processos.count({
      where: {
        status_processo: {
          in: [...HISTORICO_PROCESS_STATUS],
        },
      },
    });
  }

  async existsHistoricalProcess(id_processo: number): Promise<boolean> {
    const process = await this.prisma.processos.findFirst({
      where: {
        id_processo,
        status_processo: {
          in: [...HISTORICO_PROCESS_STATUS],
        },
      },
      select: {
        id_processo: true,
      },
    });

    return process !== null;
  }

  private normalizePage(value?: number): number {
    return Number.isInteger(value) && value !== undefined && value >= 1
      ? value
      : HISTORICO_DEFAULT_PAGE;
  }

  private normalizeLimit(value?: number): number {
    const limit =
      Number.isInteger(value) && value !== undefined && value >= 1
        ? value
        : HISTORICO_DEFAULT_LIMIT;

    return Math.min(limit, HISTORICO_MAX_LIMIT);
  }

  private normalizeVacuumLimit(value?: number): number {
    const limit =
      Number.isInteger(value) && value !== undefined && value >= 1
        ? value
        : HISTORICO_GRAFICO_VACUO_DEFAULT_LIMIT;

    return Math.min(limit, HISTORICO_GRAFICO_VACUO_MAX_LIMIT);
  }

  private calculateSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  private buildHistoricalProcessWhere(
    query: ListHistoricoProcessosQueryDto,
  ): Prisma.processosWhereInput {
    const where: Prisma.processosWhereInput = {
      status_processo: query.status_processo ?? {
        in: [...HISTORICO_PROCESS_STATUS],
      },
    };
    const andConditions: Prisma.processosWhereInput[] = [];

    this.applyProcessDateFilter(where, query);

    if (query.id_usuario !== undefined) {
      where.id_usuario = query.id_usuario;
    }

    this.applyProcessTankSensorFilters(where, query.id_tanque, query.id_sensor);

    if (query.nome_processo) {
      where.nome_processo = {
        contains: query.nome_processo,
        mode: 'insensitive',
      };
    }

    if (query.parada_emergencia !== undefined) {
      where.parada_emergencia = query.parada_emergencia;
    }

    if (query.possui_alarmes !== undefined) {
      andConditions.push(
        this.buildProcessAlarmPresenceCondition(query.possui_alarmes, false),
      );
    }

    if (query.possui_alarme_critico !== undefined) {
      andConditions.push(
        this.buildProcessAlarmPresenceCondition(
          query.possui_alarme_critico,
          true,
        ),
      );
    }

    if (query.possui_relatorio !== undefined) {
      where.relatorios = query.possui_relatorio ? { some: {} } : { none: {} };
    }

    if (
      query.eficiencia_min !== undefined ||
      query.eficiencia_max !== undefined
    ) {
      where.eficiencia = this.buildNullableDecimalRangeFilter(
        query.eficiencia_min,
        query.eficiencia_max,
      );
    }

    if (
      query.tempo_execucao_min !== undefined ||
      query.tempo_execucao_max !== undefined
    ) {
      where.tempo_execucao = this.buildNullableIntRangeFilter(
        query.tempo_execucao_min,
        query.tempo_execucao_max,
      );
    }

    if (
      query.vacuo_alvo_min !== undefined ||
      query.vacuo_alvo_max !== undefined
    ) {
      where.vacuo_alvo = this.buildDecimalRangeFilter(
        query.vacuo_alvo_min,
        query.vacuo_alvo_max,
      );
    }

    if (
      query.vacuo_final_min !== undefined ||
      query.vacuo_final_max !== undefined
    ) {
      where.vacuo_final = this.buildNullableDecimalRangeFilter(
        query.vacuo_final_min,
        query.vacuo_final_max,
      );
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    return where;
  }

  private buildDateFilter(
    dataInicio?: Date,
    dataFim?: Date,
  ): Prisma.DateTimeFilter | undefined {
    if (!dataInicio && !dataFim) {
      return undefined;
    }

    const filter: Prisma.DateTimeFilter = {};

    if (dataInicio) {
      filter.gte = dataInicio;
    }

    if (dataFim) {
      filter.lte = dataFim;
    }

    return filter;
  }

  private buildOrderBy(
    query: ListHistoricoProcessosQueryDto,
  ): Prisma.processosOrderByWithRelationInput {
    const orderBy = this.resolveOrderByField(query.order_by);
    const direction = this.resolveOrderDirection(query.order_direction);

    switch (orderBy) {
      case 'criado_em':
        return { criado_em: direction };
      case 'iniciado_em':
        return { iniciado_em: direction };
      case 'tempo_execucao':
        return { tempo_execucao: direction };
      case 'eficiencia':
        return { eficiencia: direction };
      case 'vacuo_medio':
        return { vacuo_medio: direction };
      case 'vacuo_final':
        return { vacuo_final: direction };
      case 'status_processo':
        return { status_processo: direction };
      case 'nome_processo':
        return { nome_processo: direction };
      case 'finalizado_em':
      default:
        return { finalizado_em: direction };
    }
  }

  private buildAlarmWhere(
    id_processo: number,
    query: HistoricoProcessoAlarmesQueryDto,
  ): Prisma.alarmesWhereInput {
    const where: Prisma.alarmesWhereInput = {
      excluido_em: null,
      OR: this.buildAlarmProcessLinkWhere(id_processo),
    };

    if (query.severidade) {
      where.severidade = query.severidade;
    }

    if (query.status_alarme) {
      where.status_alarme = query.status_alarme;
    }

    if (query.tipo_alarme) {
      where.tipo_alarme = query.tipo_alarme;
    }

    if (query.origem_alarme) {
      where.origem_alarme = query.origem_alarme;
    }

    const dateFilter = this.buildDateFilter(query.data_inicio, query.data_fim);

    if (dateFilter) {
      where.ocorrido_em = dateFilter;
    }

    return where;
  }

  private buildEventWhere(
    id_processo: number,
    query: HistoricoProcessoEventosQueryDto,
  ): Prisma.eventosWhereInput {
    const where: Prisma.eventosWhereInput = {
      id_processo,
    };

    if (query.severidade_evento) {
      where.severidade_evento = query.severidade_evento;
    }

    if (query.tipo_evento) {
      where.tipo_evento = query.tipo_evento;
    }

    if (query.origem_evento) {
      where.origem_evento = query.origem_evento;
    }

    const dateFilter = this.buildDateFilter(query.data_inicio, query.data_fim);

    if (dateFilter) {
      where.ocorrido_em = dateFilter;
    }

    return where;
  }

  private buildVacuumReadingsWhere(
    id_processo: number,
    query: HistoricoGraficoVacuoQueryDto,
  ): Prisma.leiturasensoresWhereInput {
    const where: Prisma.leiturasensoresWhereInput = {
      processostanquessensores: {
        id_sensor: query.id_sensor,
        processostanques: {
          id_processo,
          id_tanque: query.id_tanque,
        },
      },
    };
    const dateFilter = this.buildDateFilter(query.data_inicio, query.data_fim);

    if (dateFilter) {
      where.leitura_em = dateFilter;
    }

    return where;
  }

  private applyProcessDateFilter(
    where: Prisma.processosWhereInput,
    query: ListHistoricoProcessosQueryDto,
  ): void {
    const dateFilter = this.buildDateFilter(query.data_inicio, query.data_fim);

    if (!dateFilter) {
      return;
    }

    switch (this.resolveDateField(query.campo_data)) {
      case 'criado_em':
        where.criado_em = dateFilter;
        break;
      case 'iniciado_em':
        where.iniciado_em = dateFilter;
        break;
      case 'finalizado_em':
        where.finalizado_em = dateFilter;
        break;
    }
  }

  private applyProcessTankSensorFilters(
    where: Prisma.processosWhereInput,
    idTanque?: number,
    idSensor?: number,
  ): void {
    if (idTanque === undefined && idSensor === undefined) {
      return;
    }

    const tankWhere: Prisma.processostanquesWhereInput = {};

    if (idTanque !== undefined) {
      tankWhere.id_tanque = idTanque;
    }

    if (idSensor !== undefined) {
      tankWhere.processostanquessensores = {
        some: {
          id_sensor: idSensor,
        },
      };
    }

    where.processostanques = {
      some: tankWhere,
    };
  }

  private buildAlarmProcessLinkWhere(
    id_processo: number,
  ): Prisma.alarmesWhereInput[] {
    return [
      {
        id_processo,
      },
      {
        processostanques: {
          id_processo,
        },
      },
      {
        processostanquessensores: {
          processostanques: {
            id_processo,
          },
        },
      },
    ];
  }

  private buildProcessAlarmPresenceCondition(
    shouldExist: boolean,
    onlyCritical: boolean,
  ): Prisma.processosWhereInput {
    const alarmWhere: Prisma.alarmesWhereInput = {
      excluido_em: null,
    };

    if (onlyCritical) {
      alarmWhere.severidade = severidadealarme.CRITICO;
    }

    if (shouldExist) {
      return {
        OR: [
          {
            alarmes: {
              some: alarmWhere,
            },
          },
          {
            processostanques: {
              some: {
                alarmes: {
                  some: alarmWhere,
                },
              },
            },
          },
          {
            processostanques: {
              some: {
                processostanquessensores: {
                  some: {
                    alarmes: {
                      some: alarmWhere,
                    },
                  },
                },
              },
            },
          },
        ],
      };
    }

    return {
      AND: [
        {
          alarmes: {
            none: alarmWhere,
          },
        },
        {
          processostanques: {
            none: {
              alarmes: {
                some: alarmWhere,
              },
            },
          },
        },
        {
          processostanques: {
            none: {
              processostanquessensores: {
                some: {
                  alarmes: {
                    some: alarmWhere,
                  },
                },
              },
            },
          },
        },
      ],
    };
  }

  private buildDecimalRangeFilter(
    min?: number,
    max?: number,
  ): Prisma.DecimalFilter {
    const filter: Prisma.DecimalFilter = {};

    if (min !== undefined) {
      filter.gte = min;
    }

    if (max !== undefined) {
      filter.lte = max;
    }

    return filter;
  }

  private buildNullableDecimalRangeFilter(
    min?: number,
    max?: number,
  ): Prisma.DecimalNullableFilter {
    const filter: Prisma.DecimalNullableFilter = {};

    if (min !== undefined) {
      filter.gte = min;
    }

    if (max !== undefined) {
      filter.lte = max;
    }

    return filter;
  }

  private buildNullableIntRangeFilter(
    min?: number,
    max?: number,
  ): Prisma.IntNullableFilter {
    const filter: Prisma.IntNullableFilter = {};

    if (min !== undefined) {
      filter.gte = min;
    }

    if (max !== undefined) {
      filter.lte = max;
    }

    return filter;
  }

  private resolveOrderByField(value?: string): HistoricoOrderByField {
    if (value && this.isAllowedOrderByField(value)) {
      return value;
    }

    return HISTORICO_DEFAULT_ORDER_BY;
  }

  private resolveOrderDirection(
    value?: string,
    fallback: HistoricoOrderDirection = HISTORICO_DEFAULT_ORDER_DIRECTION,
  ): HistoricoOrderDirection {
    if (value && this.isAllowedOrderDirection(value)) {
      return value;
    }

    return fallback;
  }

  private isAllowedOrderByField(value: string): value is HistoricoOrderByField {
    return HISTORICO_ALLOWED_ORDER_BY_FIELDS.some((field) => field === value);
  }

  private isAllowedOrderDirection(
    value: string,
  ): value is HistoricoOrderDirection {
    return HISTORICO_ALLOWED_ORDER_DIRECTIONS.some(
      (direction) => direction === value,
    );
  }

  private resolveDateField(value?: HistoricoDateField): HistoricoDateField {
    return value ?? 'finalizado_em';
  }

  private async withProcessComputedFields(
    records: HistoricoProcessListRepositoryRecord[],
  ): Promise<HistoricoProcessListRepositoryRaw[]> {
    const criticalCounts = await this.countCriticalAlarmsByProcessIds(
      records.map((record) => record.id_processo),
    );

    return records.map((record) => ({
      ...record,
      total_alarmes: record._count.alarmes,
      total_alarmes_criticos: criticalCounts.get(record.id_processo) ?? 0,
      total_eventos: record._count.eventos,
      possui_relatorio: record._count.relatorios > 0,
    }));
  }

  private async withTankComputedFields(
    records: HistoricoProcessTankRepositoryRecord[],
  ): Promise<HistoricoProcessTankRepositoryRaw[]> {
    const tankIds = records.map((record) => record.id_processo_tanque);
    const [readingCounts, criticalCounts] = await Promise.all([
      this.countReadingsByProcessTankIds(tankIds),
      this.countCriticalAlarmsByProcessTankIds(tankIds),
    ]);

    return records.map((record) => ({
      ...record,
      quantidade_leituras: readingCounts.get(record.id_processo_tanque) ?? 0,
      total_alarmes: record._count.alarmes,
      total_alarmes_criticos:
        criticalCounts.get(record.id_processo_tanque) ?? 0,
    }));
  }

  private async countCriticalAlarmsByProcessIds(
    processIds: number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();

    if (processIds.length === 0) {
      return counts;
    }

    const alarms = await this.prisma.alarmes.findMany({
      where: {
        severidade: severidadealarme.CRITICO,
        excluido_em: null,
        OR: [
          {
            id_processo: {
              in: processIds,
            },
          },
          {
            processostanques: {
              id_processo: {
                in: processIds,
              },
            },
          },
          {
            processostanquessensores: {
              processostanques: {
                id_processo: {
                  in: processIds,
                },
              },
            },
          },
        ],
      },
      select: criticalAlarmProcessSelect,
    });

    alarms.forEach((alarm) => {
      const processId = this.getProcessIdFromCriticalAlarm(alarm);

      if (processId !== null) {
        counts.set(processId, (counts.get(processId) ?? 0) + 1);
      }
    });

    return counts;
  }

  private async countCriticalAlarmsByProcessTankIds(
    processTankIds: number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();

    if (processTankIds.length === 0) {
      return counts;
    }

    const alarms = await this.prisma.alarmes.findMany({
      where: {
        severidade: severidadealarme.CRITICO,
        excluido_em: null,
        OR: [
          {
            id_processo_tanque: {
              in: processTankIds,
            },
          },
          {
            processostanquessensores: {
              id_processo_tanque: {
                in: processTankIds,
              },
            },
          },
        ],
      },
      select: criticalAlarmTankSelect,
    });

    alarms.forEach((alarm) => {
      const tankId = this.getProcessTankIdFromCriticalAlarm(alarm);

      if (tankId !== null) {
        counts.set(tankId, (counts.get(tankId) ?? 0) + 1);
      }
    });

    return counts;
  }

  private async countReadingsByProcessTankIds(
    processTankIds: number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();

    if (processTankIds.length === 0) {
      return counts;
    }

    const readings = await this.prisma.leiturasensores.findMany({
      where: {
        processostanquessensores: {
          id_processo_tanque: {
            in: processTankIds,
          },
        },
      },
      select: readingTankSelect,
    });

    readings.forEach((reading) => {
      const tankId = reading.processostanquessensores.id_processo_tanque;

      counts.set(tankId, (counts.get(tankId) ?? 0) + 1);
    });

    return counts;
  }

  private getProcessIdFromCriticalAlarm(
    alarm: CriticalAlarmProcessRecord,
  ): number | null {
    return (
      alarm.id_processo ??
      alarm.processostanques?.id_processo ??
      alarm.processostanquessensores?.processostanques.id_processo ??
      null
    );
  }

  private getProcessTankIdFromCriticalAlarm(
    alarm: CriticalAlarmTankRecord,
  ): number | null {
    return (
      alarm.id_processo_tanque ??
      alarm.processostanquessensores?.id_processo_tanque ??
      null
    );
  }
}
