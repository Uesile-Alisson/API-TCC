import {
  ProcessoMetrics,
  ProcessoTanqueMetrics,
} from '../interfaces/processo-metrics.interface';

export interface ProcessoMetricReading {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  id_processo_tanque: number;
  id_tanque: number;
  valor_vacuo: number | null;
  leitura_em: Date;
}

export interface ProcessoMetricTanque {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
  vacuo_alvo: number;
  leituras: ProcessoMetricReading[];
}

export interface ProcessoMetricsInput {
  id_processo: number;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  tempo_execucao: number | null;
  tanques: ProcessoMetricTanque[];
  total_alarmes: number;
  total_eventos: number;
  total_sensores?: number;
}

export type ProcessoTanqueCalculatedMetrics = ProcessoTanqueMetrics;

export type ProcessoCalculatedMetrics = ProcessoMetrics;
