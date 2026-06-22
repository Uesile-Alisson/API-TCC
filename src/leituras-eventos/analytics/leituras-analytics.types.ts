export interface LeituraAnalyticsInput {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  valor_vacuo: unknown;
  leitura_em: Date;
  recebido_em?: Date | null;
}

export interface LeituraValorNormalizado {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  valor_vacuo: number | null;
  leitura_em: Date;
  recebido_em: Date | null;
}

export interface LeiturasStats {
  total_leituras: number;
  total_leituras_validas: number;
  total_leituras_invalidas: number;
  vacuo_minimo: number | null;
  vacuo_maximo: number | null;
  vacuo_medio: number | null;
  primeira_leitura_em: Date | null;
  ultima_leitura_em: Date | null;
  primeiro_valor_vacuo: number | null;
  ultimo_valor_vacuo: number | null;
  variacao_vacuo: number | null;
}

export interface LeiturasPeriodoAnalise {
  inicio: Date | null;
  fim: Date | null;
  duracao_ms: number | null;
  duracao_segundos: number | null;
  duracao_minutos: number | null;
}

export interface LeiturasAnalyticsResult {
  stats: LeiturasStats;
  periodo: LeiturasPeriodoAnalise;
  generated_at: Date;
}
