export interface ProcessoTanqueMetrics {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
  vacuo_alvo: number;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  total_leituras: number;
}

export interface ProcessoMetrics {
  id_processo: number;
  vacuo_alvo: number;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  tempo_execucao: number | null;
  total_tanques: number;
  total_sensores: number;
  total_leituras: number;
  total_alarmes: number;
  total_eventos: number;
  tanques: ProcessoTanqueMetrics[];
}
