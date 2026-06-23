import { Injectable } from '@nestjs/common';
import { severidadealarme } from '@prisma/client';
import type { statusprocesso } from '@prisma/client';
import {
  HistoricoDashboardAnalyticsService,
  HistoricoAnalyticsService,
  type HistoricoAlarmAnalyticsInput,
  type HistoricoDashboardAnalyticsInput,
  type HistoricoEventAnalyticsInput,
  type HistoricoProblematicProcessResult,
  type HistoricoProcessAnalyticsInput,
  type HistoricoTankAnalyticsInput,
} from './analytics';
import type {
  HistoricoDashboardQueryDto,
  HistoricoGraficoVacuoQueryDto,
  HistoricoProcessoAlarmesQueryDto,
  HistoricoProcessoEventosQueryDto,
  ListHistoricoProcessosQueryDto,
} from './dto';
import type {
  HistoricoAlarmSeverityChartPoint,
  HistoricoAlarmeSummary,
  HistoricoDashboardResponse,
  HistoricoEfficiencyTimePoint,
  HistoricoEventoSummary,
  HistoricoExecutionTimePoint,
  HistoricoKpis,
  HistoricoProcessoDetails,
  HistoricoProcessoListItem,
  HistoricoProcessoListResponse,
  HistoricoRelatorioSummary,
  HistoricoStatusChartPoint,
  HistoricoTanqueComparisonResponse,
  HistoricoTanqueRankingItem,
  HistoricoTanqueSummary,
  HistoricoTimeSeriesPoint,
  HistoricoVacuoChartResponse,
  PaginationMeta,
} from './interfaces';
import {
  HistoricoAlarmeMapper,
  HistoricoDashboardMapper,
  HistoricoEventoMapper,
  HistoricoProcessoMapper,
  HistoricoRelatorioMapper,
  HistoricoTanqueComparisonMapper,
  HistoricoTanqueMapper,
  HistoricoVacuoChartMapper,
} from './mappers';
import {
  HistoricoDashboardRepository,
  HistoricoRepository,
  type HistoricoDashboardRepositoryDataset,
  type HistoricoProcessAlarmRepositoryRaw,
  type HistoricoProcessDetailsRepositoryRaw,
  type HistoricoProcessTankRepositoryRaw,
} from './repositories';
import {
  HistoricoPermissionValidator,
  HistoricoProcessoValidator,
  HistoricoQueryValidator,
} from './validators';

type DecimalCompatible =
  | { toString(): string }
  | number
  | string
  | null
  | undefined;

export interface HistoricoCurrentUser {
  id_usuario?: number;
  nivel_acesso?: string;
  role?: string;
  perfil?: string;
}

interface HistoricoPaginatedSummary<T> {
  data: T[];
  meta: PaginationMeta;
}

interface HistoricoProcessAnalyticsTotals {
  total_alarmes?: number;
  total_alarmes_criticos?: number;
  total_eventos?: number;
  possui_relatorio?: boolean;
}

interface HistoricoProcessAnalyticsSource {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  vacuo_alvo: DecimalCompatible;
  vacuo_inicial: DecimalCompatible;
  vacuo_final: DecimalCompatible;
  vacuo_medio: DecimalCompatible;
  eficiencia: DecimalCompatible;
  tempo_maximo: number | null;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  criado_em: Date;
  parada_emergencia: boolean;
  total_alarmes?: number;
  total_alarmes_criticos?: number;
  total_eventos?: number;
  possui_relatorio?: boolean;
}

interface HistoricoTankAnalyticsSource {
  id_tanque: number;
  nome_tanque?: string;
  tanques?: {
    nome: string;
  } | null;
  status_tanque_processo?: string;
  vacuo_alvo: DecimalCompatible;
  vacuo_inicial: DecimalCompatible;
  vacuo_final: DecimalCompatible;
  vacuo_medio: DecimalCompatible;
  eficiencia: DecimalCompatible;
  tempo_execucao?: number | null;
  total_alarmes?: number;
  total_alarmes_criticos?: number;
  quantidade_leituras?: number;
}

interface HistoricoAlarmAnalyticsSource {
  id_alarme: number;
  severidade: HistoricoAlarmAnalyticsInput['severidade'];
  status_alarme: HistoricoAlarmAnalyticsInput['status_alarme'];
  ocorrido_em: Date;
  resolvido_em: Date | null;
}

interface HistoricoEventAnalyticsSource {
  id_evento_processo: number;
  severidade_evento: HistoricoEventAnalyticsInput['severidade_evento'];
  ocorrido_em: Date;
}

interface HistoricoProcessListMapperRaw {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  usuarios?: {
    id_usuario: number;
    nome: string;
  } | null;
  vacuo_alvo: number | string | null | undefined;
  vacuo_inicial: number | string | null | undefined;
  vacuo_final: number | string | null | undefined;
  vacuo_medio: number | string | null | undefined;
  eficiencia: number | string | null | undefined;
  tempo_maximo: number;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  criado_em: Date;
  parada_emergencia: boolean;
  _count?: {
    processostanques?: number;
    alarmes?: number;
    eventos?: number;
    relatorios?: number;
  };
  total_alarmes?: number;
  total_alarmes_criticos?: number;
  total_eventos?: number;
  possui_relatorio?: boolean;
}

interface HistoricoDashboardAnalyticsServiceResult {
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
export class HistoricoService {
  constructor(
    private readonly historicoRepository: HistoricoRepository,
    private readonly historicoDashboardRepository: HistoricoDashboardRepository,
    private readonly historicoProcessoMapper: HistoricoProcessoMapper,
    private readonly historicoTanqueMapper: HistoricoTanqueMapper,
    private readonly historicoAlarmeMapper: HistoricoAlarmeMapper,
    private readonly historicoEventoMapper: HistoricoEventoMapper,
    private readonly historicoRelatorioMapper: HistoricoRelatorioMapper,
    private readonly historicoDashboardMapper: HistoricoDashboardMapper,
    private readonly historicoVacuoChartMapper: HistoricoVacuoChartMapper,
    private readonly historicoTanqueComparisonMapper: HistoricoTanqueComparisonMapper,
    private readonly historicoAnalyticsService: HistoricoAnalyticsService,
    private readonly historicoDashboardAnalyticsService: HistoricoDashboardAnalyticsService,
    private readonly historicoQueryValidator: HistoricoQueryValidator,
    private readonly historicoProcessoValidator: HistoricoProcessoValidator,
    private readonly historicoPermissionValidator: HistoricoPermissionValidator,
  ) {}

  async listHistoricalProcesses(
    query: ListHistoricoProcessosQueryDto,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoProcessoListResponse> {
    this.historicoQueryValidator.validateListQuery(query);
    this.historicoPermissionValidator.validateCanUseListFilters({
      user: currentUser,
      query,
    });

    const result =
      await this.historicoRepository.findHistoricalProcesses(query);

    return this.historicoProcessoMapper.toListResponse(result);
  }

  async getHistoricalDashboard(
    query: HistoricoDashboardQueryDto,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoDashboardResponse> {
    this.historicoQueryValidator.validateDashboardQuery(query);
    this.historicoPermissionValidator.validateCanUseDashboardFilters({
      user: currentUser,
      query,
    });

    const dataset =
      await this.historicoDashboardRepository.getDashboardDataset(query);
    const analyticsInput = this.toDashboardAnalyticsInput(dataset);
    const analyticsResult =
      this.historicoDashboardAnalyticsService.buildDashboardAnalytics({
        input: analyticsInput,
        agrupamento: query.agrupamento ?? 'DIA',
        campo_data: query.campo_data ?? 'finalizado_em',
        ranking_limit: query.limite_rankings ?? 5,
      });

    return this.toDashboardResponse(analyticsResult);
  }

  async findHistoricalProcessById(
    id_processo: number,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoProcessoDetails> {
    this.historicoProcessoValidator.validateProcessId(id_processo);
    this.historicoPermissionValidator.validateCanViewHistoricalDetails(
      currentUser,
    );

    const processo = await this.getValidatedHistoricalProcess(id_processo);
    const { tanques, alarmes, eventos, relatorios } =
      await this.getProcessDetailsDataset(id_processo);
    const processoAnalyticsInput = this.toProcessAnalyticsInput(processo, {
      total_alarmes: alarmes.total,
      total_alarmes_criticos: this.countCriticalAlarms(alarmes.data),
      total_eventos: eventos.total,
      possui_relatorio: relatorios.length > 0,
    });

    return this.historicoProcessoMapper.toDetails({
      processo,
      tanques: this.historicoTanqueMapper.toSummaryList(tanques),
      resumo_alarmes: this.historicoAlarmeMapper.toResumo(alarmes.data),
      resumo_eventos: this.historicoEventoMapper.toResumo(eventos.data),
      relatorios: this.historicoRelatorioMapper.toSummaryList(relatorios),
      diagnostico: this.historicoAnalyticsService.classifyProcessResult(
        processoAnalyticsInput,
      ),
    });
  }

  async getHistoricalProcessTanks(
    id_processo: number,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoTanqueSummary[]> {
    this.historicoProcessoValidator.validateProcessId(id_processo);
    this.historicoPermissionValidator.validateCanViewHistoricalDetails(
      currentUser,
    );
    await this.getValidatedHistoricalProcess(id_processo);

    const tanques =
      await this.historicoRepository.findProcessTanks(id_processo);

    return this.historicoTanqueMapper.toSummaryList(tanques);
  }

  async getHistoricalProcessAlarms(
    id_processo: number,
    query: HistoricoProcessoAlarmesQueryDto,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoPaginatedSummary<HistoricoAlarmeSummary>> {
    this.historicoProcessoValidator.validateProcessId(id_processo);
    this.historicoQueryValidator.validateProcessAlarmsQuery(query);
    this.historicoPermissionValidator.validateCanViewHistoricalDetails(
      currentUser,
    );
    await this.getValidatedHistoricalProcess(id_processo);

    const result = await this.historicoRepository.findProcessAlarms(
      id_processo,
      query,
    );

    return {
      data: this.historicoAlarmeMapper.toSummaryList(result.data),
      meta: this.buildPaginationMeta(result.page, result.limit, result.total),
    };
  }

  async getHistoricalProcessEvents(
    id_processo: number,
    query: HistoricoProcessoEventosQueryDto,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoPaginatedSummary<HistoricoEventoSummary>> {
    this.historicoProcessoValidator.validateProcessId(id_processo);
    this.historicoQueryValidator.validateProcessEventsQuery(query);
    this.historicoPermissionValidator.validateCanViewHistoricalDetails(
      currentUser,
    );
    await this.getValidatedHistoricalProcess(id_processo);

    const result = await this.historicoRepository.findProcessEvents(
      id_processo,
      query,
    );

    return {
      data: this.historicoEventoMapper.toSummaryList(result.data),
      meta: this.buildPaginationMeta(result.page, result.limit, result.total),
    };
  }

  async getHistoricalProcessReports(
    id_processo: number,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoRelatorioSummary[]> {
    this.historicoProcessoValidator.validateProcessId(id_processo);
    this.historicoPermissionValidator.validateCanViewHistoricalReportMetadata(
      currentUser,
    );
    await this.getValidatedHistoricalProcess(id_processo);

    const relatorios =
      await this.historicoRepository.findProcessReportsMetadata(id_processo);

    return this.historicoRelatorioMapper.toSummaryList(relatorios);
  }

  async getHistoricalVacuumChart(
    id_processo: number,
    query: HistoricoGraficoVacuoQueryDto,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoVacuoChartResponse> {
    this.historicoProcessoValidator.validateProcessId(id_processo);
    this.historicoQueryValidator.validateVacuumChartQuery(query);
    this.historicoPermissionValidator.validateCanViewHistoricalDetails(
      currentUser,
    );

    const processo = await this.getValidatedHistoricalProcess(id_processo);
    const leituras = await this.historicoRepository.findVacuumReadingsByProcess(
      id_processo,
      query,
    );

    return this.historicoVacuoChartMapper.toResponse({
      id_processo,
      vacuo_alvo: processo.vacuo_alvo,
      data: leituras,
    });
  }

  async getHistoricalProcessDashboard(
    id_processo: number,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoDashboardResponse> {
    this.historicoProcessoValidator.validateProcessId(id_processo);
    this.historicoPermissionValidator.validateCanUseDashboardFilters({
      user: currentUser,
      query: {},
    });

    const processo = await this.getValidatedHistoricalProcess(id_processo);
    const { tanques, alarmes, eventos, relatorios } =
      await this.getProcessDetailsDataset(id_processo);
    const analyticsInput: HistoricoDashboardAnalyticsInput = {
      processos: [
        this.toProcessAnalyticsInput(processo, {
          total_alarmes: alarmes.total,
          total_alarmes_criticos: this.countCriticalAlarms(alarmes.data),
          total_eventos: eventos.total,
          possui_relatorio: relatorios.length > 0,
        }),
      ],
      tanques: tanques.map((tanque) => this.toTankAnalyticsInput(tanque)),
      alarmes: alarmes.data.map((alarme) => this.toAlarmAnalyticsInput(alarme)),
      eventos: eventos.data.map((evento) => this.toEventAnalyticsInput(evento)),
    };
    const analyticsResult =
      this.historicoDashboardAnalyticsService.buildDashboardAnalytics({
        input: analyticsInput,
        agrupamento: 'DIA',
        campo_data: 'finalizado_em',
        ranking_limit: 5,
      });

    return this.toDashboardResponse(analyticsResult);
  }

  async getHistoricalTankComparison(
    id_processo: number,
    currentUser: HistoricoCurrentUser,
  ): Promise<HistoricoTanqueComparisonResponse> {
    this.historicoProcessoValidator.validateProcessId(id_processo);
    this.historicoPermissionValidator.validateCanViewHistoricalDetails(
      currentUser,
    );
    await this.getValidatedHistoricalProcess(id_processo);

    const tanques =
      await this.historicoRepository.findProcessTanks(id_processo);
    const ranking = this.historicoDashboardAnalyticsService.buildTankComparison(
      tanques.map((tanque) => this.toTankAnalyticsInput(tanque)),
    );

    return this.historicoTanqueComparisonMapper.toResponse(ranking);
  }

  generateReportFromHistorico(): never {
    return this.historicoPermissionValidator.validateReportGenerationIsNotHistoricoResponsibility();
  }

  private async getValidatedHistoricalProcess(
    id_processo: number,
  ): Promise<HistoricoProcessDetailsRepositoryRaw> {
    const processo =
      await this.historicoRepository.findHistoricalProcessById(id_processo);

    this.historicoProcessoValidator.validateHistoricalProcess(
      processo,
      id_processo,
    );

    return processo;
  }

  private async getProcessDetailsDataset(id_processo: number): Promise<{
    tanques: HistoricoProcessTankRepositoryRaw[];
    alarmes: Awaited<ReturnType<HistoricoRepository['findProcessAlarms']>>;
    eventos: Awaited<ReturnType<HistoricoRepository['findProcessEvents']>>;
    relatorios: Awaited<
      ReturnType<HistoricoRepository['findProcessReportsMetadata']>
    >;
  }> {
    const alarmesQuery: HistoricoProcessoAlarmesQueryDto = {
      page: 1,
      limit: 100,
      order_direction: 'desc',
    };
    const eventosQuery: HistoricoProcessoEventosQueryDto = {
      page: 1,
      limit: 100,
      order_direction: 'desc',
    };
    const [tanques, alarmes, eventos, relatorios] = await Promise.all([
      this.historicoRepository.findProcessTanks(id_processo),
      this.historicoRepository.findProcessAlarms(id_processo, alarmesQuery),
      this.historicoRepository.findProcessEvents(id_processo, eventosQuery),
      this.historicoRepository.findProcessReportsMetadata(id_processo),
    ]);

    return {
      tanques,
      alarmes,
      eventos,
      relatorios,
    };
  }

  private buildPaginationMeta(
    page: number,
    limit: number,
    total: number,
  ): PaginationMeta {
    const { page: safePage, limit: safeLimit } = this.normalizePaginationInput(
      page,
      limit,
    );
    const safeTotal = this.safeNumber(total);
    const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / safeLimit);

    return {
      page: safePage,
      limit: safeLimit,
      total: safeTotal,
      total_pages: totalPages,
      has_next_page: safePage < totalPages,
      has_previous_page: safePage > 1,
    };
  }

  private toDashboardAnalyticsInput(
    dataset: HistoricoDashboardRepositoryDataset,
  ): HistoricoDashboardAnalyticsInput {
    return {
      processos: dataset.processos.map((processo) =>
        this.toProcessAnalyticsInput(processo),
      ),
      tanques: dataset.tanques.map((tanque) =>
        this.toTankAnalyticsInput(tanque),
      ),
      alarmes: dataset.alarmes.map((alarme) =>
        this.toAlarmAnalyticsInput(alarme),
      ),
      eventos: dataset.eventos.map((evento) =>
        this.toEventAnalyticsInput(evento),
      ),
    };
  }

  private toProcessAnalyticsInput(
    processo: HistoricoProcessAnalyticsSource,
    totals: HistoricoProcessAnalyticsTotals = {},
  ): HistoricoProcessAnalyticsInput {
    return {
      id_processo: processo.id_processo,
      nome_processo: processo.nome_processo,
      status_processo: processo.status_processo,
      vacuo_alvo: this.decimalToNumber(processo.vacuo_alvo),
      vacuo_inicial: this.decimalToNumber(processo.vacuo_inicial),
      vacuo_final: this.decimalToNumber(processo.vacuo_final),
      vacuo_medio: this.decimalToNumber(processo.vacuo_medio),
      eficiencia: this.decimalToNumber(processo.eficiencia),
      tempo_maximo: processo.tempo_maximo,
      tempo_execucao: processo.tempo_execucao,
      iniciado_em: processo.iniciado_em,
      finalizado_em: processo.finalizado_em,
      criado_em: processo.criado_em,
      parada_emergencia: processo.parada_emergencia,
      total_alarmes: this.safeNumber(
        totals.total_alarmes ?? processo.total_alarmes,
      ),
      total_alarmes_criticos: this.safeNumber(
        totals.total_alarmes_criticos ?? processo.total_alarmes_criticos,
      ),
      total_eventos: this.safeNumber(
        totals.total_eventos ?? processo.total_eventos,
      ),
      possui_relatorio:
        totals.possui_relatorio ?? processo.possui_relatorio ?? false,
    };
  }

  private toTankAnalyticsInput(
    tanque: HistoricoTankAnalyticsSource,
  ): HistoricoTankAnalyticsInput {
    return {
      id_tanque: tanque.id_tanque,
      nome_tanque:
        tanque.nome_tanque ?? tanque.tanques?.nome ?? 'Tanque nao identificado',
      status_tanque_processo: tanque.status_tanque_processo,
      vacuo_alvo: this.decimalToNumber(tanque.vacuo_alvo),
      vacuo_inicial: this.decimalToNumber(tanque.vacuo_inicial),
      vacuo_final: this.decimalToNumber(tanque.vacuo_final),
      vacuo_medio: this.decimalToNumber(tanque.vacuo_medio),
      eficiencia: this.decimalToNumber(tanque.eficiencia),
      tempo_execucao: tanque.tempo_execucao,
      total_alarmes: this.safeNumber(tanque.total_alarmes),
      total_alarmes_criticos: this.safeNumber(tanque.total_alarmes_criticos),
      quantidade_leituras: this.safeNumber(tanque.quantidade_leituras),
    };
  }

  private toAlarmAnalyticsInput(
    alarm: HistoricoAlarmAnalyticsSource,
  ): HistoricoAlarmAnalyticsInput {
    return {
      id_alarme: alarm.id_alarme,
      severidade: alarm.severidade,
      status_alarme: alarm.status_alarme,
      ocorrido_em: alarm.ocorrido_em,
      resolvido_em: alarm.resolvido_em,
    };
  }

  private toEventAnalyticsInput(
    event: HistoricoEventAnalyticsSource,
  ): HistoricoEventAnalyticsInput {
    return {
      id_evento_processo: event.id_evento_processo,
      severidade_evento: event.severidade_evento,
      ocorrido_em: event.ocorrido_em,
    };
  }

  private toDashboardResponse(
    analyticsResult: HistoricoDashboardAnalyticsServiceResult,
  ): HistoricoDashboardResponse {
    return this.historicoDashboardMapper.toDashboardResponse({
      kpis: analyticsResult.kpis,
      processos_por_status: analyticsResult.processos_por_status,
      processos_por_periodo: analyticsResult.processos_por_periodo,
      eficiencia_por_periodo: analyticsResult.eficiencia_por_periodo,
      tempo_execucao_por_periodo: analyticsResult.tempo_execucao_por_periodo,
      alarmes_por_severidade: analyticsResult.alarmes_por_severidade,
      comparativo_tanques: analyticsResult.comparativo_tanques,
      processos_problematicos: this.toProblematicProcessListItems(
        analyticsResult.processos_problematicos,
      ),
    });
  }

  private toProblematicProcessListItems(
    problematicProcesses: HistoricoProblematicProcessResult[],
  ): HistoricoProcessoListItem[] {
    return problematicProcesses.map((item) =>
      this.historicoProcessoMapper.toListItem(
        this.toProcessListItemRaw(item.processo),
      ),
    );
  }

  private toProcessListItemRaw(
    processo: HistoricoProcessAnalyticsInput,
  ): HistoricoProcessListMapperRaw {
    return {
      id_processo: processo.id_processo,
      nome_processo: processo.nome_processo,
      status_processo: processo.status_processo,
      vacuo_alvo: processo.vacuo_alvo,
      vacuo_inicial: processo.vacuo_inicial,
      vacuo_final: processo.vacuo_final,
      vacuo_medio: processo.vacuo_medio,
      eficiencia: processo.eficiencia,
      tempo_maximo: this.safeNumber(processo.tempo_maximo),
      tempo_execucao: processo.tempo_execucao,
      iniciado_em: processo.iniciado_em,
      finalizado_em: processo.finalizado_em,
      criado_em: processo.criado_em,
      parada_emergencia: processo.parada_emergencia,
      usuarios: null,
      _count: {
        processostanques: 0,
        alarmes: processo.total_alarmes,
        eventos: processo.total_eventos,
        relatorios: processo.possui_relatorio ? 1 : 0,
      },
      total_alarmes: processo.total_alarmes,
      total_alarmes_criticos: processo.total_alarmes_criticos,
      total_eventos: processo.total_eventos,
      possui_relatorio: processo.possui_relatorio,
    };
  }

  private decimalToNumber(value: DecimalCompatible): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      return this.stringToNumber(value);
    }

    return this.stringToNumber(value.toString());
  }

  private safeNumber(value: number | null | undefined, fallback = 0): number {
    return Number.isFinite(value) && value !== null && value !== undefined
      ? value
      : fallback;
  }

  private normalizePaginationInput(
    page?: number,
    limit?: number,
  ): { page: number; limit: number } {
    return {
      page: Number.isFinite(page) && page !== undefined && page >= 1 ? page : 1,
      limit:
        Number.isFinite(limit) && limit !== undefined && limit >= 1 ? limit : 1,
    };
  }

  private countCriticalAlarms(
    alarms: HistoricoProcessAlarmRepositoryRaw[],
  ): number {
    return alarms.filter(
      (alarm) => alarm.severidade === severidadealarme.CRITICO,
    ).length;
  }

  private stringToNumber(value: string): number | null {
    const parsed = Number(value.trim());

    return Number.isFinite(parsed) ? parsed : null;
  }
}
