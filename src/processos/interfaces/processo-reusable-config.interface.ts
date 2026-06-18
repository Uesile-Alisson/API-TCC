export interface ProcessoReusableSensorConfig {
  id_sensor: number;
  nome_sensor: string;
  observacoes: string | null;
}

export interface ProcessoReusableTanqueConfig {
  id_tanque: number;
  nome_tanque: string;
  vacuo_alvo: number;
  sensores: ProcessoReusableSensorConfig[];
}

export interface ProcessoReusableConfig {
  id_processo_origem: number;
  nome_processo_origem: string | null;
  tempo_maximo: number;
  vacuo_alvo: number;
  tanques: ProcessoReusableTanqueConfig[];
}
