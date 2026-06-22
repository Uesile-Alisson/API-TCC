export const GRAFICO_VACUO_INTERVALOS = [
  'RAW',
  'MINUTO',
  'CINCO_MINUTOS',
  'DEZ_MINUTOS',
] as const;

export type GraficoVacuoIntervalo = (typeof GRAFICO_VACUO_INTERVALOS)[number];

export const DEFAULT_GRAFICO_VACUO_INTERVALO: GraficoVacuoIntervalo = 'RAW';

export const GRAFICO_VACUO_DEFAULT_LIMIT = 1000;

export const GRAFICO_VACUO_MAX_LIMIT = 5000;

export const GRAFICO_VACUO_VALUE_FIELD = 'valor_vacuo';

export const GRAFICO_VACUO_TIMESTAMP_FIELD = 'leitura_em';
