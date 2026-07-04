import type { AlarmeResponse } from './alarme-response.interface';

export interface AlarmeProcessSummary {
  id_processo: number;
  nome_processo: string | null;
  status_processo: string;
  fase_processo: string | null;
  vacuo_alvo: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
}

export interface AlarmeProcessTankSummary {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string | null;
  status_tanque_processo: string | null;
  vacuo_alvo: number | null;
}

export interface AlarmeProcessTankSensorSummary {
  id_processo_tanque_sensor: number;
  id_sensor: number;
  nome_sensor: string | null;
  modelo_sensor: string | null;
  unidade_medida: string | null;
  status_sensor: string | null;
}

export interface AlarmeMqttMessageSummary {
  id_mqtt_mensagem: number;
  topico: string;
  direcao: string;
  origem: string;
  criado_em: Date;
}

export interface AlarmeResponsibleUserSummary {
  id_usuario: number;
  nome: string;
}

export interface AlarmeDetails extends AlarmeResponse {
  processo: AlarmeProcessSummary | null;
  processo_tanque: AlarmeProcessTankSummary | null;
  processo_tanque_sensor: AlarmeProcessTankSensorSummary | null;
  mqtt_mensagem: AlarmeMqttMessageSummary | null;
  usuario_responsavel: AlarmeResponsibleUserSummary | null;
}
