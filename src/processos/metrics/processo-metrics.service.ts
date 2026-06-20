import { Injectable } from '@nestjs/common';
import {
  ProcessoCalculatedMetrics,
  ProcessoMetricReading,
  ProcessoMetricsInput,
  ProcessoMetricTanque,
  ProcessoTanqueCalculatedMetrics,
} from './processo-metrics.types';

@Injectable()
export class ProcessoMetricsService {
  calculateProcessMetrics(
    input: ProcessoMetricsInput,
  ): ProcessoCalculatedMetrics {
    const tanques = input.tanques.map((tanque) =>
      this.calculateTanqueMetrics(tanque),
    );

    const total_leituras = tanques.reduce(
      (total, tanque) => total + tanque.total_leituras,
      0,
    );

    const total_sensores =
      input.total_sensores ?? this.countUniqueSensors(input.tanques);

    return {
      id_processo: input.id_processo,
      vacuo_alvo:
        this.roundMetric(
          this.average(tanques.map((tanque) => tanque.vacuo_alvo)),
        ) ?? 0,
      vacuo_inicial: this.roundMetric(
        this.average(tanques.map((tanque) => tanque.vacuo_inicial)),
      ),
      vacuo_final: this.roundMetric(
        this.average(tanques.map((tanque) => tanque.vacuo_final)),
      ),
      vacuo_medio: this.roundMetric(
        this.average(tanques.map((tanque) => tanque.vacuo_medio)),
      ),
      eficiencia: this.roundMetric(
        this.average(tanques.map((tanque) => tanque.eficiencia)),
      ),
      tempo_execucao: this.calculateTempoExecucao(input),
      total_tanques: tanques.length,
      total_sensores,
      total_leituras,
      total_alarmes: input.total_alarmes,
      total_eventos: input.total_eventos,
      tanques,
    };
  }

  calculateTanqueMetrics(
    tanque: ProcessoMetricTanque,
  ): ProcessoTanqueCalculatedMetrics {
    const validReadings = this.getValidReadings(tanque.leituras);
    const vacuo_final = this.calculateVacuoFinal(validReadings);

    return {
      id_processo_tanque: tanque.id_processo_tanque,
      id_tanque: tanque.id_tanque,
      nome_tanque: tanque.nome_tanque,
      vacuo_alvo: tanque.vacuo_alvo,
      vacuo_inicial: this.roundMetric(
        this.calculateVacuoInicial(validReadings),
      ),
      vacuo_final: this.roundMetric(vacuo_final),
      vacuo_medio: this.roundMetric(this.calculateVacuoMedio(validReadings)),
      eficiencia: this.roundMetric(
        this.calculateEficiencia({
          vacuo_alvo: tanque.vacuo_alvo,
          vacuo_final,
        }),
      ),
      total_leituras: validReadings.length,
    };
  }

  calculateVacuoInicial(readings: ProcessoMetricReading[]): number | null {
    const validReadings = this.sortReadingsByDate(
      this.getValidReadings(readings),
    );

    return validReadings[0]?.valor_vacuo ?? null;
  }

  calculateVacuoFinal(readings: ProcessoMetricReading[]): number | null {
    const validReadings = this.sortReadingsByDate(
      this.getValidReadings(readings),
    );

    return validReadings.at(-1)?.valor_vacuo ?? null;
  }

  calculateVacuoMedio(readings: ProcessoMetricReading[]): number | null {
    return this.average(
      this.getValidReadings(readings).map((reading) => reading.valor_vacuo),
    );
  }

  calculateEficiencia(input: {
    vacuo_alvo: number;
    vacuo_final: number | null;
  }): number | null {
    if (input.vacuo_final === null || input.vacuo_alvo === 0) {
      return null;
    }

    return (Math.abs(input.vacuo_final) / Math.abs(input.vacuo_alvo)) * 100;
  }

  calculateTempoExecucao(input: {
    iniciado_em: Date | null;
    finalizado_em: Date | null;
    tempo_execucao: number | null;
  }): number | null {
    if (input.tempo_execucao !== null) {
      return input.tempo_execucao;
    }

    if (
      !this.isValidDate(input.iniciado_em) ||
      !this.isValidDate(input.finalizado_em)
    ) {
      return null;
    }

    const seconds = Math.floor(
      (input.finalizado_em.getTime() - input.iniciado_em.getTime()) / 1000,
    );

    return seconds >= 0 ? seconds : null;
  }

  private getValidReadings(
    readings: ProcessoMetricReading[],
  ): ProcessoMetricReading[] {
    return readings.filter((reading) =>
      this.isValidNumber(reading.valor_vacuo),
    );
  }

  private sortReadingsByDate(
    readings: ProcessoMetricReading[],
  ): ProcessoMetricReading[] {
    return [...readings].sort(
      (a, b) => a.leitura_em.getTime() - b.leitura_em.getTime(),
    );
  }

  private average(values: Array<number | null | undefined>): number | null {
    const validValues = values.filter((value): value is number =>
      this.isValidNumber(value),
    );

    if (validValues.length === 0) {
      return null;
    }

    const total = validValues.reduce((sum, value) => sum + value, 0);

    return total / validValues.length;
  }

  private roundMetric(value: number | null, decimals = 2): number | null {
    if (!this.isValidNumber(value)) {
      return null;
    }

    const factor = 10 ** decimals;

    return Math.round(value * factor) / factor;
  }

  private countUniqueSensors(tanques: ProcessoMetricTanque[]): number {
    const sensorIds = new Set<number>();

    for (const tanque of tanques) {
      for (const leitura of tanque.leituras) {
        sensorIds.add(leitura.id_processo_tanque_sensor);
      }
    }

    return sensorIds.size;
  }

  private isValidDate(value: Date | null): value is Date {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  private isValidNumber(value: number | null | undefined): value is number {
    return value !== null && value !== undefined && Number.isFinite(value);
  }
}
