import { Injectable } from '@nestjs/common';
import type { Prisma, statusprocesso } from '@prisma/client';
import type {
  HistoricoAlarmesResumo,
  HistoricoDiagnostico,
  HistoricoEventosResumo,
  HistoricoProcessoDetalheBase,
  HistoricoProcessoDetails,
  HistoricoProcessoListItem,
  HistoricoProcessoListResponse,
  HistoricoRelatorioSummary,
  HistoricoTanqueSummary,
  HistoricoUsuarioResumo,
  PaginationMeta,
} from '../interfaces';

type DecimalCompatible = Prisma.Decimal | number | string | null | undefined;

interface HistoricoUsuarioResumoRaw {
  id_usuario: number;
  nome: string;
}

interface HistoricoProcessoCountRaw {
  processostanques?: number;
  alarmes?: number;
  eventos?: number;
  relatorios?: number;
}

interface HistoricoProcessoListItemRaw {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  usuarios?: HistoricoUsuarioResumoRaw | null;
  vacuo_alvo: DecimalCompatible;
  vacuo_inicial: DecimalCompatible;
  vacuo_final: DecimalCompatible;
  vacuo_medio: DecimalCompatible;
  eficiencia: DecimalCompatible;
  tempo_maximo: number;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  criado_em: Date;
  parada_emergencia: boolean;
  _count?: HistoricoProcessoCountRaw;
  total_alarmes?: number;
  total_alarmes_criticos?: number;
  total_eventos?: number;
  possui_relatorio?: boolean;
}

interface HistoricoProcessoDetailsRaw extends HistoricoProcessoListItemRaw {
  pausado_em: Date | null;
  retomado_em: Date | null;
}

interface HistoricoProcessoDetailsMapperInput {
  processo: HistoricoProcessoDetailsRaw;
  tanques: HistoricoTanqueSummary[];
  resumo_alarmes: HistoricoAlarmesResumo;
  resumo_eventos: HistoricoEventosResumo;
  relatorios: HistoricoRelatorioSummary[];
  diagnostico: HistoricoDiagnostico;
}

@Injectable()
export class HistoricoProcessoMapper {
  toListItem(raw: HistoricoProcessoListItemRaw): HistoricoProcessoListItem {
    return {
      id_processo: raw.id_processo,
      nome_processo: raw.nome_processo,
      status_processo: raw.status_processo,
      usuario_responsavel: this.toUsuarioResumo(raw.usuarios),
      quantidade_tanques: this.toCount(raw._count?.processostanques),
      vacuo_alvo: this.decimalToNumber(raw.vacuo_alvo) ?? 0,
      vacuo_inicial: this.decimalToNumber(raw.vacuo_inicial),
      vacuo_final: this.decimalToNumber(raw.vacuo_final),
      vacuo_medio: this.decimalToNumber(raw.vacuo_medio),
      eficiencia: this.decimalToNumber(raw.eficiencia),
      tempo_maximo: raw.tempo_maximo,
      tempo_execucao: raw.tempo_execucao,
      iniciado_em: raw.iniciado_em,
      finalizado_em: raw.finalizado_em,
      criado_em: raw.criado_em,
      parada_emergencia: raw.parada_emergencia,
      total_alarmes: this.toCount(raw.total_alarmes ?? raw._count?.alarmes),
      total_alarmes_criticos: this.toCount(raw.total_alarmes_criticos),
      total_eventos: this.toCount(raw.total_eventos ?? raw._count?.eventos),
      possui_relatorio:
        raw.possui_relatorio ?? this.toCount(raw._count?.relatorios) > 0,
    };
  }

  toListResponse(params: {
    data: HistoricoProcessoListItemRaw[];
    page: number;
    limit: number;
    total: number;
  }): HistoricoProcessoListResponse {
    return {
      data: params.data.map((item) => this.toListItem(item)),
      meta: this.toPaginationMeta(params.page, params.limit, params.total),
    };
  }

  toPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
    const safePage = this.toPositiveInteger(page, 1);
    const safeLimit = this.toPositiveInteger(limit, 1);
    const safeTotal = this.toNonNegativeInteger(total);
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

  toDetailsBase(
    raw: HistoricoProcessoDetailsRaw,
  ): HistoricoProcessoDetalheBase {
    return {
      id_processo: raw.id_processo,
      nome_processo: raw.nome_processo,
      status_processo: raw.status_processo,
      usuario_responsavel: this.toUsuarioResumo(raw.usuarios),
      vacuo_alvo: this.decimalToNumber(raw.vacuo_alvo) ?? 0,
      vacuo_inicial: this.decimalToNumber(raw.vacuo_inicial),
      vacuo_final: this.decimalToNumber(raw.vacuo_final),
      vacuo_medio: this.decimalToNumber(raw.vacuo_medio),
      eficiencia: this.decimalToNumber(raw.eficiencia),
      tempo_maximo: raw.tempo_maximo,
      tempo_execucao: raw.tempo_execucao,
      iniciado_em: raw.iniciado_em,
      pausado_em: raw.pausado_em,
      retomado_em: raw.retomado_em,
      finalizado_em: raw.finalizado_em,
      criado_em: raw.criado_em,
      parada_emergencia: raw.parada_emergencia,
    };
  }

  toDetails(
    params: HistoricoProcessoDetailsMapperInput,
  ): HistoricoProcessoDetails {
    return {
      processo: this.toDetailsBase(params.processo),
      tanques: params.tanques ?? [],
      resumo_alarmes: params.resumo_alarmes,
      resumo_eventos: params.resumo_eventos,
      relatorios: params.relatorios ?? [],
      diagnostico: params.diagnostico,
    };
  }

  private toUsuarioResumo(
    raw?: HistoricoUsuarioResumoRaw | null,
  ): HistoricoUsuarioResumo | null {
    if (!raw) {
      return null;
    }

    return {
      id_usuario: raw.id_usuario,
      nome: raw.nome,
    };
  }

  private decimalToNumber(value: DecimalCompatible): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      return this.stringToNumber(value);
    }

    return this.stringToNumber(value.toString());
  }

  private stringToNumber(value: string): number | null {
    const parsed = Number(value.trim());

    return Number.isFinite(parsed) ? parsed : null;
  }

  private toCount(value: number | null | undefined): number {
    return Number.isFinite(value) && value !== null && value !== undefined
      ? Math.max(0, Math.trunc(value))
      : 0;
  }

  private toPositiveInteger(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
  }

  private toNonNegativeInteger(value: number): number {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  }
}
