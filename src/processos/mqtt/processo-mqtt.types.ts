import { CommandResult } from '../../mqtt-hardware/commands/interfaces/command-result.interface';
import { HardwareState } from '../../mqtt-hardware/interfaces/hardware-state.interface';

export interface ProcessoMqttTanqueTarget {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque?: string | null;
}

export interface ProcessoMqttSensorTarget {
  id_processo_tanque_sensor: number;
  id_sensor: number;
  id_tanque: number;
  nome_sensor?: string | null;
}

export interface ProcessoMqttCommandContext {
  id_processo: number;
  tanques: ProcessoMqttTanqueTarget[];
  sensores: ProcessoMqttSensorTarget[];
}

export interface ProcessoMqttHardwareReadiness {
  mqttConnected: boolean;
  esp32Online: boolean;
  communicationReady: boolean;
  currentStatus?: HardwareState;
}

export interface ProcessoMqttOperationResult {
  success: boolean;
  message: string;
  id_processo: number;
  command_results?: CommandResult[];
}
