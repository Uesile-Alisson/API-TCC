import type { TimelineItemSeverity } from '../interfaces';

export interface ProcessoTimelineLeituraInput {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  valor_vacuo: unknown;
  leitura_em: Date;
  recebido_em?: Date | null;
  unidade_medida?: string | null;
}

export interface ProcessoTimelineEventoInput {
  id_evento_processo: number;
  id_processo: number;
  id_processo_tanque_sensor?: number | null;
  tipo_evento: string;
  origem_evento: string;
  severidade_evento: string;
  ocorrido_em: Date;
}

export interface BuildProcessTimelineInput {
  id_processo: number;
  leituras?: ProcessoTimelineLeituraInput[];
  eventos?: ProcessoTimelineEventoInput[];
  incluir_leituras?: boolean;
  incluir_eventos?: boolean;
  limit?: number;
}

export interface TimelineBuildOptions {
  incluir_leituras: boolean;
  incluir_eventos: boolean;
  limit: number;
}

export interface TimelineNormalizedEvent {
  severity: TimelineItemSeverity;
  title: string;
  description: string | null;
}
