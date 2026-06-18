import {
  StatusAcoplamentoMangueira,
  severidadealarme,
  statusalarme,
  statusconexaomqtt,
  statusgeralsistema,
  statusprocesso,
  statussensor,
  statustanque,
  statustanqueprocesso,
} from '@prisma/client';

export interface ProcessoHardwareOperationalContext {
  mqtt_connected: boolean;
  mqtt_status: statusconexaomqtt | null;
  esp32_online: boolean;
  esp32_status: statusgeralsistema | null;
  last_heartbeat_at: Date | null;
  last_status_at: Date | null;
  last_reading_at: Date | null;
  communication_ready: boolean;
}

export interface ProcessoCriticalAlarmContext {
  id_alarme: number;
  titulo: string;
  severidade: severidadealarme;
  status_alarme: statusalarme;
  ocorrido_em: Date;
}

export interface ProcessoAcoplamentoOperationalContext {
  id_sensor: number;
  id_tanque: number;
  status_acoplamento: StatusAcoplamentoMangueira;
  sinal_detectado: boolean;
  ultima_verificacao: Date | null;
  ultimo_evento_em: Date | null;
  ativo: boolean;
}

export interface ProcessoSensorOperationalContext {
  id_processo_tanque_sensor: number;
  id_sensor: number;
  nome_sensor: string;
  modelo_sensor: string;
  unidade_medida: string;
  status_sensor: statussensor;
  ativo_no_processo: boolean;
  acoplamento: ProcessoAcoplamentoOperationalContext | null;
}

export interface ProcessoTanqueOperationalContext {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
  volume: number;
  unidade_volume: string;
  status_tanque: statustanque;
  vacuo_alvo: number;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  status_tanque_processo: statustanqueprocesso;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  sensores: ProcessoSensorOperationalContext[];
}

export interface ProcessoSafetyOperationalContext {
  hardware: ProcessoHardwareOperationalContext;
  has_critical_alarm: boolean;
  critical_alarms: ProcessoCriticalAlarmContext[];
  all_tanks_ready: boolean;
  all_sensors_ready: boolean;
  all_acoplamentos_ready: boolean;
  can_start: boolean;
  blocking_reasons: string[];
}

export interface ProcessoOperationalContext {
  id_processo: number;
  id_usuario: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  vacuo_alvo: number;
  vacuo_inicial: number | null;
  vacuo_final: number | null;
  vacuo_medio: number | null;
  eficiencia: number | null;
  tempo_maximo: number;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  pausado_em: Date | null;
  retomado_em: Date | null;
  finalizado_em: Date | null;
  parada_emergencia: boolean;
  criado_em: Date;
  tanques: ProcessoTanqueOperationalContext[];
  safety: ProcessoSafetyOperationalContext;
}
