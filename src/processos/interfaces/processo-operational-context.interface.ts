import {
  StatusAcoplamentoMangueira,
  modooperacaoauxiliar,
  severidadealarme,
  statusalarme,
  statusconexaomqtt,
  statusencerramentotanque,
  statusgeralsistema,
  statusprocesso,
  statussensor,
  statusintegridadesensor,
  statustanque,
  statustanqueprocesso,
  tiposensor,
} from '@prisma/client';

export interface ProcessoHardwareOperationalContext {
  mqtt_credentials_configured: boolean;
  mqtt_credentials_verified: boolean;
  mqtt_credentials_verified_at: Date | null;
  mqtt_credentials_failure: string | null;
  mqtt_connected: boolean;
  mqtt_operational: boolean;
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
  status_integridade: statusintegridadesensor;
  calibrado_em: Date | null;
  calibracao_valida_ate: Date | null;
  modo_calibracao_ativo: boolean;
  liberado_em: Date | null;
  integridade_ultimo_erro: string | null;
  tipo_sensor: tiposensor;
  ultima_leitura: Date | null;
  ultimo_valor_lido: number | null;
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
  vacuo_atingido: boolean;
  vacuo_estabilizado: boolean;
  status_tanque_processo: statustanqueprocesso;
  status_encerramento: statusencerramentotanque;
  encerramento_versao: number;
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
  modo_operacao_auxiliar: modooperacaoauxiliar;
  encerramento_automatico: boolean;
  encerramento_versao: number;
  encerramento_tolerancia_vacuo_percentual: number;
  encerramento_limite_seguranca_vacuo: number;
  encerramento_tempo_estabilizacao_segundos: number;
  encerramento_estabilizacao_cobertura_minima_percentual: number;
  encerramento_intervalo_leitura_esperado_ms: number;
  encerramento_timeout_leitura_sensor_ms: number;
  encerramento_tempo_retencao_segundos: number;
  encerramento_perda_vacuo_maxima_retencao: number;
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
