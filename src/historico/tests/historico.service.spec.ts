import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  origemalarme,
  origemevento,
  severidadealarme,
  severidadeevento,
  statusalarme,
  statusprocesso,
  statustanqueprocesso,
  tipoalarme,
  tipoeventoprocesso,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import {
  HistoricoAnalyticsService,
  HistoricoDashboardAnalyticsService,
} from '../analytics';
import {
  HistoricoService,
  type HistoricoCurrentUser,
} from '../historico.service';
import {
  HistoricoAlarmeMapper,
  HistoricoDashboardMapper,
  HistoricoEventoMapper,
  HistoricoProcessoMapper,
  HistoricoRelatorioMapper,
  HistoricoTanqueComparisonMapper,
  HistoricoTanqueMapper,
  HistoricoVacuoChartMapper,
} from '../mappers';
import {
  HistoricoDashboardRepository,
  HistoricoRepository,
} from '../repositories';
import {
  HistoricoPermissionValidator,
  HistoricoProcessoValidator,
  HistoricoQueryValidator,
} from '../validators';

type AsyncMock<T = unknown> = Mock<(...args: unknown[]) => Promise<T>>;
type SyncMock<T = unknown> = Mock<(...args: unknown[]) => T>;

const asyncMock = <T = unknown>(): AsyncMock<T> =>
  jest.fn<(...args: unknown[]) => Promise<T>>();

const syncMock = <T = unknown>(): SyncMock<T> =>
  jest.fn<(...args: unknown[]) => T>();

type RepositoryMock = {
  findHistoricalProcesses: AsyncMock;
  findHistoricalProcessById: AsyncMock;
  findProcessTanks: AsyncMock;
  findProcessAlarms: AsyncMock;
  findProcessEvents: AsyncMock;
  findProcessReportsMetadata: AsyncMock;
  findVacuumReadingsByProcess: AsyncMock;
};

type DashboardRepositoryMock = {
  getDashboardDataset: AsyncMock;
};

type ProcessoMapperMock = {
  toListResponse: SyncMock;
  toDetails: SyncMock;
  toListItem: SyncMock;
};

type TanqueMapperMock = {
  toSummaryList: SyncMock;
};

type AlarmeMapperMock = {
  toSummaryList: SyncMock;
  toResumo: SyncMock;
};

type EventoMapperMock = {
  toSummaryList: SyncMock;
  toResumo: SyncMock;
};

type RelatorioMapperMock = {
  toSummaryList: SyncMock;
};

type DashboardMapperMock = {
  toDashboardResponse: SyncMock;
};

type VacuoChartMapperMock = {
  toResponse: SyncMock;
};

type TanqueComparisonMapperMock = {
  toResponse: SyncMock;
};

type AnalyticsMock = {
  classifyProcessResult: SyncMock;
};

type DashboardAnalyticsMock = {
  buildDashboardAnalytics: SyncMock;
  buildTankComparison: SyncMock;
};

type QueryValidatorMock = {
  validateListQuery: SyncMock<void>;
  validateDashboardQuery: SyncMock<void>;
  validateProcessAlarmsQuery: SyncMock<void>;
  validateProcessEventsQuery: SyncMock<void>;
  validateVacuumChartQuery: SyncMock<void>;
};

type ProcessoValidatorMock = {
  validateProcessId: SyncMock<void>;
  validateHistoricalProcess: SyncMock<void>;
};

type PermissionValidatorMock = {
  validateCanUseListFilters: SyncMock<void>;
  validateCanUseDashboardFilters: SyncMock<void>;
  validateCanViewHistoricalDetails: SyncMock<void>;
  validateCanViewHistoricalReportMetadata: SyncMock<void>;
  validateReportGenerationIsNotHistoricoResponsibility: SyncMock<never>;
};

describe('HistoricoService', () => {
  let service: HistoricoService;
  let repository: RepositoryMock;
  let dashboardRepository: DashboardRepositoryMock;
  let processoMapper: ProcessoMapperMock;
  let tanqueMapper: TanqueMapperMock;
  let alarmeMapper: AlarmeMapperMock;
  let eventoMapper: EventoMapperMock;
  let relatorioMapper: RelatorioMapperMock;
  let dashboardMapper: DashboardMapperMock;
  let vacuoChartMapper: VacuoChartMapperMock;
  let tanqueComparisonMapper: TanqueComparisonMapperMock;
  let analyticsService: AnalyticsMock;
  let dashboardAnalyticsService: DashboardAnalyticsMock;
  let queryValidator: QueryValidatorMock;
  let processoValidator: ProcessoValidatorMock;
  let permissionValidator: PermissionValidatorMock;
  const currentUser: HistoricoCurrentUser = {
    id_usuario: 7,
    nivel_acesso: 'TECNICO',
  };

  beforeEach(() => {
    repository = {
      findHistoricalProcesses: asyncMock(),
      findHistoricalProcessById: asyncMock(),
      findProcessTanks: asyncMock(),
      findProcessAlarms: asyncMock(),
      findProcessEvents: asyncMock(),
      findProcessReportsMetadata: asyncMock(),
      findVacuumReadingsByProcess: asyncMock(),
    };
    dashboardRepository = {
      getDashboardDataset: asyncMock(),
    };
    processoMapper = {
      toListResponse: syncMock(),
      toDetails: syncMock(),
      toListItem: syncMock(),
    };
    tanqueMapper = {
      toSummaryList: syncMock(),
    };
    alarmeMapper = {
      toSummaryList: syncMock(),
      toResumo: syncMock(),
    };
    eventoMapper = {
      toSummaryList: syncMock(),
      toResumo: syncMock(),
    };
    relatorioMapper = {
      toSummaryList: syncMock(),
    };
    dashboardMapper = {
      toDashboardResponse: syncMock(),
    };
    vacuoChartMapper = {
      toResponse: syncMock(),
    };
    tanqueComparisonMapper = {
      toResponse: syncMock(),
    };
    analyticsService = {
      classifyProcessResult: syncMock(),
    };
    dashboardAnalyticsService = {
      buildDashboardAnalytics: syncMock(),
      buildTankComparison: syncMock(),
    };
    queryValidator = {
      validateListQuery: syncMock(),
      validateDashboardQuery: syncMock(),
      validateProcessAlarmsQuery: syncMock(),
      validateProcessEventsQuery: syncMock(),
      validateVacuumChartQuery: syncMock(),
    };
    processoValidator = {
      validateProcessId: syncMock(),
      validateHistoricalProcess: syncMock(),
    };
    permissionValidator = {
      validateCanUseListFilters: syncMock(),
      validateCanUseDashboardFilters: syncMock(),
      validateCanViewHistoricalDetails: syncMock(),
      validateCanViewHistoricalReportMetadata: syncMock(),
      validateReportGenerationIsNotHistoricoResponsibility: syncMock(),
    };

    service = new HistoricoService(
      repository as unknown as HistoricoRepository,
      dashboardRepository as unknown as HistoricoDashboardRepository,
      processoMapper as unknown as HistoricoProcessoMapper,
      tanqueMapper as unknown as HistoricoTanqueMapper,
      alarmeMapper as unknown as HistoricoAlarmeMapper,
      eventoMapper as unknown as HistoricoEventoMapper,
      relatorioMapper as unknown as HistoricoRelatorioMapper,
      dashboardMapper as unknown as HistoricoDashboardMapper,
      vacuoChartMapper as unknown as HistoricoVacuoChartMapper,
      tanqueComparisonMapper as unknown as HistoricoTanqueComparisonMapper,
      analyticsService as unknown as HistoricoAnalyticsService,
      dashboardAnalyticsService as unknown as HistoricoDashboardAnalyticsService,
      queryValidator as unknown as HistoricoQueryValidator,
      processoValidator as unknown as HistoricoProcessoValidator,
      permissionValidator as unknown as HistoricoPermissionValidator,
    );
  });

  it('listHistoricalProcesses valida, consulta, mapeia e nao modifica a query original', async () => {
    const query = { page: 1, limit: 10, id_usuario: 7 };
    const querySnapshot = { ...query };
    const repositoryResult = {
      data: [makeProcessRaw()],
      total: 1,
      page: 1,
      limit: 10,
    };
    const mappedResponse = {
      data: [{ id_processo: 10 }],
      meta: { total: 1 },
    };
    repository.findHistoricalProcesses.mockResolvedValue(repositoryResult);
    processoMapper.toListResponse.mockReturnValue(mappedResponse);

    await expect(
      service.listHistoricalProcesses(query, currentUser),
    ).resolves.toBe(mappedResponse);

    expect(queryValidator.validateListQuery).toHaveBeenCalledWith(query);
    expect(permissionValidator.validateCanUseListFilters).toHaveBeenCalledWith({
      user: currentUser,
      query,
    });
    expect(repository.findHistoricalProcesses).toHaveBeenCalledWith(query);
    expect(processoMapper.toListResponse).toHaveBeenCalledWith(
      repositoryResult,
    );
    expect(query).toEqual(querySnapshot);
  });

  it('listHistoricalProcesses propaga bloqueio de OPERADOR com id_usuario sem consultar repository', async () => {
    const query = { id_usuario: 99 };
    permissionValidator.validateCanUseListFilters.mockImplementation(() => {
      throw new ForbiddenException('id_usuario restrito');
    });

    await expect(
      service.listHistoricalProcesses(query, {
        id_usuario: 1,
        nivel_acesso: 'OPERADOR',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.findHistoricalProcesses).not.toHaveBeenCalled();
    expect(processoMapper.toListResponse).not.toHaveBeenCalled();
  });

  it('getHistoricalDashboard valida, consulta dataset, chama analytics e mapper', async () => {
    const query = {
      agrupamento: 'DIA' as const,
      campo_data: 'finalizado_em' as const,
      limite_rankings: 3,
    };
    const dataset = {
      processos: [makeProcessRaw()],
      tanques: [makeTankRaw()],
      alarmes: [makeAlarmRaw()],
      eventos: [makeEventRaw()],
    };
    const analyticsResult = makeDashboardAnalyticsResult();
    const response = { kpis: analyticsResult.kpis };
    dashboardRepository.getDashboardDataset.mockResolvedValue(dataset);
    dashboardAnalyticsService.buildDashboardAnalytics.mockReturnValue(
      analyticsResult,
    );
    dashboardMapper.toDashboardResponse.mockReturnValue(response);

    await expect(
      service.getHistoricalDashboard(query, currentUser),
    ).resolves.toBe(response);

    expect(queryValidator.validateDashboardQuery).toHaveBeenCalledWith(query);
    expect(
      permissionValidator.validateCanUseDashboardFilters,
    ).toHaveBeenCalledWith({ user: currentUser, query });
    expect(dashboardRepository.getDashboardDataset).toHaveBeenCalledWith(query);
    expect(
      dashboardAnalyticsService.buildDashboardAnalytics,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        agrupamento: 'DIA',
        campo_data: 'finalizado_em',
        ranking_limit: 3,
      }),
    );
    expect(dashboardMapper.toDashboardResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        kpis: analyticsResult.kpis,
      }),
    );
  });

  it('findHistoricalProcessById valida processo, busca complementos e monta detalhe mapeado', async () => {
    const processo = makeProcessRaw({
      id_processo: 22,
      pausado_em: null,
      retomado_em: null,
    });
    const tanques = [makeTankRaw()];
    const alarmes = { data: [makeAlarmRaw()], total: 1, page: 1, limit: 100 };
    const eventos = { data: [makeEventRaw()], total: 1, page: 1, limit: 100 };
    const relatorios = [makeReportRaw()];
    const tanqueSummaries = [{ id_tanque: 1 }];
    const alarmeResumo = { total: 1, info: 0, medio: 0, critico: 1 };
    const eventoResumo = { total: 1, info: 1, aviso: 0, critico: 0 };
    const relatorioSummaries = [{ id_relatorio: 4 }];
    const diagnostico = {
      classificacao_resultado: 'NORMAL',
      motivos: [],
      recomendacoes: [],
    };
    const detail = { processo: { id_processo: 22 } };
    repository.findHistoricalProcessById.mockResolvedValue(processo);
    repository.findProcessTanks.mockResolvedValue(tanques);
    repository.findProcessAlarms.mockResolvedValue(alarmes);
    repository.findProcessEvents.mockResolvedValue(eventos);
    repository.findProcessReportsMetadata.mockResolvedValue(relatorios);
    tanqueMapper.toSummaryList.mockReturnValue(tanqueSummaries);
    alarmeMapper.toResumo.mockReturnValue(alarmeResumo);
    eventoMapper.toResumo.mockReturnValue(eventoResumo);
    relatorioMapper.toSummaryList.mockReturnValue(relatorioSummaries);
    analyticsService.classifyProcessResult.mockReturnValue(diagnostico);
    processoMapper.toDetails.mockReturnValue(detail);

    await expect(
      service.findHistoricalProcessById(22, currentUser),
    ).resolves.toBe(detail);

    expect(processoValidator.validateProcessId).toHaveBeenCalledWith(22);
    expect(
      permissionValidator.validateCanViewHistoricalDetails,
    ).toHaveBeenCalledWith(currentUser);
    expect(repository.findHistoricalProcessById).toHaveBeenCalledWith(22);
    expect(processoValidator.validateHistoricalProcess).toHaveBeenCalledWith(
      processo,
      22,
    );
    expect(repository.findProcessTanks).toHaveBeenCalledWith(22);
    expect(repository.findProcessAlarms).toHaveBeenCalledWith(
      22,
      expect.objectContaining({ page: 1, limit: 100 }),
    );
    expect(repository.findProcessEvents).toHaveBeenCalledWith(
      22,
      expect.objectContaining({ page: 1, limit: 100 }),
    );
    expect(repository.findProcessReportsMetadata).toHaveBeenCalledWith(22);
    expect(tanqueMapper.toSummaryList).toHaveBeenCalledWith(tanques);
    expect(alarmeMapper.toResumo).toHaveBeenCalledWith(alarmes.data);
    expect(eventoMapper.toResumo).toHaveBeenCalledWith(eventos.data);
    expect(relatorioMapper.toSummaryList).toHaveBeenCalledWith(relatorios);
    expect(analyticsService.classifyProcessResult).toHaveBeenCalledWith(
      expect.objectContaining({
        id_processo: 22,
        total_alarmes: 1,
        total_alarmes_criticos: 1,
        total_eventos: 1,
        possui_relatorio: true,
      }),
    );
    expect(processoMapper.toDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        processo,
        tanques: tanqueSummaries,
        resumo_alarmes: alarmeResumo,
        resumo_eventos: eventoResumo,
        relatorios: relatorioSummaries,
        diagnostico,
      }),
    );
  });

  it('getHistoricalProcessReports retorna somente metadados mapeados e nao gera relatorio', async () => {
    const processo = makeProcessRaw({ id_processo: 30 });
    const relatorios = [makeReportRaw()];
    const summaries = [
      {
        id_relatorio: 4,
        nome_arquivo: 'relatorio.pdf',
      },
    ];
    repository.findHistoricalProcessById.mockResolvedValue(processo);
    repository.findProcessReportsMetadata.mockResolvedValue(relatorios);
    relatorioMapper.toSummaryList.mockReturnValue(summaries);

    await expect(
      service.getHistoricalProcessReports(30, currentUser),
    ).resolves.toBe(summaries);

    expect(processoValidator.validateProcessId).toHaveBeenCalledWith(30);
    expect(
      permissionValidator.validateCanViewHistoricalReportMetadata,
    ).toHaveBeenCalledWith(currentUser);
    expect(repository.findProcessReportsMetadata).toHaveBeenCalledWith(30);
    expect(relatorioMapper.toSummaryList).toHaveBeenCalledWith(relatorios);
    expect(
      permissionValidator.validateReportGenerationIsNotHistoricoResponsibility,
    ).not.toHaveBeenCalled();
    expect(JSON.stringify(summaries)).not.toContain('download');
    expect(JSON.stringify(summaries)).not.toContain('preview');
    expect(JSON.stringify(summaries)).not.toContain('base64');
  });

  it('getHistoricalVacuumChart valida, busca processo, consulta leituras e chama mapper', async () => {
    const query = { limite_pontos: 50, order_direction: 'asc' as const };
    const processo = makeProcessRaw({ id_processo: 40, vacuo_alvo: '12.5' });
    const readings = [makeVacuumReadingRaw()];
    const chart = {
      id_processo: 40,
      vacuo_alvo: 12.5,
      total_pontos: 1,
      data: [],
    };
    repository.findHistoricalProcessById.mockResolvedValue(processo);
    repository.findVacuumReadingsByProcess.mockResolvedValue(readings);
    vacuoChartMapper.toResponse.mockReturnValue(chart);

    await expect(
      service.getHistoricalVacuumChart(40, query, currentUser),
    ).resolves.toBe(chart);

    expect(processoValidator.validateProcessId).toHaveBeenCalledWith(40);
    expect(queryValidator.validateVacuumChartQuery).toHaveBeenCalledWith(query);
    expect(
      permissionValidator.validateCanViewHistoricalDetails,
    ).toHaveBeenCalledWith(currentUser);
    expect(repository.findHistoricalProcessById).toHaveBeenCalledWith(40);
    expect(repository.findVacuumReadingsByProcess).toHaveBeenCalledWith(
      40,
      query,
    );
    expect(vacuoChartMapper.toResponse).toHaveBeenCalledWith({
      id_processo: 40,
      vacuo_alvo: processo.vacuo_alvo,
      data: readings,
    });
  });

  it('generateReportFromHistorico chama trava do validator e nao consulta repository', () => {
    permissionValidator.validateReportGenerationIsNotHistoricoResponsibility.mockImplementation(
      () => {
        throw new BadRequestException('relatorios module');
      },
    );

    expect(() => service.generateReportFromHistorico()).toThrow(
      BadRequestException,
    );
    expect(
      permissionValidator.validateReportGenerationIsNotHistoricoResponsibility,
    ).toHaveBeenCalledTimes(1);
    expect(repository.findHistoricalProcesses).not.toHaveBeenCalled();
    expect(repository.findHistoricalProcessById).not.toHaveBeenCalled();
    expect(repository.findProcessReportsMetadata).not.toHaveBeenCalled();
  });
});

function makeProcessRaw(overrides: Record<string, unknown> = {}) {
  return {
    id_processo: 10,
    nome_processo: 'Processo historico',
    status_processo: statusprocesso.CONCLUIDO,
    usuarios: { id_usuario: 7, nome: 'Tecnico' },
    vacuo_alvo: '12.5',
    vacuo_inicial: '0',
    vacuo_final: '12',
    vacuo_medio: '11.5',
    eficiencia: '95',
    tempo_maximo: 120,
    tempo_execucao: 100,
    iniciado_em: new Date('2026-01-01T10:00:00Z'),
    pausado_em: null,
    retomado_em: null,
    finalizado_em: new Date('2026-01-01T10:10:00Z'),
    criado_em: new Date('2026-01-01T09:50:00Z'),
    parada_emergencia: false,
    _count: {
      processostanques: 1,
      alarmes: 1,
      eventos: 1,
      relatorios: 1,
    },
    total_alarmes: 1,
    total_alarmes_criticos: 0,
    total_eventos: 1,
    possui_relatorio: true,
    ...overrides,
  };
}

function makeTankRaw(overrides: Record<string, unknown> = {}) {
  return {
    id_processo_tanque: 20,
    id_tanque: 2,
    status_tanque_processo: statustanqueprocesso.CONCLUIDO,
    tanques: {
      id_tanque: 2,
      nome: 'Tanque 2',
      volume: '100',
      unidade_volume: 'L',
    },
    vacuo_alvo: '12',
    vacuo_inicial: '0',
    vacuo_final: '11.8',
    vacuo_medio: '11',
    eficiencia: '94',
    iniciado_em: new Date('2026-01-01T10:00:00Z'),
    finalizado_em: new Date('2026-01-01T10:10:00Z'),
    tempo_execucao: 100,
    total_alarmes: 1,
    total_alarmes_criticos: 0,
    quantidade_leituras: 5,
    _count: {
      processostanquessensores: 1,
      alarmes: 1,
    },
    ...overrides,
  };
}

function makeAlarmRaw(overrides: Record<string, unknown> = {}) {
  return {
    id_alarme: 30,
    titulo: 'Alarme critico',
    descricao: 'Vacuo fora do esperado',
    tipo_alarme: tipoalarme.PROCESSO,
    severidade: severidadealarme.CRITICO,
    status_alarme: statusalarme.ATIVO,
    origem_alarme: origemalarme.SISTEMA,
    valor_detectado: '1',
    unidade: 'kPa',
    ocorrido_em: new Date('2026-01-01T10:05:00Z'),
    resolvido_em: null,
    id_processo: 10,
    id_processo_tanque: 20,
    id_processo_tanque_sensor: 21,
    ...overrides,
  };
}

function makeEventRaw(overrides: Record<string, unknown> = {}) {
  return {
    id_evento_processo: 40,
    id_processo: 10,
    id_processo_tanque_sensor: 21,
    tipo_evento: tipoeventoprocesso.PROCESSO_CONCLUIDO,
    origem_evento: origemevento.SISTEMA,
    severidade_evento: severidadeevento.INFO,
    ocorrido_em: new Date('2026-01-01T10:10:00Z'),
    ...overrides,
  };
}

function makeReportRaw(overrides: Record<string, unknown> = {}) {
  return {
    id_relatorio: 50,
    tipo_relatorio: 'PROCESSO',
    formato_relatorio: 'PDF',
    titulo: 'Relatorio',
    descricao: null,
    nome_arquivo: 'relatorio.pdf',
    tamanho_bytes: 1024,
    gerado_em: new Date('2026-01-01T10:20:00Z'),
    ...overrides,
  };
}

function makeVacuumReadingRaw(overrides: Record<string, unknown> = {}) {
  return {
    id_leitura_sensor: 60,
    id_processo_tanque_sensor: 21,
    valor_vacuo: '11.9',
    leitura_em: new Date('2026-01-01T10:06:00Z'),
    recebido_em: new Date('2026-01-01T10:06:01Z'),
    processostanquessensores: {
      id_sensor: 3,
      sensores: { id_sensor: 3, nome: 'Sensor 3' },
      processostanques: {
        id_tanque: 2,
        tanques: { id_tanque: 2, nome: 'Tanque 2' },
      },
    },
    ...overrides,
  };
}

function makeDashboardAnalyticsResult() {
  return {
    kpis: {
      total_processos: 1,
      total_concluidos: 1,
      total_interrompidos: 0,
      total_falhas: 0,
      taxa_sucesso_percentual: 100,
      eficiencia_media: 95,
      tempo_execucao_medio: 100,
      tempo_execucao_total: 100,
      vacuo_medio_geral: 11.5,
      vacuo_final_medio: 12,
      processos_com_parada_emergencia: 0,
      total_alarmes: 1,
      total_alarmes_criticos: 1,
      media_alarmes_por_processo: 1,
    },
    processos_por_status: [],
    processos_por_periodo: [],
    eficiencia_por_periodo: [],
    tempo_execucao_por_periodo: [],
    alarmes_por_severidade: [],
    comparativo_tanques: [],
    processos_problematicos: [],
  };
}
