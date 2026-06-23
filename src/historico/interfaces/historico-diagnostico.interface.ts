export type HistoricoClassificacaoResultado = 'NORMAL' | 'ATENCAO' | 'CRITICO';

export interface HistoricoDiagnostico {
  classificacao_resultado: HistoricoClassificacaoResultado;
  motivos: string[];
  recomendacoes: string[];
}
