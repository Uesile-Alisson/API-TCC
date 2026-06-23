import type {
  HistoricoAlarmSeverityChartPoint,
  HistoricoEfficiencyTimePoint,
  HistoricoExecutionTimePoint,
  HistoricoStatusChartPoint,
  HistoricoTimeSeriesPoint,
} from './historico-chart-point.interface';
import type { HistoricoKpis } from './historico-kpis.interface';
import type { HistoricoProcessoListItem } from './historico-processo-list-item.interface';
import type { HistoricoTanqueRankingItem } from './historico-tanque-comparison.interface';

export interface HistoricoDashboardResponse {
  kpis: HistoricoKpis;
  processos_por_status: HistoricoStatusChartPoint[];
  processos_por_periodo: HistoricoTimeSeriesPoint[];
  eficiencia_por_periodo: HistoricoEfficiencyTimePoint[];
  tempo_execucao_por_periodo: HistoricoExecutionTimePoint[];
  alarmes_por_severidade: HistoricoAlarmSeverityChartPoint[];
  comparativo_tanques: HistoricoTanqueRankingItem[];
  processos_problematicos: HistoricoProcessoListItem[];
}
