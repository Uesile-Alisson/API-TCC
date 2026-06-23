export interface HistoricoTanqueRankingItem {
  id_tanque: number;
  nome_tanque: string;
  total_processos: number;
  total_concluidos: number;
  total_falhas: number;
  eficiencia_media: number | null;
  tempo_execucao_medio: number | null;
  vacuo_medio: number | null;
  total_alarmes: number;
  total_alarmes_criticos: number;
}

export interface HistoricoTanqueComparisonResponse {
  data: HistoricoTanqueRankingItem[];
}
