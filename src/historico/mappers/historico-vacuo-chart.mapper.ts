import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  HistoricoVacuoChartPoint,
  HistoricoVacuoChartResponse,
} from '../interfaces';

type DecimalCompatible = Prisma.Decimal | number | string | null | undefined;

interface HistoricoVacuoChartPointRaw {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  valor_vacuo: DecimalCompatible;
  leitura_em: Date;
  recebido_em: Date;
  processostanquessensores?: {
    id_sensor: number;
    sensores?: {
      id_sensor: number;
      nome: string;
    } | null;
    processostanques?: {
      id_tanque: number;
      tanques?: {
        id_tanque: number;
        nome: string;
      } | null;
    } | null;
  } | null;
}

interface HistoricoVacuoChartMapperInput {
  id_processo: number;
  vacuo_alvo: DecimalCompatible;
  data: HistoricoVacuoChartPointRaw[];
}

@Injectable()
export class HistoricoVacuoChartMapper {
  toPoint(raw: HistoricoVacuoChartPointRaw): HistoricoVacuoChartPoint {
    const processoTanqueSensor = raw.processostanquessensores;
    const processoTanque = processoTanqueSensor?.processostanques;

    return {
      id_leitura_sensor: raw.id_leitura_sensor,
      id_processo_tanque_sensor: raw.id_processo_tanque_sensor,
      id_tanque: processoTanque?.id_tanque ?? 0,
      nome_tanque: processoTanque?.tanques?.nome ?? 'Tanque não identificado',
      id_sensor: processoTanqueSensor?.id_sensor ?? 0,
      nome_sensor:
        processoTanqueSensor?.sensores?.nome ?? 'Sensor não identificado',
      valor_vacuo: this.decimalToNumber(raw.valor_vacuo) ?? 0,
      leitura_em: raw.leitura_em,
      recebido_em: raw.recebido_em,
    };
  }

  toPointList(raw: HistoricoVacuoChartPointRaw[]): HistoricoVacuoChartPoint[] {
    return raw.map((item) => this.toPoint(item));
  }

  toResponse(
    input: HistoricoVacuoChartMapperInput,
  ): HistoricoVacuoChartResponse {
    // As leituras não possuem id_processo direto. O repository deve buscar os pontos via leiturasensores -> processostanquessensores -> processostanques -> processos.
    const data = this.toPointList(input.data ?? []);

    return {
      id_processo: input.id_processo,
      vacuo_alvo: this.decimalToNumber(input.vacuo_alvo) ?? 0,
      total_pontos: data.length,
      data,
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
