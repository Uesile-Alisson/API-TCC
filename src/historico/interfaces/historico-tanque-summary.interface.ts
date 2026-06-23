import type { statustanqueprocesso } from '@prisma/client';

export interface HistoricoTanqueSummary {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
  status_tanque_processo: statustanqueprocesso;
  vacuo_alvo: number;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  quantidade_sensores: number;
  quantidade_leituras: number;
  total_alarmes: number;
  total_alarmes_criticos: number;
}
