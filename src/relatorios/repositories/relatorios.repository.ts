import { Injectable } from '@nestjs/common';
import { formatorelatorio, Prisma, tiporelatorio } from '@prisma/client';

import {
  RELATORIO_ALLOWED_ORDER_BY_FIELDS,
  RELATORIO_ALLOWED_ORDER_DIRECTIONS,
  RELATORIO_DEFAULT_LIMIT,
  RELATORIO_DEFAULT_ORDER_BY,
  RELATORIO_DEFAULT_ORDER_DIRECTION,
  RELATORIO_DEFAULT_PAGE,
  RELATORIO_MAX_LIMIT,
  type RelatorioOrderByField,
  type RelatorioOrderDirection,
} from '../constants';
import { ListRelatoriosQueryDto } from '../dto';
import { PrismaService } from '../../prisma/prisma.service';

const relatorioWithRelationsSelect = {
  id_relatorio: true,
  id_usuario: true,
  id_processo: true,
  id_alarme: true,
  tipo_relatorio: true,
  formato_relatorio: true,
  titulo: true,
  descricao: true,
  nome_arquivo: true,
  hash_arquivo: true,
  tamanho_bytes: true,
  gerado_em: true,
  gridfs_file_id: true,
  content_type: true,
  bucket_name: true,
  storage_provider: true,
  usuarios: {
    select: {
      id_usuario: true,
      nome: true,
    },
  },
  processos: {
    select: {
      id_processo: true,
      nome_processo: true,
      status_processo: true,
    },
  },
  alarmes: {
    select: {
      id_alarme: true,
      titulo: true,
      severidade: true,
      status_alarme: true,
      ocorrido_em: true,
    },
  },
} satisfies Prisma.relatoriosSelect;

const relatorioFileMetadataSelect = {
  id_relatorio: true,
  tipo_relatorio: true,
  formato_relatorio: true,
  nome_arquivo: true,
  gridfs_file_id: true,
  content_type: true,
  bucket_name: true,
  storage_provider: true,
  tamanho_bytes: true,
  id_usuario: true,
  id_processo: true,
  id_alarme: true,
} satisfies Prisma.relatoriosSelect;

export type RelatorioWithRelations = Prisma.relatoriosGetPayload<{
  select: typeof relatorioWithRelationsSelect;
}>;

export type RelatorioFileMetadataRecord = Prisma.relatoriosGetPayload<{
  select: typeof relatorioFileMetadataSelect;
}>;

export interface CreateRelatorioMetadataInput {
  id_usuario: number;
  id_processo?: number | null;
  id_alarme?: number | null;
  tipo_relatorio: tiporelatorio;
  formato_relatorio: formatorelatorio;
  titulo: string;
  descricao?: string | null;
  nome_arquivo: string;
  hash_arquivo?: string | null;
  tamanho_bytes?: number | bigint | null;
  gridfs_file_id: string;
  content_type: string;
  bucket_name: string;
  storage_provider: string;
  gerado_em?: Date;
}

export interface FindManyRelatoriosResult {
  data: RelatorioWithRelations[];
  total: number;
}

@Injectable()
export class RelatoriosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    query: ListRelatoriosQueryDto,
  ): Promise<FindManyRelatoriosResult> {
    const page = this.normalizePage(query.page);
    const limit = this.normalizeLimit(query.limit);
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.relatorios.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: relatorioWithRelationsSelect,
      }),
      this.prisma.relatorios.count({ where }),
    ]);

    return {
      data,
      total,
    };
  }

  async findById(id_relatorio: number): Promise<RelatorioWithRelations | null> {
    return this.prisma.relatorios.findUnique({
      where: {
        id_relatorio,
      },
      select: relatorioWithRelationsSelect,
    });
  }

  async findFileMetadataById(
    id_relatorio: number,
  ): Promise<RelatorioFileMetadataRecord | null> {
    return this.prisma.relatorios.findUnique({
      where: {
        id_relatorio,
      },
      select: relatorioFileMetadataSelect,
    });
  }

  async existsByProcessAndFormat(
    id_processo: number,
    formato_relatorio: formatorelatorio,
  ): Promise<boolean> {
    const relatorio = await this.prisma.relatorios.findFirst({
      where: {
        tipo_relatorio: tiporelatorio.PROCESSO,
        id_processo,
        formato_relatorio,
      },
      select: {
        id_relatorio: true,
      },
    });

    return relatorio !== null;
  }

  async existsByAlarmAndFormat(
    id_alarme: number,
    formato_relatorio: formatorelatorio,
  ): Promise<boolean> {
    const relatorio = await this.prisma.relatorios.findFirst({
      where: {
        tipo_relatorio: tiporelatorio.ALARME,
        id_alarme,
        formato_relatorio,
      },
      select: {
        id_relatorio: true,
      },
    });

    return relatorio !== null;
  }

  async existsByGridFsFileId(gridfs_file_id: string): Promise<boolean> {
    const relatorio = await this.prisma.relatorios.findFirst({
      where: { gridfs_file_id },
      select: { id_relatorio: true },
    });

    return relatorio !== null;
  }

  async create(
    data: CreateRelatorioMetadataInput,
  ): Promise<RelatorioWithRelations> {
    return this.prisma.relatorios.create({
      data: {
        id_usuario: data.id_usuario,
        id_processo: data.id_processo ?? null,
        id_alarme: data.id_alarme ?? null,
        tipo_relatorio: data.tipo_relatorio,
        formato_relatorio: data.formato_relatorio,
        titulo: data.titulo,
        descricao: data.descricao ?? null,
        nome_arquivo: data.nome_arquivo,
        hash_arquivo: data.hash_arquivo ?? null,
        tamanho_bytes: this.normalizeBigInt(data.tamanho_bytes),
        gridfs_file_id: data.gridfs_file_id,
        content_type: data.content_type,
        bucket_name: data.bucket_name,
        storage_provider: data.storage_provider,
        gerado_em: data.gerado_em,
      },
      select: relatorioWithRelationsSelect,
    });
  }

  async countByProcess(id_processo: number): Promise<number> {
    return this.prisma.relatorios.count({
      where: {
        id_processo,
        tipo_relatorio: tiporelatorio.PROCESSO,
      },
    });
  }

  async countByAlarm(id_alarme: number): Promise<number> {
    return this.prisma.relatorios.count({
      where: {
        id_alarme,
        tipo_relatorio: tiporelatorio.ALARME,
      },
    });
  }

  private buildWhere(
    query: ListRelatoriosQueryDto,
  ): Prisma.relatoriosWhereInput {
    const where: Prisma.relatoriosWhereInput = {};

    if (query.tipo_relatorio) {
      where.tipo_relatorio = query.tipo_relatorio;
    }

    if (query.formato_relatorio) {
      where.formato_relatorio = query.formato_relatorio;
    }

    if (query.id_processo !== undefined) {
      where.id_processo = query.id_processo;
    }

    if (query.id_alarme !== undefined) {
      where.id_alarme = query.id_alarme;
    }

    if (query.id_usuario !== undefined) {
      where.id_usuario = query.id_usuario;
    }

    if (query.data_inicio || query.data_fim) {
      where.gerado_em = {
        ...(query.data_inicio ? { gte: query.data_inicio } : {}),
        ...(query.data_fim ? { lte: query.data_fim } : {}),
      };
    }

    return where;
  }

  private buildOrderBy(
    query: ListRelatoriosQueryDto,
  ): Prisma.relatoriosOrderByWithRelationInput {
    const orderBy = this.resolveOrderByField(query.order_by);
    const direction = this.resolveOrderDirection(query.order_direction);

    return {
      [orderBy]: direction,
    };
  }

  private normalizePage(value?: number): number {
    return Number.isInteger(value) && value !== undefined && value >= 1
      ? value
      : RELATORIO_DEFAULT_PAGE;
  }

  private normalizeLimit(value?: number): number {
    const limit =
      Number.isInteger(value) && value !== undefined && value >= 1
        ? value
        : RELATORIO_DEFAULT_LIMIT;

    return Math.min(limit, RELATORIO_MAX_LIMIT);
  }

  private resolveOrderByField(value?: string): RelatorioOrderByField {
    if (value && this.isAllowedOrderByField(value)) {
      return value;
    }

    return RELATORIO_DEFAULT_ORDER_BY;
  }

  private resolveOrderDirection(value?: string): RelatorioOrderDirection {
    if (value && this.isAllowedOrderDirection(value)) {
      return value;
    }

    return RELATORIO_DEFAULT_ORDER_DIRECTION;
  }

  private isAllowedOrderByField(value: string): value is RelatorioOrderByField {
    return RELATORIO_ALLOWED_ORDER_BY_FIELDS.some((field) => field === value);
  }

  private isAllowedOrderDirection(
    value: string,
  ): value is RelatorioOrderDirection {
    return RELATORIO_ALLOWED_ORDER_DIRECTIONS.some(
      (direction) => direction === value,
    );
  }

  private normalizeBigInt(
    value?: number | bigint | null,
  ): bigint | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    return typeof value === 'bigint' ? value : BigInt(value);
  }
}
