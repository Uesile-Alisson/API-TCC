import type {
  origemevento,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';

export interface EventoResponse {
  id_evento_processo: number;
  id_processo: number;
  id_processo_tanque_sensor: number | null;
  tipo_evento: tipoeventoprocesso;
  origem_evento: origemevento;
  severidade_evento: severidadeevento;
  ocorrido_em: Date;
}
