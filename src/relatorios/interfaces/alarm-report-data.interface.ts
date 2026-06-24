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

export interface AlarmReportData {
  alarme: AlarmReportAlarmInfo;
  processo: AlarmReportProcessInfo | null;
  tanque: AlarmReportTankInfo | null;
  sensor: AlarmReportSensorInfo | null;
  usuario_responsavel: AlarmReportUserInfo | null;
  leituras_relacionadas: AlarmReportReadingInfo[];
  eventos_relacionados: AlarmReportEventInfo[];
  diagnostico: AlarmReportDiagnostic;
  contexto_geracao: RelatorioGenerationContext;
}

export interface AlarmReportAlarmInfo {
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
  id_processo: number | null;
  id_processo_tanque: number | null;
  id_processo_tanque_sensor: number | null;
}

export interface AlarmReportProcessInfo {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
}

export interface AlarmReportTankInfo {
  id_processo_tanque: number | null;
  id_tanque: number | null;
  nome_tanque: string | null;
  status_tanque_processo: statustanqueprocesso | null;
}

export interface AlarmReportSensorInfo {
  id_processo_tanque_sensor: number | null;
  id_sensor: number | null;
  nome_sensor: string | null;
  modelo: string | null;
  tipo_sensor_processo: tiposensorprocesso | null;
  unidade_medida: string | null;
}

export interface AlarmReportUserInfo {
  id_usuario: number;
  nome: string;
}

export interface AlarmReportReadingInfo {
  id_leitura_sensor: number;
  tipo_leitura: tipoleiturasensor;
  valor: number;
  valor_vacuo: number | null;
  unidade_medida: string;
  leitura_em: Date;
}

export interface AlarmReportEventInfo {
  id_evento_processo: number;
  tipo_evento: tipoeventoprocesso;
  origem_evento: origemevento;
  severidade_evento: severidadeevento;
  ocorrido_em: Date;
}

export type AlarmReportDiagnosticLevel = 'INFO' | 'ATENCAO' | 'CRITICO';

export interface AlarmReportDiagnostic {
  nivel: AlarmReportDiagnosticLevel;
  mensagem: string;
  causa_provavel: string | null;
  impacto_operacional: string | null;
  recomendacoes: string[];
}
