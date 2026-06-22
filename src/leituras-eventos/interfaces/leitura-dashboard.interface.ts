export interface LeituraDashboard {
  total_leituras: number;
  leituras_ultima_hora: number;
  leituras_hoje: number;
  sensores_com_leitura: number;
  processos_com_leitura: number;
  vacuo_minimo: number | null;
  vacuo_maximo: number | null;
  vacuo_medio: number | null;
  primeira_leitura_em: Date | null;
  ultima_leitura_em: Date | null;
  generated_at: Date;
}
