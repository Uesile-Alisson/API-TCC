import { Injectable } from '@nestjs/common';
import { formatorelatorio } from '@prisma/client';

import type {
  PaginationMeta,
  RelatorioListResponse,
  RelatorioResponse,
} from '../interfaces';
import type {
  RelatorioFileMetadataRecord,
  RelatorioWithRelations,
} from '../repositories';

export interface ToRelatorioListResponseParams {
  records: RelatorioWithRelations[];
  total: number;
  page: number;
  limit: number;
}

export interface ToPaginationMetaParams {
  total: number;
  page: number;
  limit: number;
}

export interface RelatorioFileAvailability {
  possui_arquivo: boolean;
  preview_disponivel: boolean;
  download_disponivel: boolean;
}

@Injectable()
export class RelatorioMapper {
  toResponse(record: RelatorioWithRelations): RelatorioResponse {
    const availability = this.toFileAvailability(record);

    return {
      id_relatorio: record.id_relatorio,
      id_usuario: record.id_usuario,
      id_processo: record.id_processo,
      id_alarme: record.id_alarme,
      tipo_relatorio: record.tipo_relatorio,
      formato_relatorio: record.formato_relatorio,
      titulo: record.titulo,
      descricao: this.stringOrNull(record.descricao),
      nome_arquivo: record.nome_arquivo,
      tamanho_bytes: this.bigIntToNumber(record.tamanho_bytes),
      content_type: this.stringOrNull(record.content_type),
      gerado_em: record.gerado_em,
      gerado_por: record.usuarios
        ? {
            id_usuario: record.usuarios.id_usuario,
            nome: record.usuarios.nome,
          }
        : null,
      processo: record.processos
        ? {
            id_processo: record.processos.id_processo,
            nome_processo: this.stringOrNull(record.processos.nome_processo),
            status_processo: record.processos.status_processo,
          }
        : null,
      alarme: record.alarmes
        ? {
            id_alarme: record.alarmes.id_alarme,
            titulo: record.alarmes.titulo,
            severidade: record.alarmes.severidade,
            status_alarme: record.alarmes.status_alarme,
            ocorrido_em: record.alarmes.ocorrido_em,
          }
        : null,
      ...availability,
    };
  }

  toListResponse(params: ToRelatorioListResponseParams): RelatorioListResponse {
    return {
      data: params.records.map((record) => this.toResponse(record)),
      meta: this.toPaginationMeta({
        total: params.total,
        page: params.page,
        limit: params.limit,
      }),
    };
  }

  toPaginationMeta(params: ToPaginationMetaParams): PaginationMeta {
    const page = params.page > 0 ? params.page : 1;
    const limit = params.limit > 0 ? params.limit : 20;
    const total = Math.max(params.total, 0);
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next_page: page < totalPages,
      has_previous_page: page > 1,
    };
  }

  hasStoredFile(
    record: RelatorioWithRelations | RelatorioFileMetadataRecord,
  ): boolean {
    return Boolean(
      this.stringOrNull(record.gridfs_file_id) &&
      this.stringOrNull(record.nome_arquivo) &&
      this.stringOrNull(record.content_type),
    );
  }

  toFileAvailability(
    record: RelatorioWithRelations | RelatorioFileMetadataRecord,
  ): RelatorioFileAvailability {
    const possuiArquivo = this.hasStoredFile(record);

    return {
      possui_arquivo: possuiArquivo,
      preview_disponivel:
        possuiArquivo && record.formato_relatorio === formatorelatorio.PDF,
      download_disponivel: possuiArquivo,
    };
  }

  private bigIntToNumber(
    value: bigint | number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private stringOrNull(value: string | null | undefined): string | null {
    const normalized = value?.trim();

    return normalized && normalized.length > 0 ? normalized : null;
  }
}
