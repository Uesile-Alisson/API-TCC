import { LeituraChartPoint } from './leitura-chart-point.interface';

export interface LeituraChartResponse {
  id_processo: number;
  id_processo_tanque_sensor: number | null;
  vacuo_alvo: number | null;
  pontos: LeituraChartPoint[];
  total_pontos: number;
  intervalo: string | null;
  generated_at: Date;
}
