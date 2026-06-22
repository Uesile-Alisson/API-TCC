import { LeituraResponse } from './leitura-response.interface';

export interface LeituraProcessoResumo {
  id_processo: number;
  nome_processo: string | null;
  status_processo: string;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
}

export interface LeituraProcessoTanqueResumo {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string | null;
  vacuo_alvo: number | null;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  status_tanque_processo: string;
}

export interface LeituraSensorResumo {
  id_sensor: number;
  nome_sensor: string;
  modelo_sensor: string | null;
  unidade_medida: string | null;
  status_sensor: string;
}

export interface LeituraDetails extends LeituraResponse {
  processo: LeituraProcessoResumo | null;
  processo_tanque: LeituraProcessoTanqueResumo | null;
  sensor: LeituraSensorResumo | null;
}
