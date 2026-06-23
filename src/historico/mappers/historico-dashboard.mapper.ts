import { Injectable } from '@nestjs/common';
import type {
  HistoricoAlarmSeverityChartPoint,
  HistoricoDashboardResponse,
  HistoricoEfficiencyTimePoint,
  HistoricoExecutionTimePoint,
  HistoricoKpis,
  HistoricoProcessoListItem,
  HistoricoStatusChartPoint,
  HistoricoTanqueRankingItem,
  HistoricoTimeSeriesPoint,
} from '../interfaces';

interface HistoricoDashboardMapperInput {
  kpis: HistoricoKpis;
  processos_por_status?: HistoricoStatusChartPoint[] | null;
  processos_por_periodo?: HistoricoTimeSeriesPoint[] | null;
  eficiencia_por_periodo?: HistoricoEfficiencyTimePoint[] | null;
  tempo_execucao_por_periodo?: HistoricoExecutionTimePoint[] | null;
  alarmes_por_severidade?: HistoricoAlarmSeverityChartPoint[] | null;
  comparativo_tanques?: HistoricoTanqueRankingItem[] | null;
  processos_problematicos?: HistoricoProcessoListItem[] | null;
}

@Injectable()
export class HistoricoDashboardMapper {
  toDashboardResponse(
    input: HistoricoDashboardMapperInput,
  ): HistoricoDashboardResponse {
    return {
      kpis: input.kpis,
      processos_por_status: input.processos_por_status ?? [],
      processos_por_periodo: input.processos_por_periodo ?? [],
      eficiencia_por_periodo: input.eficiencia_por_periodo ?? [],
      tempo_execucao_por_periodo: input.tempo_execucao_por_periodo ?? [],
      alarmes_por_severidade: input.alarmes_por_severidade ?? [],
      comparativo_tanques: input.comparativo_tanques ?? [],
      processos_problematicos: input.processos_problematicos ?? [],
    };
  }
}
