export interface HistoricoVacuoChartPoint {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  id_tanque: number;
  nome_tanque: string;
  id_sensor: number;
  nome_sensor: string;
  valor_vacuo: number;
  leitura_em: Date;
  recebido_em: Date;
}

export interface HistoricoVacuoChartResponse {
  id_processo: number;
  vacuo_alvo: number;
  total_pontos: number;
  data: HistoricoVacuoChartPoint[];
}

// As leituras nao possuem id_processo direto. O repository deve buscar os pontos via leiturasensores -> processostanquessensores -> processostanques -> processos.
