import {
  origemevento,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';

export interface CreateProcessoEventInput {
  id_processo: number;
  tipo_evento: tipoeventoprocesso;
  origem_evento?: origemevento;
  severidade_evento?: severidadeevento;
  id_processo_tanque_sensor?: number | null;
}
