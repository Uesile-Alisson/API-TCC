import { Injectable } from '@nestjs/common';
import {
  motivoresolucaoalarme,
  origemalarme,
  origemlogoperacional,
  Prisma,
  resultadotentativarecuperacaoalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
} from '@prisma/client';
import {
  ALARME_ALLOWED_ORDER_BY_FIELDS,
  ALARME_ALLOWED_ORDER_DIRECTIONS,
  DEFAULT_ALARME_LIMIT,
  DEFAULT_ALARME_ORDER_BY,
  DEFAULT_ALARME_ORDER_DIRECTION,
  DEFAULT_ALARME_PAGE,
  MAX_ALARME_LIMIT,
} from '../constants';
import { PrismaService } from '../../prisma/prisma.service';

const alarmListSelect = {
  id_alarme: true,
  id_mqtt_mensagem: true,
  id_usuario_responsavel: true,
  titulo: true,
  descricao: true,
  tipo_alarme: true,
  severidade: true,
  status_alarme: true,
  origem_alarme: true,
  valor_detectado: true,
  unidade: true,
  ocorrido_em: true,
  normalizado_em: true,
  resolvido_em: true,
  motivo_resolucao: true,
  tentativas_recuperacao: true,
  ultima_tentativa_recuperacao_em: true,
  ultima_validacao_em: true,
  bloqueante: true,
  requer_intervencao: true,
  recuperacao_automatica: true,
  excluido_em: true,
  id_processo: true,
  id_processo_tanque: true,
  id_processo_tanque_sensor: true,
  reconhecimentos: {
    select: {
      id_alarme_reconhecimento: true,
      id_usuario: true,
      reconhecido_em: true,
      observacao: true,
      status_processo_snapshot: true,
      fase_processo_snapshot: true,
    },
    orderBy: {
      reconhecido_em: 'desc',
    },
    take: 5,
  },
} satisfies Prisma.alarmesSelect;

const alarmDetailsSelect = {
  ...alarmListSelect,
  processos: {
    select: {
      id_processo: true,
      nome_processo: true,
      status_processo: true,
      fase_processo: true,
      vacuo_alvo: true,
      iniciado_em: true,
      finalizado_em: true,
    },
  },
  processostanques: {
    select: {
      id_processo_tanque: true,
      id_tanque: true,
      vacuo_alvo: true,
      status_tanque_processo: true,
      tanques: {
        select: {
          nome: true,
        },
      },
    },
  },
  processostanquessensores: {
    select: {
      id_processo_tanque_sensor: true,
      id_sensor: true,
      sensores: {
        select: {
          nome: true,
          modelo: true,
          unidade_medida: true,
          status_sensor: true,
        },
      },
    },
  },
  mqttmensagens: {
    select: {
      id_mqtt_mensagem: true,
      topico: true,
      direcao: true,
      origem: true,
      criado_em: true,
    },
  },
  usuarios: {
    select: {
      id_usuario: true,
      nome: true,
    },
  },
} satisfies Prisma.alarmesSelect;

export type AlarmeListRecord = Prisma.alarmesGetPayload<{
  select: typeof alarmListSelect;
}>;

export type AlarmeDetailsRecord = Prisma.alarmesGetPayload<{
  select: typeof alarmDetailsSelect;
}>;

type AlarmesGroupCount = {
  _count?:
    | true
    | {
        id_alarme?: number;
        _all?: number;
      };
};

export interface AlarmeFilters {
  page?: number;
  limit?: number;
  severidade?: severidadealarme;
  status_alarme?: statusalarme;
  tipo_alarme?: tipoalarme;
  origem_alarme?: origemalarme;
  id_processo?: number;
  id_processo_tanque?: number;
  id_processo_tanque_sensor?: number;
  id_mqtt_mensagem?: number;
  apenas_ativos?: boolean;
  apenas_criticos?: boolean;
  ocorrido_de?: Date;
  ocorrido_ate?: Date;
  busca?: string;
  order_by?: 'ocorrido_em' | 'severidade' | 'status_alarme' | 'tipo_alarme';
  order_direction?: 'asc' | 'desc';
}

export interface ResolveAlarmeRepositoryInput {
  id_usuario_responsavel: number;
  resolvido_em?: Date;
  motivo_resolucao?: motivoresolucaoalarme;
}

export interface AcknowledgeAlarmeRepositoryInput {
  id_usuario: number;
  observacao?: string | null;
  status_processo_snapshot?: string | null;
  fase_processo_snapshot?: string | null;
}

export interface RecoveryAttemptRepositoryInput {
  tipo_recuperacao: string;
  resultado: resultadotentativarecuperacaoalarme;
  descricao?: string | null;
  origem?: origemlogoperacional;
  executado_em?: Date;
}

export interface AlarmeListAndCountResult {
  data: AlarmeListRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface AlarmeDashboardRawData {
  total: number;
  ativos: number;
  resolvidos: number;
  criticos: number;
  medios: number;
  infos: number;
  por_severidade: Array<{ severidade: severidadealarme; total: number }>;
  por_status: Array<{ status_alarme: statusalarme; total: number }>;
  por_tipo: Array<{ tipo_alarme: tipoalarme; total: number }>;
  por_origem: Array<{ origem_alarme: origemalarme; total: number }>;
  ultimos_criticos: AlarmeListRecord[];
  ultimos_ativos: AlarmeListRecord[];
}

@Injectable()
export class AlarmesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: AlarmeFilters = {}): Promise<AlarmeListRecord[]> {
    const { skip, take } = this.normalizePagination(filters);

    return this.prisma.alarmes.findMany({
      where: this.buildWhere(filters),
      orderBy: this.buildOrderBy(filters),
      skip,
      take,
      select: alarmListSelect,
    });
  }

  async count(filters: AlarmeFilters = {}): Promise<number> {
    return this.prisma.alarmes.count({
      where: this.buildWhere(filters),
    });
  }

  async listAndCount(
    filters: AlarmeFilters = {},
  ): Promise<AlarmeListAndCountResult> {
    const { page, limit, skip, take } = this.normalizePagination(filters);
    const where = this.buildWhere(filters);
    const orderBy = this.buildOrderBy(filters);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.alarmes.findMany({
        where,
        orderBy,
        skip,
        take,
        select: alarmListSelect,
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

  async findById(id_alarme: number): Promise<AlarmeListRecord | null> {
    return this.prisma.alarmes.findFirst({
      where: {
        id_alarme,
        excluido_em: null,
      },
      select: alarmListSelect,
    });
  }

  async findDetailsById(
    id_alarme: number,
  ): Promise<AlarmeDetailsRecord | null> {
    return this.prisma.alarmes.findFirst({
      where: {
        id_alarme,
        excluido_em: null,
      },
      select: alarmDetailsSelect,
    });
  }

  async findActive(filters: AlarmeFilters = {}): Promise<AlarmeListRecord[]> {
    return this.list({
      ...filters,
      apenas_ativos: true,
    });
  }

  async findCritical(filters: AlarmeFilters = {}): Promise<AlarmeListRecord[]> {
    return this.list({
      ...filters,
      apenas_criticos: true,
    });
  }

  async findByProcess(
    id_processo: number,
    filters: AlarmeFilters = {},
  ): Promise<AlarmeListRecord[]> {
    return this.list({
      ...filters,
      id_processo,
    });
  }

  async findActiveByProcess(
    id_processo: number,
    filters: AlarmeFilters = {},
  ): Promise<AlarmeListRecord[]> {
    return this.list({
      ...filters,
      id_processo,
      apenas_ativos: true,
    });
  }

  async findCriticalByProcess(
    id_processo: number,
    filters: AlarmeFilters = {},
  ): Promise<AlarmeListRecord[]> {
    return this.list({
      ...filters,
      id_processo,
      apenas_criticos: true,
    });
  }

  async findActiveCriticalByProcess(
    id_processo: number,
  ): Promise<AlarmeListRecord[]> {
    return this.prisma.alarmes.findMany({
      where: {
        id_processo,
        status_alarme: statusalarme.ATIVO,
        resolvido_em: null,
        severidade: severidadealarme.CRITICO,
        excluido_em: null,
      },
      orderBy: {
        ocorrido_em: 'desc',
      },
      select: alarmListSelect,
    });
  }

  async getDashboard(
    filters: AlarmeFilters = {},
  ): Promise<AlarmeDashboardRawData> {
    const baseWhere = this.buildWhere(filters);
    const [
      total,
      ativos,
      resolvidos,
      normalizados,
      criticos,
      medios,
      infos,
      porSeveridade,
      porTipo,
      porOrigem,
      ultimosCriticos,
      ultimosAtivos,
    ] = await this.prisma.$transaction([
      this.prisma.alarmes.count({ where: baseWhere }),
      this.prisma.alarmes.count({
        where: this.withStatus(baseWhere, statusalarme.ATIVO),
      }),
      this.prisma.alarmes.count({
        where: this.withStatus(baseWhere, statusalarme.RESOLVIDO),
      }),
      this.prisma.alarmes.count({
        where: this.withStatus(baseWhere, statusalarme.NORMALIZADO),
      }),
      this.prisma.alarmes.count({
        where: this.withSeverity(baseWhere, severidadealarme.CRITICO),
      }),
      this.prisma.alarmes.count({
        where: this.withSeverity(baseWhere, severidadealarme.MEDIO),
      }),
      this.prisma.alarmes.count({
        where: this.withSeverity(baseWhere, severidadealarme.INFO),
      }),
      this.prisma.alarmes.groupBy({
        by: ['severidade'],
        where: baseWhere,
        orderBy: {
          severidade: 'asc',
        },
        _count: {
          id_alarme: true,
        },
      }),
      this.prisma.alarmes.groupBy({
        by: ['tipo_alarme'],
        where: baseWhere,
        orderBy: {
          tipo_alarme: 'asc',
        },
        _count: {
          id_alarme: true,
        },
      }),
      this.prisma.alarmes.groupBy({
        by: ['origem_alarme'],
        where: baseWhere,
        orderBy: {
          origem_alarme: 'asc',
        },
        _count: {
          id_alarme: true,
        },
      }),
      this.prisma.alarmes.findMany({
        where: this.withSeverity(baseWhere, severidadealarme.CRITICO),
        orderBy: {
          ocorrido_em: 'desc',
        },
        take: 5,
        select: alarmListSelect,
      }),
      this.prisma.alarmes.findMany({
        where: this.withStatus(baseWhere, statusalarme.ATIVO),
        orderBy: {
          ocorrido_em: 'desc',
        },
        take: 5,
        select: alarmListSelect,
      }),
    ]);

    return {
      total,
      ativos,
      resolvidos,
      criticos,
      medios,
      infos,
      por_severidade: porSeveridade.map((item) => ({
        severidade: item.severidade,
        total: this.getGroupTotal(item),
      })),
      por_status: [
        { status_alarme: statusalarme.ATIVO, total: ativos },
        { status_alarme: statusalarme.NORMALIZADO, total: normalizados },
        { status_alarme: statusalarme.RESOLVIDO, total: resolvidos },
      ],
      por_tipo: porTipo.map((item) => ({
        tipo_alarme: item.tipo_alarme,
        total: this.getGroupTotal(item),
      })),
      por_origem: porOrigem.map((item) => ({
        origem_alarme: item.origem_alarme,
        total: this.getGroupTotal(item),
      })),
      ultimos_criticos: ultimosCriticos,
      ultimos_ativos: ultimosAtivos,
    };
  }

  async resolve(
    id_alarme: number,
    input: ResolveAlarmeRepositoryInput,
  ): Promise<AlarmeListRecord | null> {
    const result = await this.prisma.alarmes.updateMany({
      where: {
        id_alarme,
        excluido_em: null,
      },
      data: {
        status_alarme: statusalarme.RESOLVIDO,
        resolvido_em: input.resolvido_em ?? new Date(),
        id_usuario_responsavel: input.id_usuario_responsavel,
        motivo_resolucao:
          input.motivo_resolucao ??
          motivoresolucaoalarme.FECHAMENTO_POS_PROCESSO,
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(id_alarme);
  }

  async acknowledge(
    id_alarme: number,
    input: AcknowledgeAlarmeRepositoryInput,
  ): Promise<AlarmeDetailsRecord | null> {
    const alarme = await this.prisma.alarmes.findFirst({
      where: {
        id_alarme,
        excluido_em: null,
      },
      select: {
        id_alarme: true,
      },
    });

    if (!alarme) {
      return null;
    }

    await this.prisma.alarmesreconhecimentos.create({
      data: {
        id_alarme,
        id_usuario: input.id_usuario,
        observacao: input.observacao ?? null,
        status_processo_snapshot: input.status_processo_snapshot ?? null,
        fase_processo_snapshot: input.fase_processo_snapshot ?? null,
      },
    });

    return this.findDetailsById(id_alarme);
  }

  async registerRecoveryAttempt(
    id_alarme: number,
    input: RecoveryAttemptRepositoryInput,
  ): Promise<AlarmeListRecord | null> {
    const executedAt = input.executado_em ?? new Date();

    await this.prisma.$transaction([
      this.prisma.alarmesrecuperacoestentativas.create({
        data: {
          id_alarme,
          tipo_recuperacao: input.tipo_recuperacao,
          resultado: input.resultado,
          descricao: input.descricao ?? null,
          origem: input.origem ?? origemlogoperacional.SISTEMA,
          executado_em: executedAt,
        },
      }),
      this.prisma.alarmes.updateMany({
        where: {
          id_alarme,
          excluido_em: null,
        },
        data: {
          tentativas_recuperacao: {
            increment: 1,
          },
          ultima_tentativa_recuperacao_em: executedAt,
          ultima_validacao_em: executedAt,
        },
      }),
    ]);

    return this.findById(id_alarme);
  }

  private normalizePagination(filters: AlarmeFilters): {
    page: number;
    limit: number;
    skip: number;
    take: number;
  } {
    const rawPage = filters.page ?? DEFAULT_ALARME_PAGE;
    const rawLimit = filters.limit ?? DEFAULT_ALARME_LIMIT;
    const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;
    const limit =
      Number.isInteger(rawLimit) && rawLimit >= 1
        ? Math.min(rawLimit, MAX_ALARME_LIMIT)
        : DEFAULT_ALARME_LIMIT;

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  private buildWhere(filters: AlarmeFilters = {}): Prisma.alarmesWhereInput {
    const where: Prisma.alarmesWhereInput = {
      excluido_em: null,
    };

    if (filters.severidade) {
      where.severidade = filters.severidade;
    }

    if (filters.status_alarme && !filters.apenas_ativos) {
      this.appendAndWhere(where, this.buildStatusWhere(filters.status_alarme));
    }

    if (filters.tipo_alarme) {
      where.tipo_alarme = filters.tipo_alarme;
    }

    if (filters.origem_alarme) {
      where.origem_alarme = filters.origem_alarme;
    }

    if (filters.id_processo) {
      where.id_processo = filters.id_processo;
    }

    if (filters.id_processo_tanque) {
      where.id_processo_tanque = filters.id_processo_tanque;
    }

    if (filters.id_processo_tanque_sensor) {
      where.id_processo_tanque_sensor = filters.id_processo_tanque_sensor;
    }

    if (filters.id_mqtt_mensagem) {
      where.id_mqtt_mensagem = filters.id_mqtt_mensagem;
    }

    if (filters.apenas_ativos) {
      this.appendAndWhere(where, this.buildStatusWhere(statusalarme.ATIVO));
    }

    if (filters.apenas_criticos) {
      where.severidade = severidadealarme.CRITICO;
    }

    if (filters.ocorrido_de || filters.ocorrido_ate) {
      where.ocorrido_em = {
        ...(filters.ocorrido_de ? { gte: filters.ocorrido_de } : {}),
        ...(filters.ocorrido_ate ? { lte: filters.ocorrido_ate } : {}),
      };
    }

    const busca = filters.busca?.trim();

    if (busca) {
      where.OR = [
        {
          titulo: {
            contains: busca,
            mode: 'insensitive',
          },
        },
        {
          descricao: {
            contains: busca,
            mode: 'insensitive',
          },
        },
      ];
    }

    return where;
  }

  private buildOrderBy(
    filters: AlarmeFilters = {},
  ): Prisma.alarmesOrderByWithRelationInput {
    const orderBy = this.resolveOrderByField(filters.order_by);
    const direction = this.resolveOrderDirection(filters.order_direction);

    switch (orderBy) {
      case 'severidade':
        return { severidade: direction };
      case 'status_alarme':
        return { status_alarme: direction };
      case 'tipo_alarme':
        return { tipo_alarme: direction };
      case 'ocorrido_em':
      default:
        return { ocorrido_em: direction };
    }
  }

  private resolveOrderByField(
    orderBy?: AlarmeFilters['order_by'],
  ): AlarmeFilters['order_by'] {
    if (orderBy && ALARME_ALLOWED_ORDER_BY_FIELDS.includes(orderBy)) {
      return orderBy;
    }

    return DEFAULT_ALARME_ORDER_BY;
  }

  private resolveOrderDirection(
    direction?: AlarmeFilters['order_direction'],
  ): AlarmeFilters['order_direction'] {
    if (direction && ALARME_ALLOWED_ORDER_DIRECTIONS.includes(direction)) {
      return direction;
    }

    return DEFAULT_ALARME_ORDER_DIRECTION;
  }

  private withStatus(
    where: Prisma.alarmesWhereInput,
    status: statusalarme,
  ): Prisma.alarmesWhereInput {
    return {
      AND: [where, this.buildStatusWhere(status)],
    };
  }

  private withSeverity(
    where: Prisma.alarmesWhereInput,
    severity: severidadealarme,
  ): Prisma.alarmesWhereInput {
    return {
      ...where,
      severidade: severity,
    };
  }

  private getGroupTotal(item: AlarmesGroupCount): number {
    if (!item._count || item._count === true) {
      return 0;
    }

    return item._count.id_alarme ?? item._count._all ?? 0;
  }

  private appendAndWhere(
    where: Prisma.alarmesWhereInput,
    condition: Prisma.alarmesWhereInput,
  ): void {
    const currentAnd = where.AND;
    const conditions = Array.isArray(currentAnd)
      ? currentAnd
      : currentAnd
        ? [currentAnd]
        : [];

    where.AND = [...conditions, condition];
  }

  private buildStatusWhere(status: statusalarme): Prisma.alarmesWhereInput {
    if (status === statusalarme.ATIVO) {
      return {
        status_alarme: statusalarme.ATIVO,
        resolvido_em: null,
        severidade: {
          in: [severidadealarme.MEDIO, severidadealarme.CRITICO],
        },
      };
    }

    if (status === statusalarme.RESOLVIDO) {
      return {
        OR: [
          { status_alarme: statusalarme.RESOLVIDO },
          { resolvido_em: { not: null } },
        ],
      };
    }

    if (status === statusalarme.NORMALIZADO) {
      return {
        status_alarme: statusalarme.NORMALIZADO,
        resolvido_em: null,
      };
    }

    return {
      status_alarme: status,
    };
  }
}
