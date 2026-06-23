import type {
  severidadealarme,
  severidadeevento,
  statusalarme,
  statusprocesso,
} from '@prisma/client';

export type HistoricoNumericValue = number | null | undefined;

export interface HistoricoProcessAnalyticsInput {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  vacuo_alvo: number | null;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  tempo_maximo: number | null;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  criado_em: Date;
  parada_emergencia: boolean;
  total_alarmes: number;
  total_alarmes_criticos: number;
  total_eventos: number;
  possui_relatorio: boolean;
}

export interface HistoricoTankAnalyticsInput {
  id_tanque: number;
  nome_tanque: string;
  status_tanque_processo?: string;
  vacuo_alvo: number | null;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  tempo_execucao?: number | null;
  total_alarmes: number;
  total_alarmes_criticos: number;
  quantidade_leituras: number;
}

export interface HistoricoAlarmAnalyticsInput {
  id_alarme: number;
  severidade: severidadealarme;
  status_alarme: statusalarme;
  ocorrido_em: Date;
  resolvido_em: Date | null;
}

export interface HistoricoEventAnalyticsInput {
  id_evento_processo: number;
  severidade_evento: severidadeevento;
  ocorrido_em: Date;
}

export interface HistoricoDashboardAnalyticsInput {
  processos: HistoricoProcessAnalyticsInput[];
  tanques: HistoricoTankAnalyticsInput[];
  alarmes: HistoricoAlarmAnalyticsInput[];
  eventos: HistoricoEventAnalyticsInput[];
}

export type HistoricoPeriodGrouping = 'DIA' | 'SEMANA' | 'MES';

export interface HistoricoProcessProblemReason {
  code: string;
  message: string;
}

export interface HistoricoProblematicProcessResult {
  processo: HistoricoProcessAnalyticsInput;
  score: number;
  motivos: HistoricoProcessProblemReason[];
}

export interface HistoricoDashboardSeriesInput {
  processos: HistoricoProcessAnalyticsInput[];
  agrupamento: HistoricoPeriodGrouping;
  campo_data: 'criado_em' | 'iniciado_em' | 'finalizado_em';
}
