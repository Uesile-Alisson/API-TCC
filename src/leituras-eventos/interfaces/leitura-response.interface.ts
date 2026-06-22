export interface LeituraResponse {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  valor_vacuo: number | null;
  leitura_em: Date;
  recebido_em: Date;
}
