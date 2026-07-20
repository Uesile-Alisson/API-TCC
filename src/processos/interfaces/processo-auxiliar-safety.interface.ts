import { modooperacaoauxiliar } from '@prisma/client';

export enum ProcessoAuxiliarSafetyAction {
  LIGAR_BOMBA_AUXILIAR = 'LIGAR_BOMBA_AUXILIAR',
  DESLIGAR_BOMBA_AUXILIAR = 'DESLIGAR_BOMBA_AUXILIAR',
  ABRIR_VALVULA_AUXILIAR = 'ABRIR_VALVULA_AUXILIAR',
  FECHAR_VALVULA_AUXILIAR = 'FECHAR_VALVULA_AUXILIAR',
}

export enum ProcessoAuxiliarSafetyOrigin {
  AUTOMACAO = 'AUTOMACAO',
  USUARIO = 'USUARIO',
}

export interface ProcessoAuxiliarSafetyRequest {
  id_processo: number;
  action: ProcessoAuxiliarSafetyAction;
  origin: ProcessoAuxiliarSafetyOrigin;
  id_processo_tanque?: number;
  id_usuario?: number;
  expected_subsystem_version?: number;
  expected_tank_version?: number;
  evaluated_at?: Date;
}

export interface ProcessoAuxiliarSafetyCheck {
  code: string;
  permitted: boolean;
  message: string;
}

export interface ProcessoAuxiliarSafetyResult {
  approved: boolean;
  id_processo: number;
  id_processo_tanque: number | null;
  action: ProcessoAuxiliarSafetyAction;
  origin: ProcessoAuxiliarSafetyOrigin;
  mode: modooperacaoauxiliar | null;
  subsystem_version: number | null;
  tank_version: number | null;
  id_tanque: number | null;
  id_bomba_auxiliar: number | null;
  codigo_bomba_auxiliar: string | null;
  id_valvula_auxiliar: number | null;
  codigo_valvula_auxiliar: string | null;
  checks: ProcessoAuxiliarSafetyCheck[];
  evaluated_at: Date;
}
