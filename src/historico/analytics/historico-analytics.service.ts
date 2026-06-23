import { Injectable } from '@nestjs/common';
import { statusprocesso } from '@prisma/client';
import type { HistoricoDiagnostico } from '../interfaces';
import type {
  HistoricoNumericValue,
  HistoricoProblematicProcessResult,
  HistoricoProcessAnalyticsInput,
  HistoricoProcessProblemReason,
} from './historico-analytics.types';

@Injectable()
export class HistoricoAnalyticsService {
  calculateSuccessRate(total: number, totalConcluidos: number): number {
    if (!Number.isFinite(total) || total <= 0) {
      return 0;
    }

    const safeTotalConcluidos = Number.isFinite(totalConcluidos)
      ? totalConcluidos
      : 0;

    return this.round((safeTotalConcluidos / total) * 100);
  }

  calculateAverage(values: HistoricoNumericValue[]): number | null {
    const validValues = this.getFiniteValues(values);

    if (validValues.length === 0) {
      return null;
    }

    return this.round(
      validValues.reduce((total, value) => total + value, 0) /
        validValues.length,
    );
  }

  calculateSum(values: HistoricoNumericValue[]): number {
    return this.round(
      this.getFiniteValues(values).reduce((total, value) => total + value, 0),
    );
  }

  calculateAlarmAverage(
    totalAlarmes: number,
    totalProcessos: number,
  ): number | null {
    if (!Number.isFinite(totalProcessos) || totalProcessos <= 0) {
      return null;
    }

    const safeTotalAlarmes = Number.isFinite(totalAlarmes) ? totalAlarmes : 0;

    return this.round(safeTotalAlarmes / totalProcessos);
  }

  calculateVacuumDeviation(
    vacuoAlvo: number | null,
    vacuoFinal: number | null,
  ): number | null {
    if (
      vacuoAlvo === null ||
      vacuoFinal === null ||
      !Number.isFinite(vacuoAlvo) ||
      !Number.isFinite(vacuoFinal)
    ) {
      return null;
    }

    return this.round(Math.abs(vacuoAlvo - vacuoFinal), 3);
  }

  classifyProcessResult(
    input: HistoricoProcessAnalyticsInput,
  ): HistoricoDiagnostico {
    const critical = this.hasCriticalCondition(input);
    const attention = critical ? false : this.hasAttentionCondition(input);
    const motivos = this.identifyProblemReasons(input).map(
      (reason) => reason.message,
    );
    const recomendacoes = this.buildRecommendations(input, critical, attention);

    if (critical) {
      return {
        classificacao_resultado: 'CRITICO',
        motivos,
        recomendacoes,
      };
    }

    if (attention) {
      return {
        classificacao_resultado: 'ATENCAO',
        motivos,
        recomendacoes,
      };
    }

    return {
      classificacao_resultado: 'NORMAL',
      motivos: [],
      recomendacoes,
    };
  }

  calculateProblemScore(input: HistoricoProcessAnalyticsInput): number {
    let score = 0;

    if (input.status_processo === statusprocesso.FALHA) {
      score += 50;
    }

    if (input.status_processo === statusprocesso.INTERROMPIDO) {
      score += 35;
    }

    if (input.parada_emergencia) {
      score += 40;
    }

    score += Math.min(this.toSafeCount(input.total_alarmes_criticos) * 10, 50);
    score += Math.min(this.toSafeCount(input.total_alarmes), 20);

    if (input.eficiencia !== null && Number.isFinite(input.eficiencia)) {
      if (input.eficiencia < 50) {
        score += 30;
      } else if (input.eficiencia < 75) {
        score += 15;
      }
    }

    if (this.isExecutionNearLimit(input.tempo_execucao, input.tempo_maximo)) {
      score += 10;
    }

    return Math.trunc(score);
  }

  identifyProblemReasons(
    input: HistoricoProcessAnalyticsInput,
  ): HistoricoProcessProblemReason[] {
    const reasons: HistoricoProcessProblemReason[] = [];

    if (input.status_processo === statusprocesso.FALHA) {
      reasons.push({
        code: 'PROCESS_FAILED',
        message: 'Processo finalizado com falha.',
      });
    }

    if (input.status_processo === statusprocesso.INTERROMPIDO) {
      reasons.push({
        code: 'PROCESS_INTERRUPTED',
        message: 'Processo interrompido antes da conclusão.',
      });
    }

    if (input.parada_emergencia) {
      reasons.push({
        code: 'EMERGENCY_STOP',
        message: 'Processo teve parada de emergência.',
      });
    }

    if (this.toSafeCount(input.total_alarmes_criticos) > 0) {
      reasons.push({
        code: 'CRITICAL_ALARMS',
        message: 'Processo possui alarmes críticos vinculados.',
      });
    }

    if (this.toSafeCount(input.total_alarmes) > 0) {
      reasons.push({
        code: 'ALARMS_DETECTED',
        message: 'Processo possui alarmes registrados.',
      });
    }

    if (
      input.eficiencia !== null &&
      Number.isFinite(input.eficiencia) &&
      input.eficiencia < 75
    ) {
      reasons.push({
        code: 'LOW_EFFICIENCY',
        message: 'Processo apresentou eficiência abaixo do esperado.',
      });
    }

    if (this.isExecutionNearLimit(input.tempo_execucao, input.tempo_maximo)) {
      reasons.push({
        code: 'EXECUTION_TIME_NEAR_LIMIT',
        message: 'Tempo de execução próximo do limite configurado.',
      });
    }

    return reasons;
  }

  getProblematicProcesses(
    processes: HistoricoProcessAnalyticsInput[],
    limit: number,
  ): HistoricoProblematicProcessResult[] {
    const safeLimit =
      Number.isFinite(limit) && limit >= 1 ? Math.trunc(limit) : 5;

    return processes
      .map((processo) => ({
        processo,
        score: this.calculateProblemScore(processo),
        motivos: this.identifyProblemReasons(processo),
      }))
      .filter((item) => item.score > 0)
      .sort((current, next) => next.score - current.score)
      .slice(0, safeLimit);
  }

  private getFiniteValues(values: HistoricoNumericValue[]): number[] {
    return values.filter((value): value is number =>
      this.isFiniteNumber(value),
    );
  }

  private isFiniteNumber(value: HistoricoNumericValue): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private round(value: number, decimals = 2): number {
    const safeDecimals = Number.isFinite(decimals)
      ? Math.min(Math.max(Math.trunc(decimals), 0), 6)
      : 2;
    const factor = 10 ** safeDecimals;

    return Math.round(value * factor) / factor;
  }

  private isExecutionNearLimit(
    tempoExecucao: number | null,
    tempoMaximo: number | null,
  ): boolean {
    return (
      tempoExecucao !== null &&
      tempoMaximo !== null &&
      Number.isFinite(tempoExecucao) &&
      Number.isFinite(tempoMaximo) &&
      tempoMaximo > 0 &&
      tempoExecucao > tempoMaximo * 0.9
    );
  }

  private hasCriticalCondition(input: HistoricoProcessAnalyticsInput): boolean {
    return (
      input.status_processo === statusprocesso.FALHA ||
      input.parada_emergencia ||
      this.toSafeCount(input.total_alarmes_criticos) > 0 ||
      (input.eficiencia !== null &&
        Number.isFinite(input.eficiencia) &&
        input.eficiencia < 50)
    );
  }

  private hasAttentionCondition(
    input: HistoricoProcessAnalyticsInput,
  ): boolean {
    return (
      input.status_processo === statusprocesso.INTERROMPIDO ||
      this.toSafeCount(input.total_alarmes) > 0 ||
      (input.eficiencia !== null &&
        Number.isFinite(input.eficiencia) &&
        input.eficiencia < 75) ||
      this.isExecutionNearLimit(input.tempo_execucao, input.tempo_maximo)
    );
  }

  private buildRecommendations(
    input: HistoricoProcessAnalyticsInput,
    critical: boolean,
    attention: boolean,
  ): string[] {
    const recommendations: string[] = [];

    if (input.status_processo === statusprocesso.FALHA) {
      recommendations.push(
        'Analisar falha operacional antes de repetir o processo.',
      );
    }

    if (input.parada_emergencia) {
      recommendations.push('Verificar causa da parada de emergência.');
    }

    if (this.toSafeCount(input.total_alarmes_criticos) > 0) {
      recommendations.push(
        'Inspecionar alarmes críticos vinculados ao processo.',
      );
    }

    if (
      input.eficiencia !== null &&
      Number.isFinite(input.eficiencia) &&
      input.eficiencia < 75
    ) {
      recommendations.push('Revisar vedação, sensores e parâmetros de vácuo.');
    }

    if (this.isExecutionNearLimit(input.tempo_execucao, input.tempo_maximo)) {
      recommendations.push(
        'Avaliar tempo de execução e estabilidade do processo.',
      );
    }

    if (!critical && !attention) {
      recommendations.push('Processo dentro do padrão histórico esperado.');
    }

    return recommendations;
  }

  private toSafeCount(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  }
}
