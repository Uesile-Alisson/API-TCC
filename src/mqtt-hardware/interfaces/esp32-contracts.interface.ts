import { CommandName } from '../commands/interfaces/command-name.interface';

export interface Esp32MqttTopicsPayload {
  topico_comandos: string;
  topico_leituras: string;
  topico_status: string;
  topico_heartbeat: string;
  topico_alarmes: string;
  topico_acoplamentos: string;
  topico_configuracoes: string;
  topico_acks: string;
}

export interface Esp32SistemaPayload {
  vacuo_padrao: number;
  limite_seguranca_vacuo: number;
  tolerancia_vacuo_percentual: number;
  unidade: string;
}

export interface Esp32HardwareBombaPayload {
  id_bomba: number;
  codigo_hardware: string;
  nome: string;
  tipo_bomba: string;
  status_padrao: string;
  disponivel: boolean;
}

export interface Esp32HardwareTanquePayload {
  id_tanque: number;
  codigo_hardware: string;
  nome: string;
  volume: number;
  unidade_volume: string;
  vacuo_padrao: number;
}

export interface Esp32HardwareValvulaPayload {
  id_valvula: number;
  codigo_hardware: string;
  id_tanque: number | null;
  id_bomba: number;
  nome: string;
  numero_saida_manifold: number;
  funcao_valvula: string;
  status_valvula: string;
  disponivel: boolean;
}

export interface Esp32HardwareSensorPayload {
  id_sensor: number;
  codigo_hardware: string;
  id_tanque?: number | null;
  nome: string;
  tipo_sensor: string;
  unidade_medida: string;
  disponivel: boolean;
}

export interface Esp32SyncConfigPayload {
  tipo: 'SYNC_CONFIG';
  schema_version: number;
  correlation_id: string;
  enviado_em: string;
  sistema: Esp32SistemaPayload;
  mqtt: Esp32MqttTopicsPayload;
  hardware: {
    bombas: Esp32HardwareBombaPayload[];
    tanques: Esp32HardwareTanquePayload[];
    valvulas: Esp32HardwareValvulaPayload[];
    sensores_vacuo: Esp32HardwareSensorPayload[];
    sensores_acoplamento: Esp32HardwareSensorPayload[];
  };
  seguranca: {
    parar_se_desacoplar: boolean;
    parada_emergencia_habilitada: boolean;
    timeout_heartbeat_ms: number;
  };
}

export interface Esp32ProcessStartSensorPayload {
  id_sensor: number;
  codigo_hardware: string;
  nome: string;
  unidade_medida: string;
}

export interface Esp32ProcessStartValvePayload {
  id_valvula: number;
  codigo_hardware: string;
  nome: string;
  funcao_valvula: string;
}

export interface Esp32ProcessStartPumpPayload {
  id_bomba: number;
  codigo_hardware: string;
  nome: string;
  tipo_bomba: string;
}

export interface Esp32ProcessStartTankPayload {
  id_tanque: number;
  codigo_hardware: string;
  id_processo_tanque: number;
  id_processo_tanque_sensor: number;
  sensor_vacuo: Esp32ProcessStartSensorPayload;
  sensor_acoplamento: Esp32ProcessStartSensorPayload | null;
  valvulas: Esp32ProcessStartValvePayload[];
  vacuo_alvo: number;
  unidade: string;
}

export interface Esp32ProcessStartPayload {
  tipo: 'INICIAR_PROCESSO_VACUO';
  schema_version: number;
  correlation_id: string;
  enviado_em: string;
  id_processo: number;
  tanques: Esp32ProcessStartTankPayload[];
  bomba: Esp32ProcessStartPumpPayload;
  vacuo_alvo: number;
  limite_seguranca_vacuo: number;
  tolerancia_vacuo_percentual: number;
  unidade: string;
  seguranca: {
    parar_se_desacoplar: boolean;
    parada_emergencia_habilitada: boolean;
  };
}

export interface Esp32CommandAckPayload {
  tipo: 'ACK';
  schema_version: number;
  correlation_id: string;
  comando: CommandName;
  status: 'RECEBIDO' | 'EXECUTADO' | 'RECUSADO' | 'ERRO';
  codigo_hardware?: string;
  id_processo?: number;
  mensagem?: string;
  erro?: string;
  recebido_em: string;
}
