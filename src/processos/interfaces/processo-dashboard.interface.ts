import {
  severidadealarme,
  statusprocesso,
  statustanqueprocesso,
} from '@prisma/client';

export interface ProcessoDashboardReadingPoint {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  id_tanque: number;
  id_sensor: number;
  valor_vacuo: number;
  leitura_em: Date;
}

export interface ProcessoDashboardTanque {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
  status_tanque_processo: statustanqueprocesso;
  vacuo_alvo: number;
  vacuo_atual: number | null;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  total_sensores: number;
  total_leituras: number;
  leituras: ProcessoDashboardReadingPoint[];
}

export interface ProcessoDashboardAlarmSummary {
  total: number;
  criticos: number;
  medios: number;
  infos: number;
  ultima_severidade: severidadealarme | null;
}

export interface ProcessoDashboardData {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  vacuo_alvo: number;
  vacuo_atual: number | null;
  tempo_maximo: number;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  progresso_percentual: number;
  tanques: ProcessoDashboardTanque[];
  alarmes: ProcessoDashboardAlarmSummary;
}
