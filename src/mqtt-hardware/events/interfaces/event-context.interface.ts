export interface EventContext {
  id_mqtt_mensagem?: number | null;
  id_usuario?: number | null;
  id_processo?: number | null;
  id_processo_tanque?: number | null;
  id_processo_tanque_sensor?: number | null;
  id_tanque?: number | null;
  id_sensor?: number | null;
  correlation_id?: string | null;
  recebido_em?: Date;
}
