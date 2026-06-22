import { EventoResponse } from './evento-response.interface';

export interface EventoProcessoResumo {
  id_processo: number;
  nome_processo: string | null;
  status_processo: string;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
}

export interface EventoProcessoTanqueSensorResumo {
  id_processo_tanque_sensor: number;
  id_processo_tanque: number;
  id_sensor: number;
}

export interface EventoSensorResumo {
  id_sensor: number;
  nome_sensor: string;
  modelo_sensor: string | null;
  unidade_medida: string | null;
  status_sensor: string;
}

export interface EventoTanqueResumo {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string | null;
  status_tanque_processo: string;
}

export interface EventoDetails extends EventoResponse {
  processo: EventoProcessoResumo | null;
  processo_tanque_sensor: EventoProcessoTanqueSensorResumo | null;
  sensor: EventoSensorResumo | null;
  tanque: EventoTanqueResumo | null;
}
