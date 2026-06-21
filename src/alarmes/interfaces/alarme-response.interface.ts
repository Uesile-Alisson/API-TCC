export type AlarmeSeverity = 'INFO' | 'MEDIO' | 'CRITICO';

export type AlarmeStatus = 'ATIVO' | 'RESOLVIDO';

export type AlarmeType =
  | 'SENSOR'
  | 'BOMBA'
  | 'MQTT'
  | 'ESP32'
  | 'PROCESSO'
  | 'SEGURANCA'
  | 'SISTEMA'
  | 'TANQUE';

export type AlarmeOrigin =
  | 'SENSOR'
  | 'ESP32'
  | 'MQTT'
  | 'BACKEND'
  | 'SISTEMA'
  | 'USUARIO';

export interface AlarmeResponse {
  id_alarme: number;
  titulo: string;
  descricao: string;
  tipo_alarme: AlarmeType;
  severidade: AlarmeSeverity;
  status_alarme: AlarmeStatus;
  origem_alarme: AlarmeOrigin;
  valor_detectado: number | null;
  unidade: string | null;
  ocorrido_em: Date;
  resolvido_em: Date | null;
  excluido_em: Date | null;
  id_processo: number | null;
  id_processo_tanque: number | null;
  id_processo_tanque_sensor: number | null;
  id_mqtt_mensagem: number | null;
  id_usuario_responsavel: number | null;
}
