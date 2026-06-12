export interface BombaCommandParams {
  id_bomba: number;
}

export interface ValvulaCommandParams {
  id_valvula: number;
}

export interface ProcessoCommandParams {
  id_processo?: number;
  id_processo_tanque?: number;
}

export interface EmptyCommandParams {
  [key: string]: never;
}

export type CommandParams =
  | BombaCommandParams
  | ValvulaCommandParams
  | ProcessoCommandParams
  | EmptyCommandParams;
