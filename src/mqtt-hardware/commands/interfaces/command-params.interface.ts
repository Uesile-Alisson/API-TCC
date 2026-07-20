export interface BombaCommandParams {
  id_bomba: number;
  codigo_hardware?: string;
}

export interface ValvulaCommandParams {
  id_valvula: number;
  codigo_hardware?: string;
  id_tanque?: number;
  id_processo_tanque?: number;
}

export interface ProcessoCommandParams {
  id_processo?: number;
  id_processo_tanque?: number;
}

export type EmptyCommandParams = Record<never, never>;

export type CommandParams =
  | BombaCommandParams
  | ValvulaCommandParams
  | ProcessoCommandParams
  | EmptyCommandParams;
