import { CommandName } from '../../mqtt-hardware/commands/interfaces/command-name.interface';
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
  credentialsConfigured: boolean;
  credentialsVerified: boolean;
  credentialsVerifiedAt: Date | null;
  credentialsFailure: string | null;
  mqttConnected: boolean;
  configurationApplied: boolean;
  mqttOperational: boolean;
  esp32Online: boolean;
  communicationReady: boolean;
  currentStatus?: HardwareState;
}

export interface ProcessoMqttOperationResult {
  success: boolean;
  message: string;
  id_processo: number;
  command_results?: CommandResult[];
  command_failures?: ProcessoMqttCommandFailure[];
}

export interface ProcessoMqttCommandFailure {
  comando: CommandName;
  message: string;
}

export type ProcessoMqttStartupStage =
  | 'SINCRONIZANDO_HARDWARE'
  | 'CARREGANDO_PROCESSO'
  | 'ABRINDO_VALVULAS_PRINCIPAIS'
  | 'LIGANDO_BOMBA_PRINCIPAL';

export interface ProcessoMqttStartHooks {
  correlationPrefix?: string;
  onStage?: (stage: ProcessoMqttStartupStage) => Promise<void>;
}
