import { Injectable } from '@nestjs/common';
import {
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type {
  HistoricoAlarmeSummary,
  HistoricoAlarmesResumo,
} from '../interfaces';

type DecimalCompatible = Prisma.Decimal | number | string | null | undefined;

interface HistoricoAlarmeSummaryRaw {
  id_alarme: number;
  titulo: string;
  descricao: string;
  tipo_alarme: tipoalarme;
  severidade: severidadealarme;
  status_alarme: statusalarme;
  origem_alarme: origemalarme;
  valor_detectado: DecimalCompatible;
  unidade: string | null;
  ocorrido_em: Date;
  resolvido_em: Date | null;
  id_processo: number | null;
  id_processo_tanque: number | null;
  id_processo_tanque_sensor: number | null;
}

@Injectable()
export class HistoricoAlarmeMapper {
  toSummary(raw: HistoricoAlarmeSummaryRaw): HistoricoAlarmeSummary {
    return {
      id_alarme: raw.id_alarme,
      titulo: raw.titulo,
      descricao: raw.descricao,
      tipo_alarme: raw.tipo_alarme,
      severidade: raw.severidade,
      status_alarme: raw.status_alarme,
      origem_alarme: raw.origem_alarme,
      valor_detectado: this.decimalToNumber(raw.valor_detectado),
      unidade: raw.unidade,
      ocorrido_em: raw.ocorrido_em,
      resolvido_em: raw.resolvido_em,
      id_processo: raw.id_processo,
      id_processo_tanque: raw.id_processo_tanque,
      id_processo_tanque_sensor: raw.id_processo_tanque_sensor,
    };
  }

  toSummaryList(raw: HistoricoAlarmeSummaryRaw[]): HistoricoAlarmeSummary[] {
    return raw.map((item) => this.toSummary(item));
  }

  toResumo(raw: HistoricoAlarmeSummaryRaw[]): HistoricoAlarmesResumo {
    return {
      total: raw.length,
      info: raw.filter((item) => item.severidade === severidadealarme.INFO)
        .length,
      medio: raw.filter((item) => item.severidade === severidadealarme.MEDIO)
        .length,
      critico: raw.filter(
        (item) => item.severidade === severidadealarme.CRITICO,
      ).length,
      ativos: raw.filter((item) => item.status_alarme === statusalarme.ATIVO)
        .length,
      resolvidos: raw.filter(
        (item) => item.status_alarme === statusalarme.RESOLVIDO,
      ).length,
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
}
