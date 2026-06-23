import type {
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
} from '@prisma/client';

export interface HistoricoAlarmeSummary {
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

export interface HistoricoAlarmesResumo {
  total: number;
  info: number;
  medio: number;
  critico: number;
  ativos: number;
  resolvidos: number;
}
