export interface ProcessoOperationalSummary {
  id_processo: number;
  total_leituras: number;
  total_eventos: number;
  primeira_leitura_em: Date | null;
  ultima_leitura_em: Date | null;
  primeiro_evento_em: Date | null;
  ultimo_evento_em: Date | null;
  vacuo_minimo: number | null;
  vacuo_maximo: number | null;
  vacuo_medio: number | null;
  eventos_criticos: number;
  eventos_medios: number;
  eventos_info: number;
  generated_at: Date;
}
