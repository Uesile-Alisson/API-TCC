import { Injectable } from '@nestjs/common';
import { severidadealarme, statusprocesso } from '@prisma/client';
import type {
  HistoricoAlarmSeverityChartPoint,
  HistoricoEfficiencyTimePoint,
  HistoricoExecutionTimePoint,
  HistoricoKpis,
  HistoricoStatusChartPoint,
  HistoricoTanqueRankingItem,
  HistoricoTimeSeriesPoint,
} from '../interfaces';
import { HistoricoAnalyticsService } from './historico-analytics.service';
import type {
  HistoricoDashboardAnalyticsInput,
  HistoricoDashboardSeriesInput,
  HistoricoPeriodGrouping,
  HistoricoProblematicProcessResult,
  HistoricoProcessAnalyticsInput,
  HistoricoTankAnalyticsInput,
} from './historico-analytics.types';

interface HistoricoTankAnalyticsAccumulator {
  id_tanque: number;
  nome_tanque: string;
  total_processos: number;
  eficiencia_values: Array<number | null | undefined>;
  tempo_execucao_values: Array<number | null | undefined>;
  vacuo_values: Array<number | null | undefined>;
  total_alarmes: number;
  total_alarmes_criticos: number;
}

interface HistoricoDashboardAnalyticsParams {
  input: HistoricoDashboardAnalyticsInput;
  agrupamento: HistoricoPeriodGrouping;
  campo_data: 'criado_em' | 'iniciado_em' | 'finalizado_em';
  ranking_limit: number;
}

interface HistoricoDashboardAnalyticsResult {
  kpis: HistoricoKpis;
  processos_por_status: HistoricoStatusChartPoint[];
  processos_por_periodo: HistoricoTimeSeriesPoint[];
  eficiencia_por_periodo: HistoricoEfficiencyTimePoint[];
  tempo_execucao_por_periodo: HistoricoExecutionTimePoint[];
  alarmes_por_severidade: HistoricoAlarmSeverityChartPoint[];
  comparativo_tanques: HistoricoTanqueRankingItem[];
  processos_problematicos: HistoricoProblematicProcessResult[];
}

@Injectable()
export class HistoricoDashboardAnalyticsService {
  constructor(private readonly analyticsService: HistoricoAnalyticsService) {}

  calculateKpis(input: HistoricoDashboardAnalyticsInput): HistoricoKpis {
    const totalProcessos = input.processos.length;
    const totalConcluidos = this.countByProcessStatus(
      input.processos,
      statusprocesso.CONCLUIDO,
    );
    const totalInterrompidos = this.countByProcessStatus(
      input.processos,
      statusprocesso.INTERROMPIDO,
    );
    const totalFalhas = this.countByProcessStatus(
      input.processos,
      statusprocesso.FALHA,
    );
    const totalAlarmes = this.calculateTotalAlarmes(input);
    const totalAlarmesCriticos = this.calculateTotalAlarmesCriticos(input);

    return {
      total_processos: totalProcessos,
      total_concluidos: totalConcluidos,
      total_interrompidos: totalInterrompidos,
      total_falhas: totalFalhas,
      taxa_sucesso_percentual: this.analyticsService.calculateSuccessRate(
        totalProcessos,
        totalConcluidos,
      ),
      eficiencia_media: this.analyticsService.calculateAverage(
        input.processos.map((processo) => processo.eficiencia),
      ),
      tempo_execucao_medio: this.analyticsService.calculateAverage(
        input.processos.map((processo) => processo.tempo_execucao),
      ),
      tempo_execucao_total: this.analyticsService.calculateSum(
        input.processos.map((processo) => processo.tempo_execucao),
      ),
      vacuo_medio_geral: this.analyticsService.calculateAverage(
        input.processos.map((processo) => processo.vacuo_medio),
      ),
      vacuo_final_medio: this.analyticsService.calculateAverage(
        input.processos.map((processo) => processo.vacuo_final),
      ),
      processos_com_parada_emergencia: input.processos.filter(
        (processo) => processo.parada_emergencia,
      ).length,
      total_alarmes: totalAlarmes,
      total_alarmes_criticos: totalAlarmesCriticos,
      media_alarmes_por_processo: this.analyticsService.calculateAlarmAverage(
        totalAlarmes,
        totalProcessos,
      ),
    };
  }

  buildProcessStatusChart(
    processes: HistoricoProcessAnalyticsInput[],
  ): HistoricoStatusChartPoint[] {
    return [
      statusprocesso.CONCLUIDO,
      statusprocesso.INTERROMPIDO,
      statusprocesso.FALHA,
    ].map((status) => ({
      status_processo: status,
      total: this.countByProcessStatus(processes, status),
    }));
  }

  buildAlarmSeverityChart(
    alarms: HistoricoDashboardAnalyticsInput['alarmes'],
  ): HistoricoAlarmSeverityChartPoint[] {
    return [
      severidadealarme.INFO,
      severidadealarme.MEDIO,
      severidadealarme.CRITICO,
    ].map((severidade) => ({
      severidade,
      total: alarms.filter((alarm) => alarm.severidade === severidade).length,
    }));
  }

  buildProcessPeriodSeries(
    input: HistoricoDashboardSeriesInput,
  ): HistoricoTimeSeriesPoint[] {
    const grouped = this.groupProcessesByPeriod(input);

    return this.sortPeriodKeys(Array.from(grouped.keys())).map((periodo) => ({
      periodo,
      valor: grouped.get(periodo)?.length ?? 0,
    }));
  }

  buildEfficiencyPeriodSeries(
    input: HistoricoDashboardSeriesInput,
  ): HistoricoEfficiencyTimePoint[] {
    const grouped = this.groupProcessesByPeriod(input);

    return this.sortPeriodKeys(Array.from(grouped.keys())).map((periodo) => ({
      periodo,
      eficiencia_media: this.analyticsService.calculateAverage(
        grouped.get(periodo)?.map((processo) => processo.eficiencia) ?? [],
      ),
    }));
  }

  buildExecutionTimePeriodSeries(
    input: HistoricoDashboardSeriesInput,
  ): HistoricoExecutionTimePoint[] {
    const grouped = this.groupProcessesByPeriod(input);

    return this.sortPeriodKeys(Array.from(grouped.keys())).map((periodo) => ({
      periodo,
      tempo_execucao_medio: this.analyticsService.calculateAverage(
        grouped.get(periodo)?.map((processo) => processo.tempo_execucao) ?? [],
      ),
    }));
  }

  buildTankComparison(
    tanks: HistoricoTankAnalyticsInput[],
  ): HistoricoTanqueRankingItem[] {
    const grouped = this.groupTanks(tanks);

    return Array.from(grouped.values())
      .map((tank) => ({
        id_tanque: tank.id_tanque,
        nome_tanque: tank.nome_tanque,
        total_processos: tank.total_processos,
        // status_tanque_processo não confirma conclusão/falha do processo; o repository poderá fornecer esse agregado em fase posterior.
        total_concluidos: 0,
        total_falhas: 0,
        eficiencia_media: this.analyticsService.calculateAverage(
          tank.eficiencia_values,
        ),
        tempo_execucao_medio: this.analyticsService.calculateAverage(
          tank.tempo_execucao_values,
        ),
        vacuo_medio: this.analyticsService.calculateAverage(tank.vacuo_values),
        total_alarmes: tank.total_alarmes,
        total_alarmes_criticos: tank.total_alarmes_criticos,
      }))
      .sort(
        (current, next) =>
          next.total_processos - current.total_processos ||
          (next.eficiencia_media ?? -1) - (current.eficiencia_media ?? -1) ||
          current.id_tanque - next.id_tanque,
      );
  }

  buildDashboardAnalytics(
    params: HistoricoDashboardAnalyticsParams,
  ): HistoricoDashboardAnalyticsResult {
    const seriesInput: HistoricoDashboardSeriesInput = {
      processos: params.input.processos,
      agrupamento: params.agrupamento,
      campo_data: params.campo_data,
    };

    return {
      kpis: this.calculateKpis(params.input),
      processos_por_status: this.buildProcessStatusChart(
        params.input.processos,
      ),
      processos_por_periodo: this.buildProcessPeriodSeries(seriesInput),
      eficiencia_por_periodo: this.buildEfficiencyPeriodSeries(seriesInput),
      tempo_execucao_por_periodo:
        this.buildExecutionTimePeriodSeries(seriesInput),
      alarmes_por_severidade: this.buildAlarmSeverityChart(
        params.input.alarmes,
      ),
      comparativo_tanques: this.buildTankComparison(params.input.tanques),
      processos_problematicos: this.analyticsService.getProblematicProcesses(
        params.input.processos,
        params.ranking_limit,
      ),
    };
  }

  private calculateTotalAlarmes(
    input: HistoricoDashboardAnalyticsInput,
  ): number {
    if (input.alarmes.length > 0) {
      return input.alarmes.length;
    }

    return this.analyticsService.calculateSum(
      input.processos.map((processo) => processo.total_alarmes),
    );
  }

  private calculateTotalAlarmesCriticos(
    input: HistoricoDashboardAnalyticsInput,
  ): number {
    if (input.alarmes.length > 0) {
      return input.alarmes.filter(
        (alarm) => alarm.severidade === severidadealarme.CRITICO,
      ).length;
    }

    return this.analyticsService.calculateSum(
      input.processos.map((processo) => processo.total_alarmes_criticos),
    );
  }

  private countByProcessStatus(
    processes: HistoricoProcessAnalyticsInput[],
    status: statusprocesso,
  ): number {
    return processes.filter((process) => process.status_processo === status)
      .length;
  }

  private getDateByField(
    process: HistoricoProcessAnalyticsInput,
    campo: HistoricoDashboardSeriesInput['campo_data'],
  ): Date | null {
    const date = process[campo];

    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      return null;
    }

    return date;
  }

  private formatPeriod(date: Date, grouping: HistoricoPeriodGrouping): string {
    if (grouping === 'SEMANA') {
      return this.getWeekKey(date);
    }

    const isoDate = date.toISOString();

    if (grouping === 'MES') {
      return isoDate.slice(0, 7);
    }

    return isoDate.slice(0, 10);
  }

  private getWeekKey(date: Date): string {
    const utcDate = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const day = utcDate.getUTCDay() || 7;

    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(
      ((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );

    return `${utcDate.getUTCFullYear()}-W${weekNumber
      .toString()
      .padStart(2, '0')}`;
  }

  private sortPeriodKeys(keys: string[]): string[] {
    return [...keys].sort((current, next) => current.localeCompare(next));
  }

  private groupProcessesByPeriod(
    input: HistoricoDashboardSeriesInput,
  ): Map<string, HistoricoProcessAnalyticsInput[]> {
    const grouped = new Map<string, HistoricoProcessAnalyticsInput[]>();

    input.processos.forEach((process) => {
      const date = this.getDateByField(process, input.campo_data);

      if (date === null) {
        return;
      }

      const period = this.formatPeriod(date, input.agrupamento);
      const currentGroup = grouped.get(period) ?? [];

      grouped.set(period, [...currentGroup, process]);
    });

    return grouped;
  }

  private groupTanks(
    tanks: HistoricoTankAnalyticsInput[],
  ): Map<number, HistoricoTankAnalyticsAccumulator> {
    const grouped = new Map<number, HistoricoTankAnalyticsAccumulator>();

    tanks.forEach((tank) => {
      const current = grouped.get(tank.id_tanque) ?? {
        id_tanque: tank.id_tanque,
        nome_tanque: tank.nome_tanque,
        total_processos: 0,
        eficiencia_values: [],
        tempo_execucao_values: [],
        vacuo_values: [],
        total_alarmes: 0,
        total_alarmes_criticos: 0,
      };

      grouped.set(tank.id_tanque, {
        id_tanque: current.id_tanque,
        nome_tanque: current.nome_tanque,
        total_processos: current.total_processos + 1,
        eficiencia_values: [...current.eficiencia_values, tank.eficiencia],
        tempo_execucao_values: [
          ...current.tempo_execucao_values,
          tank.tempo_execucao,
        ],
        vacuo_values: [...current.vacuo_values, tank.vacuo_medio],
        total_alarmes:
          current.total_alarmes + this.toSafeCount(tank.total_alarmes),
        total_alarmes_criticos:
          current.total_alarmes_criticos +
          this.toSafeCount(tank.total_alarmes_criticos),
      });
    });

    return grouped;
  }

  private toSafeCount(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  }
}
