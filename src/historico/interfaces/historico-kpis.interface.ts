import type { HistoricoTanqueRankingItem } from './historico-tanque-comparison.interface';

export interface HistoricoKpis {
  total_processos: number;
  total_concluidos: number;
  total_interrompidos: number;
  total_falhas: number;
  taxa_sucesso_percentual: number;
  eficiencia_media: number | null;
  tempo_execucao_medio: number | null;
  tempo_execucao_total: number;
  vacuo_medio_geral: number | null;
  vacuo_final_medio: number | null;
  processos_com_parada_emergencia: number;
  total_alarmes: number;
  total_alarmes_criticos: number;
  media_alarmes_por_processo: number | null;
}

export interface HistoricoTanqueDestaqueKpis {
  tanque_mais_utilizado: HistoricoTanqueRankingItem | null;
  tanque_com_melhor_eficiencia: HistoricoTanqueRankingItem | null;
  tanque_com_pior_eficiencia: HistoricoTanqueRankingItem | null;
}
