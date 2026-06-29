import { statusprocesso } from '@prisma/client';
import { ProcessoDashboardData, ProcessoMetrics } from '../interfaces';
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
}

export interface ProcessoMetricsUpdatedSocketPayload extends ProcessoSocketBasePayload {
  metrics: ProcessoMetrics;
}

export interface ProcessoDashboardUpdatedSocketPayload extends ProcessoSocketBasePayload {
  dashboard: ProcessoDashboardData;
}

export interface ProcessoEmergencyStopSocketPayload extends ProcessoSocketBasePayload {
  motivo?: string | null;
  message: string;
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
