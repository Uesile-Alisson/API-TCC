export interface LeituraChartPoint {
  timestamp: Date;
  valor_vacuo: number | null;
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
}
