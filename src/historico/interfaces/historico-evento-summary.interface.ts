import type {
  origemevento,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';

export interface HistoricoEventoSummary {
  id_evento_processo: number;
  id_processo: number;
  id_processo_tanque_sensor: number | null;
  tipo_evento: tipoeventoprocesso;
  origem_evento: origemevento;
  severidade_evento: severidadeevento;
  ocorrido_em: Date;
}

export interface HistoricoEventosResumo {
  total: number;
  info: number;
  aviso: number;
  critico: number;
  primeiro_evento_em: Date | null;
  ultimo_evento_em: Date | null;
}
