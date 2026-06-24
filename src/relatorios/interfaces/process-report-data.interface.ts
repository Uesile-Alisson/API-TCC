import type {
  origemalarme,
  origemevento,
  severidadealarme,
  severidadeevento,
  statusalarme,
  statusprocesso,
  statustanqueprocesso,
  tipoalarme,
  tipoeventoprocesso,
  tipoleiturasensor,
  tiposensorprocesso,
} from '@prisma/client';

import type { RelatorioGenerationContext } from './relatorio-generation-result.interface';

export interface ProcessReportData {
  processo: ProcessReportProcessInfo;
  usuario_responsavel: ProcessReportUserInfo | null;
  tanques: ProcessReportTankInfo[];
  sensores: ProcessReportSensorInfo[];
  leituras: ProcessReportReadingInfo[];
  eventos: ProcessReportEventInfo[];
  alarmes: ProcessReportAlarmInfo[];
  resumo: ProcessReportSummary;
  diagnostico: ProcessReportDiagnostic;
  contexto_geracao: RelatorioGenerationContext;
}

export interface ProcessReportProcessInfo {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  vacuo_alvo: number;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  tempo_maximo: number;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  pausado_em: Date | null;
  retomado_em: Date | null;
  finalizado_em: Date | null;
  parada_emergencia: boolean;
  criado_em: Date;
}

export interface ProcessReportUserInfo {
  id_usuario: number;
  nome: string;
}

export interface ProcessReportTankInfo {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
  status_tanque_processo: statustanqueprocesso;
  volume: number | null;
  unidade_volume: string | null;
  vacuo_alvo: number;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  total_sensores: number;
  total_leituras: number;
  total_alarmes: number;
  volume_alvo_ml?: number | null;
  volume_enviado_ml?: number | null;
  vazao_atual_l_min?: number | null;
  nivel_atual_percentual?: number | null;
}

export interface ProcessReportSensorInfo {
  id_sensor: number;
  nome: string;
  modelo: string;
  protocolo: string;
  unidade_medida: string;
  tipo_sensor_processo: tiposensorprocesso | null;
  status_sensor: string;
  ultima_leitura: Date | null;
  ultimo_valor_lido: number | null;
  tanque: string | null;
}

export interface ProcessReportReadingInfo {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  id_tanque: number | null;
  nome_tanque: string | null;
  id_sensor: number | null;
  nome_sensor: string | null;
  tipo_leitura: tipoleiturasensor;
  valor: number;
  valor_vacuo: number | null;
  unidade_medida: string;
  leitura_em: Date;
  recebido_em: Date;
  volume_acumulado_ml?: number | null;
  percentual_nivel?: number | null;
}

export interface ProcessReportEventInfo {
  id_evento_processo: number;
  tipo_evento: tipoeventoprocesso;
  origem_evento: origemevento;
  severidade_evento: severidadeevento;
  ocorrido_em: Date;
  id_processo_tanque_sensor: number | null;
}

export interface ProcessReportAlarmInfo {
  id_alarme: number;
  titulo: string;
  descricao: string;
  tipo_alarme: tipoalarme;
  severidade: severidadealarme;
  status_alarme: statusalarme;
  origem_alarme: origemalarme;
  valor_detectado: number | null;
  unidade: string | null;
  ocorrido_em: Date;
  resolvido_em: Date | null;
  id_processo_tanque: number | null;
  id_processo_tanque_sensor: number | null;
}

export interface ProcessReportSummary {
  total_tanques: number;
  total_sensores: number;
  total_leituras: number;
  total_eventos: number;
  total_alarmes: number;
  total_alarmes_criticos: number;
  total_alarmes_medios: number;
  total_alarmes_info: number;
  total_alarmes_resolvidos: number;
  total_alarmes_ativos: number;
  eficiencia_media: number | null;
  vacuo_medio_geral: number | null;
  tempo_execucao_total: number | null;
}

export type ProcessReportDiagnosticLevel = 'NORMAL' | 'ATENCAO' | 'CRITICO';

export interface ProcessReportDiagnostic {
  nivel: ProcessReportDiagnosticLevel;
  mensagem: string;
  motivos: string[];
  recomendacoes: string[];
}
