import { statusprocesso, statustanqueprocesso } from '@prisma/client';

export interface CachedReadingContext {
  id_processo: number;
  id_processo_tanque: number;
  id_processo_tanque_sensor: number;
  id_tanque: number;
  id_sensor: number;
  status_processo: statusprocesso;
  status_tanque_processo: statustanqueprocesso;
  vacuo_alvo: number;
  unidade_medida: string;
  limite_seguranca_vacuo: number;
  tolerancia_vacuo_percentual: number;
}
