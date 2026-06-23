import type { severidadealarme, statusprocesso } from '@prisma/client';

export interface HistoricoChartPoint {
  label: string;
  value: number;
}

export interface HistoricoTimeSeriesPoint {
  periodo: string;
  valor: number;
}

export interface HistoricoStatusChartPoint {
  status_processo: statusprocesso;
  total: number;
}

export interface HistoricoAlarmSeverityChartPoint {
  severidade: severidadealarme;
  total: number;
}

export interface HistoricoEfficiencyTimePoint {
  periodo: string;
  eficiencia_media: number | null;
}

export interface HistoricoExecutionTimePoint {
  periodo: string;
  tempo_execucao_medio: number | null;
}
