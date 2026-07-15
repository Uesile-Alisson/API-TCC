import {
  origemlogoperacional,
  resultadooperacao,
  tipologoperacional,
} from '@prisma/client';

export interface CreateProcessoLogInput {
  id_usuario?: number | null;
  id_processo?: number | null;
  tipo_log: tipologoperacional;
  origem: origemlogoperacional;
  resultado: resultadooperacao;
  acao: string;
  descricao: string;
}
