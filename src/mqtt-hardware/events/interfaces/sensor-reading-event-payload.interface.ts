export interface SensorReadingEventInput {
  id_leitura_sensor: number;
  id_processo: number;
  id_processo_tanque: number;
  id_processo_tanque_sensor: number;
  id_sensor: number;
  id_tanque: number;
  id_mqtt_mensagem?: number | null;
  valor_vacuo: number;
  unidade_medida?: string | null;
  vacuo_alvo?: number | null;
  limite_seguranca_vacuo?: number | null;
  processo_em_execucao?: boolean;
  leitura_em: Date;
  recebido_em: Date;
}
