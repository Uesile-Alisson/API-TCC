import {
  modooperacaoauxiliar,
  statusestagnacao,
  statusencerramentotanque,
  statusencerramentoprocesso,
  statusprocesso,
  statustanqueprocesso,
} from '@prisma/client';
import {
  ProcessoDashboardData,
  ProcessoDashboardReadingPoint,
  ProcessoEncerramentoGeralState,
  ProcessoAuxiliarState,
  ProcessoMetrics,
  ProcessoParadaEmergenciaState,
  ProcessoTanqueRealtimeState,
} from '../interfaces';
import type { ProcessoPrecheckResultado } from '../precheck';

export interface ProcessoSocketBasePayload {
  id_processo: number;
  emitted_at: Date;
}

export interface ProcessoStatusChangedPayload extends ProcessoSocketBasePayload {
  status_processo: statusprocesso;
  previous_status?: statusprocesso | null;
  message?: string;
}

export interface ProcessoLifecycleSocketPayload extends ProcessoSocketBasePayload {
  status_processo: statusprocesso;
  message: string;
}

export interface ProcessoConfigUpdatedSocketPayload extends ProcessoSocketBasePayload {
  message: string;
  modo_operacao_auxiliar: modooperacaoauxiliar;
  encerramento_automatico: boolean;
  encerramento_versao: number;
}

export interface ProcessoMetricsUpdatedSocketPayload extends ProcessoSocketBasePayload {
  metrics: ProcessoMetrics;
}

export interface ProcessoDashboardUpdatedSocketPayload extends ProcessoSocketBasePayload {
  dashboard: ProcessoDashboardData;
}

export interface ProcessoAuxiliaryStateUpdatedSocketPayload extends ProcessoSocketBasePayload {
  auxiliary_state: ProcessoAuxiliarState;
}

export interface ProcessoTankUpdatedSocketPayload extends ProcessoSocketBasePayload {
  id_processo_tanque: number;
  id_tanque: number;
  lifecycle_changed: boolean;
  previous_status: statustanqueprocesso;
  closure_changed: boolean;
  previous_closure_status: statusencerramentotanque;
  stagnation_changed: boolean;
  previous_stagnation_status: statusestagnacao;
  tank: ProcessoTanqueRealtimeState;
  reading: ProcessoDashboardReadingPoint;
}

export interface ProcessoTankClosureUpdatedSocketPayload extends ProcessoSocketBasePayload {
  id_processo_tanque: number;
  id_tanque: number;
  previous_status: statusencerramentotanque;
  closure: ProcessoTanqueRealtimeState['encerramento'];
  message: string;
}

export interface ProcessoGeneralClosureUpdatedSocketPayload extends ProcessoSocketBasePayload {
  previous_status: statusencerramentoprocesso;
  closure: ProcessoEncerramentoGeralState;
  message: string;
}

export interface ProcessoEmergencyStopSocketPayload extends ProcessoSocketBasePayload {
  motivo?: string | null;
  message: string;
  parada_emergencia: ProcessoParadaEmergenciaState;
}

export interface ProcessoFailureSocketPayload extends ProcessoSocketBasePayload {
  motivo?: string | null;
  message: string;
}

export type ProcessoPrecheckSocketPayload = ProcessoPrecheckResultado;

export interface ProcessoJoinRoomPayload {
  id_processo: number;
}

export interface ProcessoRoomResponsePayload {
  id_processo: number;
  room: string;
  message: string;
  emitted_at: Date;
}
