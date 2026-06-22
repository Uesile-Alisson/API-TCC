import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  origemevento,
  severidadeevento,
  statussensor,
  statusprocesso,
  statustanqueprocesso,
  tipoeventoprocesso,
} from '@prisma/client';
import { LeiturasAnalyticsService } from '../analytics';
import { EventoMapper, GraficoVacuoMapper, LeituraMapper } from '../mappers';
import { EventosRepository, LeiturasRepository } from '../repositories';
import type {
  EventoDetailsRecord,
  EventoListRecord,
  EventoTimelineRecord,
  LeituraChartRecord,
  LeituraDetailsRecord,
  LeituraListRecord,
  LeituraStatsRecord,
} from '../repositories';
import { ProcessoTimelineService } from '../timeline';
import { LeiturasEventosService } from '../leituras-eventos.service';
import {
  LeiturasEventosQueryValidator,
  ProcessoLeituraValidator,
} from '../validators';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type AsyncMock<
  Args extends unknown[] = unknown[],
  Result = unknown,
> = jest.Mock<(...args: Args) => Promise<Result>>;

type SyncMock<Args extends unknown[] = unknown[], Result = unknown> = jest.Mock<
  (...args: Args) => Result
>;

type VoidMock<Args extends unknown[] = unknown[]> = jest.Mock<
  (...args: Args) => void
>;

type LeiturasRepositoryMock = {
  list: AsyncMock;
  count: AsyncMock;
  listAndCount: AsyncMock;
  findById: AsyncMock;
  findDetailsById: AsyncMock;
  findByProcess: AsyncMock;
  findByProcessTanqueSensor: AsyncMock;
  findChartDataByProcess: AsyncMock;
  findChartDataByProcessTanqueSensor: AsyncMock;
  getStatsByProcess: AsyncMock;
};

type EventosRepositoryMock = {
  list: AsyncMock;
  count: AsyncMock;
  listAndCount: AsyncMock;
  findById: AsyncMock;
  findDetailsById: AsyncMock;
  findByProcess: AsyncMock;
  findByProcessTanqueSensor: AsyncMock;
  getEventStatsByProcess: AsyncMock;
  findTimelineEventsByProcess: AsyncMock;
};

type LeituraMapperMock = {
  decimalToNumber: SyncMock;
  toResponse: SyncMock;
  toDetails: SyncMock;
  toListResponse: SyncMock;
};

type EventoMapperMock = {
  toResponse: SyncMock;
  toDetails: SyncMock;
  toListResponse: SyncMock;
};

type GraficoVacuoMapperMock = {
  toChartPoint: SyncMock;
  toChartResponse: SyncMock;
  limitChartPoints: SyncMock;
};

type AnalyticsServiceMock = {
  calculateAnalytics: SyncMock;
};

type TimelineServiceMock = {
  buildProcessTimeline: SyncMock;
};

type QueryValidatorMock = {
  validateListLeiturasQuery: VoidMock;
  validateListEventosQuery: VoidMock;
  validateGraficoVacuoQuery: VoidMock;
  validateTimelineQuery: VoidMock;
};

type ProcessoLeituraValidatorMock = {
  validateLeituraExists: VoidMock;
  validateEventoExists: VoidMock;
};

describe('LeiturasEventosService', () => {
  let service: LeiturasEventosService;
  let leiturasRepository: LeiturasRepositoryMock;
  let eventosRepository: EventosRepositoryMock;
  let leituraMapper: LeituraMapperMock;
  let eventoMapper: EventoMapperMock;
  let graficoVacuoMapper: GraficoVacuoMapperMock;
  let analyticsService: AnalyticsServiceMock;
  let timelineService: TimelineServiceMock;
  let queryValidator: QueryValidatorMock;
  let processoLeituraValidator: ProcessoLeituraValidatorMock;

  beforeEach(async () => {
    leiturasRepository = buildLeiturasRepositoryMock();
    eventosRepository = buildEventosRepositoryMock();
    leituraMapper = buildLeituraMapperMock();
    eventoMapper = buildEventoMapperMock();
    graficoVacuoMapper = buildGraficoVacuoMapperMock();
    analyticsService = buildAnalyticsMock();
    timelineService = buildTimelineMock();
    queryValidator = buildQueryValidatorMock();
    processoLeituraValidator = buildProcessoLeituraValidatorMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeiturasEventosService,
        { provide: LeiturasRepository, useValue: leiturasRepository },
        { provide: EventosRepository, useValue: eventosRepository },
        { provide: LeituraMapper, useValue: leituraMapper },
        { provide: EventoMapper, useValue: eventoMapper },
        { provide: GraficoVacuoMapper, useValue: graficoVacuoMapper },
        { provide: LeiturasAnalyticsService, useValue: analyticsService },
        { provide: ProcessoTimelineService, useValue: timelineService },
        { provide: LeiturasEventosQueryValidator, useValue: queryValidator },
        {
          provide: ProcessoLeituraValidator,
          useValue: processoLeituraValidator,
        },
      ],
    }).compile();

    service = module.get(LeiturasEventosService);
    mockDefaults();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('deve listar leituras orquestrando validator, repository e mapper', async () => {
    const query = { page: 1 };

    await expect(service.listLeituras(query)).resolves.toEqual({
      data: [],
      meta: buildMeta(),
    });
    expect(queryValidator.validateListLeiturasQuery).toHaveBeenCalledWith(
      query,
    );
    expect(leiturasRepository.listAndCount).toHaveBeenCalledWith(query);
    expect(leituraMapper.toListResponse).toHaveBeenCalledWith(
      [buildLeituraListRecord()],
      1,
      1,
      20,
    );
  });

  it('deve propagar erro de query invalida em listLeituras', async () => {
    queryValidator.validateListLeiturasQuery.mockImplementation(() => {
      throw new BadRequestException('query invalida');
    });

    await expect(service.listLeituras({ page: 1 })).rejects.toThrow(
      BadRequestException,
    );
    expect(leiturasRepository.listAndCount).not.toHaveBeenCalled();
  });

  it('deve buscar detalhe de leitura', async () => {
    await expect(service.findLeituraById(1)).resolves.toEqual(
      buildLeituraDetailsResponse(),
    );
    expect(leiturasRepository.findDetailsById).toHaveBeenCalledWith(1);
    expect(processoLeituraValidator.validateLeituraExists).toHaveBeenCalledWith(
      expect.objectContaining({ id_leitura_sensor: 1 }),
    );
    expect(leituraMapper.toDetails).toHaveBeenCalledWith(
      expect.objectContaining({ id_leitura_sensor: 1 }),
    );
  });

  it('deve propagar NotFound em leitura inexistente', async () => {
    leiturasRepository.findDetailsById.mockResolvedValue(null);
    processoLeituraValidator.validateLeituraExists.mockImplementation(() => {
      throw new NotFoundException('leitura nao encontrada');
    });

    await expect(service.findLeituraById(99)).rejects.toThrow(
      NotFoundException,
    );
    expect(leituraMapper.toDetails).not.toHaveBeenCalled();
  });

  it('deve listar leituras por processo', async () => {
    const query = { limit: 5 };

    await service.listLeiturasByProcess(9, query);

    expect(queryValidator.validateListLeiturasQuery).toHaveBeenCalledWith(
      query,
    );
    expect(leiturasRepository.listAndCount).toHaveBeenCalledWith({
      ...query,
      id_processo: 9,
    });
  });

  it('deve listar leituras por vinculo processo/tanque/sensor', async () => {
    const query = { page: 2 };

    await service.listLeiturasByProcessTanqueSensor(7, query);

    expect(leiturasRepository.listAndCount).toHaveBeenCalledWith({
      ...query,
      id_processo_tanque_sensor: 7,
    });
  });

  it('deve montar grafico por processo', async () => {
    const query = { limit: 10, intervalo: 'RAW' as const };

    await expect(service.getGraficoVacuoByProcess(9, query)).resolves.toEqual(
      buildChartResponse(9, null),
    );
    expect(queryValidator.validateGraficoVacuoQuery).toHaveBeenCalledWith(
      query,
    );
    expect(leiturasRepository.findChartDataByProcess).toHaveBeenCalledWith(
      9,
      query,
    );
    expect(graficoVacuoMapper.toChartResponse).toHaveBeenCalledWith({
      id_processo: 9,
      id_processo_tanque_sensor: null,
      vacuo_alvo: null,
      leituras: [buildLeituraChartRecord()],
      intervalo: 'RAW',
      limit: 10,
    });
  });

  it('deve montar grafico por vinculo processo/tanque/sensor', async () => {
    const query = { limit: 10 };
    graficoVacuoMapper.toChartResponse.mockReturnValueOnce(
      buildChartResponse(0, 7),
    );

    await expect(
      service.getGraficoVacuoByProcessTanqueSensor(7, query),
    ).resolves.toEqual(buildChartResponse(0, 7));
    expect(
      leiturasRepository.findChartDataByProcessTanqueSensor,
    ).toHaveBeenCalledWith(7, query);
    expect(graficoVacuoMapper.toChartResponse).toHaveBeenCalledWith({
      id_processo: 0,
      id_processo_tanque_sensor: 7,
      vacuo_alvo: null,
      leituras: [buildLeituraChartRecord()],
      intervalo: null,
      limit: 10,
    });
  });

  it('deve montar resumo operacional combinando analytics e eventos', async () => {
    const resumo = await service.getResumoOperacionalByProcess(9);

    expect(leiturasRepository.getStatsByProcess).toHaveBeenCalledWith(9);
    expect(eventosRepository.getEventStatsByProcess).toHaveBeenCalledWith(9);
    expect(analyticsService.calculateAnalytics).toHaveBeenCalledWith([
      buildLeituraStatsRecord(),
    ]);
    expect(resumo).toMatchObject({
      id_processo: 9,
      total_leituras: 1,
      total_eventos: 3,
      eventos_criticos: 1,
      eventos_medios: 1,
      eventos_info: 1,
    });
  });

  it('deve montar dashboard de leituras', async () => {
    const query = { limit: 5 };

    const dashboard = await service.getLeiturasDashboard(query);

    expect(queryValidator.validateListLeiturasQuery).toHaveBeenCalledWith(
      query,
    );
    expect(leiturasRepository.list).toHaveBeenCalledWith(query);
    expect(analyticsService.calculateAnalytics).toHaveBeenCalledWith([
      buildLeituraListRecord(),
    ]);
    expect(dashboard.total_leituras).toBe(1);
    expect(dashboard.sensores_com_leitura).toBe(1);
    expect(dashboard.processos_com_leitura).toBe(1);
  });

  it('deve listar eventos', async () => {
    const query = { page: 1 };

    await expect(service.listEventos(query)).resolves.toEqual({
      data: [],
      meta: buildMeta(),
    });
    expect(queryValidator.validateListEventosQuery).toHaveBeenCalledWith(query);
    expect(eventosRepository.listAndCount).toHaveBeenCalledWith(query);
    expect(eventoMapper.toListResponse).toHaveBeenCalledWith(
      [buildEventoListRecord()],
      1,
      1,
      20,
    );
  });

  it('deve buscar detalhe de evento', async () => {
    await expect(service.findEventoById(1)).resolves.toEqual(
      buildEventoDetailsResponse(),
    );
    expect(eventosRepository.findDetailsById).toHaveBeenCalledWith(1);
    expect(processoLeituraValidator.validateEventoExists).toHaveBeenCalledWith(
      expect.objectContaining({ id_evento_processo: 1 }),
    );
    expect(eventoMapper.toDetails).toHaveBeenCalledWith(
      expect.objectContaining({ id_evento_processo: 1 }),
    );
  });

  it('deve propagar NotFound em evento inexistente', async () => {
    eventosRepository.findDetailsById.mockResolvedValue(null);
    processoLeituraValidator.validateEventoExists.mockImplementation(() => {
      throw new NotFoundException('evento nao encontrado');
    });

    await expect(service.findEventoById(99)).rejects.toThrow(NotFoundException);
    expect(eventoMapper.toDetails).not.toHaveBeenCalled();
  });

  it('deve listar eventos por processo', async () => {
    const query = { limit: 5 };

    await service.listEventosByProcess(9, query);

    expect(queryValidator.validateListEventosQuery).toHaveBeenCalledWith(query);
    expect(eventosRepository.listAndCount).toHaveBeenCalledWith({
      ...query,
      id_processo: 9,
    });
  });

  it('deve montar timeline buscando leituras e eventos', async () => {
    const query = { limit: 5 };

    await expect(service.getProcessTimeline(9, query)).resolves.toEqual({
      id_processo: 9,
      items: [],
      total_items: 0,
      generated_at: expectDate(),
    });
    expect(queryValidator.validateTimelineQuery).toHaveBeenCalledWith(query);
    expect(leiturasRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({ id_processo: 9, limit: 5 }),
    );
    expect(eventosRepository.findTimelineEventsByProcess).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ id_processo: 9, limit: 5 }),
    );
    expect(timelineService.buildProcessTimeline).toHaveBeenCalledWith({
      id_processo: 9,
      leituras: [buildLeituraListRecord()],
      eventos: [buildEventoTimelineRecord()],
      incluir_leituras: undefined,
      incluir_eventos: undefined,
      limit: 5,
    });
  });

  it('deve ignorar leituras na timeline quando solicitado', async () => {
    await service.getProcessTimeline(9, {
      incluir_leituras: false,
      limit: 5,
    });

    expect(leiturasRepository.list).not.toHaveBeenCalled();
    expect(timelineService.buildProcessTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ leituras: [] }),
    );
  });

  it('deve ignorar eventos na timeline quando solicitado', async () => {
    await service.getProcessTimeline(9, {
      incluir_eventos: false,
      limit: 5,
    });

    expect(
      eventosRepository.findTimelineEventsByProcess,
    ).not.toHaveBeenCalled();
    expect(timelineService.buildProcessTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ eventos: [] }),
    );
  });

  function mockDefaults(): void {
    const leituraListRecord = buildLeituraListRecord();
    const leituraDetailsRecord = buildLeituraDetailsRecord();
    const leituraChartRecord = buildLeituraChartRecord();
    const leituraStatsRecord = buildLeituraStatsRecord();
    const eventoListRecord = buildEventoListRecord();
    const eventoDetailsRecord = buildEventoDetailsRecord();
    const eventoTimelineRecord = buildEventoTimelineRecord();

    leiturasRepository.listAndCount.mockResolvedValue({
      data: [leituraListRecord],
      total: 1,
      page: 1,
      limit: 20,
    });
    leiturasRepository.findDetailsById.mockResolvedValue(leituraDetailsRecord);
    leiturasRepository.findChartDataByProcess.mockResolvedValue([
      leituraChartRecord,
    ]);
    leiturasRepository.findChartDataByProcessTanqueSensor.mockResolvedValue([
      leituraChartRecord,
    ]);
    leiturasRepository.getStatsByProcess.mockResolvedValue([
      leituraStatsRecord,
    ]);
    leiturasRepository.list.mockResolvedValue([leituraListRecord]);
    eventosRepository.listAndCount.mockResolvedValue({
      data: [eventoListRecord],
      total: 1,
      page: 1,
      limit: 20,
    });
    eventosRepository.findDetailsById.mockResolvedValue(eventoDetailsRecord);
    eventosRepository.getEventStatsByProcess.mockResolvedValue({
      total_eventos: 3,
      eventos_criticos: 1,
      eventos_medios: 1,
      eventos_info: 1,
      primeiro_evento_em: new Date('2026-01-01T09:00:00Z'),
      ultimo_evento_em: new Date('2026-01-01T11:00:00Z'),
    });
    eventosRepository.findTimelineEventsByProcess.mockResolvedValue([
      eventoTimelineRecord,
    ]);
    leituraMapper.toListResponse.mockReturnValue({
      data: [],
      meta: buildMeta(),
    });
    leituraMapper.toDetails.mockReturnValue(buildLeituraDetailsResponse());
    eventoMapper.toListResponse.mockReturnValue({
      data: [],
      meta: buildMeta(),
    });
    eventoMapper.toDetails.mockReturnValue(buildEventoDetailsResponse());
    graficoVacuoMapper.toChartResponse.mockReturnValue(
      buildChartResponse(9, null),
    );
    analyticsService.calculateAnalytics.mockReturnValue({
      stats: {
        total_leituras: 1,
        total_leituras_validas: 1,
        total_leituras_invalidas: 0,
        vacuo_minimo: 10,
        vacuo_maximo: 10,
        vacuo_medio: 10,
        primeira_leitura_em: new Date('2026-01-01T10:00:00Z'),
        ultima_leitura_em: new Date('2026-01-01T10:00:00Z'),
        primeiro_valor_vacuo: 10,
        ultimo_valor_vacuo: 10,
        variacao_vacuo: 0,
      },
      periodo: {
        inicio: new Date('2026-01-01T10:00:00Z'),
        fim: new Date('2026-01-01T10:00:00Z'),
        duracao_ms: 0,
        duracao_segundos: 0,
        duracao_minutos: 0,
      },
      generated_at: new Date('2026-01-01T12:00:00Z'),
    });
    timelineService.buildProcessTimeline.mockReturnValue({
      id_processo: 9,
      items: [],
      total_items: 0,
      generated_at: expectDate(),
    });
  }
});

function buildLeiturasRepositoryMock(): LeiturasRepositoryMock {
  return {
    list: jest.fn(),
    count: jest.fn(),
    listAndCount: jest.fn(),
    findById: jest.fn(),
    findDetailsById: jest.fn(),
    findByProcess: jest.fn(),
    findByProcessTanqueSensor: jest.fn(),
    findChartDataByProcess: jest.fn(),
    findChartDataByProcessTanqueSensor: jest.fn(),
    getStatsByProcess: jest.fn(),
  };
}

function buildEventosRepositoryMock(): EventosRepositoryMock {
  return {
    list: jest.fn(),
    count: jest.fn(),
    listAndCount: jest.fn(),
    findById: jest.fn(),
    findDetailsById: jest.fn(),
    findByProcess: jest.fn(),
    findByProcessTanqueSensor: jest.fn(),
    getEventStatsByProcess: jest.fn(),
    findTimelineEventsByProcess: jest.fn(),
  };
}

function buildLeituraMapperMock(): LeituraMapperMock {
  return {
    decimalToNumber: jest.fn(),
    toResponse: jest.fn(),
    toDetails: jest.fn(),
    toListResponse: jest.fn(),
  };
}

function buildEventoMapperMock(): EventoMapperMock {
  return {
    toResponse: jest.fn(),
    toDetails: jest.fn(),
    toListResponse: jest.fn(),
  };
}

function buildGraficoVacuoMapperMock(): GraficoVacuoMapperMock {
  return {
    toChartPoint: jest.fn(),
    toChartResponse: jest.fn(),
    limitChartPoints: jest.fn(),
  };
}

function buildAnalyticsMock(): AnalyticsServiceMock {
  return {
    calculateAnalytics: jest.fn(),
  };
}

function buildTimelineMock(): TimelineServiceMock {
  return {
    buildProcessTimeline: jest.fn(),
  };
}

function buildQueryValidatorMock(): QueryValidatorMock {
  return {
    validateListLeiturasQuery: jest.fn(),
    validateListEventosQuery: jest.fn(),
    validateGraficoVacuoQuery: jest.fn(),
    validateTimelineQuery: jest.fn(),
  };
}

function buildProcessoLeituraValidatorMock(): ProcessoLeituraValidatorMock {
  return {
    validateLeituraExists: jest.fn(),
    validateEventoExists: jest.fn(),
  };
}

function buildLeituraListRecord(): LeituraListRecord {
  return {
    id_leitura_sensor: 1,
    id_processo_tanque_sensor: 2,
    valor_vacuo: 10,
    leitura_em: new Date('2026-01-01T10:00:00Z'),
    recebido_em: new Date('2026-01-01T10:00:02Z'),
    unidade_medida: 'kPa',
    processostanquessensores: {
      id_processo_tanque_sensor: 2,
      id_sensor: 3,
      sensores: {
        id_sensor: 3,
        nome: 'Sensor 3',
        modelo: 'VX',
        unidade_medida: 'kPa',
        status_sensor: statussensor.ATIVO,
      },
      processostanques: {
        id_processo_tanque: 4,
        id_tanque: 5,
        status_tanque_processo: statustanqueprocesso.EM_EXECUCAO,
        processos: {
          id_processo: 9,
          nome_processo: 'Processo 9',
          status_processo: statusprocesso.EM_EXECUCAO,
        },
        tanques: {
          id_tanque: 5,
          nome: 'Tanque 5',
        },
      },
    },
  } as unknown as LeituraListRecord;
}

function buildLeituraDetailsRecord(): LeituraDetailsRecord {
  return {
    ...buildLeituraListRecord(),
    processostanquessensores: {
      ...buildLeituraListRecord().processostanquessensores,
      processostanques: {
        ...buildLeituraListRecord().processostanquessensores.processostanques,
        vacuo_alvo: 12,
        vacuo_inicial: 1,
        vacuo_final: null,
        vacuo_medio: 8,
        processos: {
          id_processo: 9,
          nome_processo: 'Processo 9',
          status_processo: statusprocesso.EM_EXECUCAO,
          iniciado_em: new Date('2026-01-01T09:00:00Z'),
          finalizado_em: null,
        },
      },
    },
  } as unknown as LeituraDetailsRecord;
}

function buildLeituraChartRecord(): LeituraChartRecord {
  return {
    id_leitura_sensor: 1,
    id_processo_tanque_sensor: 2,
    valor_vacuo: 10,
    leitura_em: new Date('2026-01-01T10:00:00Z'),
  } as unknown as LeituraChartRecord;
}

function buildLeituraStatsRecord(): LeituraStatsRecord {
  return {
    id_leitura_sensor: 1,
    id_processo_tanque_sensor: 2,
    valor_vacuo: 10,
    leitura_em: new Date('2026-01-01T10:00:00Z'),
    recebido_em: new Date('2026-01-01T10:00:02Z'),
  } as unknown as LeituraStatsRecord;
}

function buildEventoListRecord(): EventoListRecord {
  return {
    id_evento_processo: 1,
    id_processo: 9,
    id_processo_tanque_sensor: 2,
    tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
    origem_evento: origemevento.SISTEMA,
    severidade_evento: severidadeevento.INFO,
    ocorrido_em: new Date('2026-01-01T10:00:00Z'),
    processos: {
      id_processo: 9,
      nome_processo: 'Processo 9',
      status_processo: statusprocesso.EM_EXECUCAO,
    },
    processostanquessensores: {
      id_processo_tanque_sensor: 2,
      id_processo_tanque: 4,
      id_sensor: 3,
      sensores: {
        id_sensor: 3,
        nome: 'Sensor 3',
        modelo: 'VX',
        unidade_medida: 'kPa',
        status_sensor: statussensor.ATIVO,
      },
      processostanques: {
        id_processo_tanque: 4,
        id_tanque: 5,
        status_tanque_processo: statustanqueprocesso.EM_EXECUCAO,
        tanques: {
          id_tanque: 5,
          nome: 'Tanque 5',
        },
      },
    },
  };
}

function buildEventoDetailsRecord(): EventoDetailsRecord {
  return {
    ...buildEventoListRecord(),
    processos: {
      id_processo: 9,
      nome_processo: 'Processo 9',
      status_processo: statusprocesso.EM_EXECUCAO,
      iniciado_em: new Date('2026-01-01T09:00:00Z'),
      finalizado_em: null,
    },
    processostanquessensores: {
      id_processo_tanque_sensor: 2,
      id_processo_tanque: 4,
      id_sensor: 3,
      sensores: {
        id_sensor: 3,
        nome: 'Sensor 3',
        modelo: 'VX',
        unidade_medida: 'kPa',
        status_sensor: statussensor.ATIVO,
      },
      processostanques: {
        id_processo_tanque: 4,
        id_tanque: 5,
        status_tanque_processo: statustanqueprocesso.EM_EXECUCAO,
        tanques: {
          id_tanque: 5,
          nome: 'Tanque 5',
        },
      },
    },
  };
}

function buildEventoTimelineRecord(): EventoTimelineRecord {
  return buildEventoListRecord();
}

function buildMeta() {
  return {
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
    has_next_page: false,
    has_previous_page: false,
  };
}

function buildLeituraDetailsResponse() {
  return {
    id_leitura_sensor: 1,
    id_processo_tanque_sensor: 2,
    valor_vacuo: 10,
    leitura_em: new Date('2026-01-01T10:00:00Z'),
    recebido_em: new Date('2026-01-01T10:00:02Z'),
    processo: null,
    processo_tanque: null,
    sensor: null,
  };
}

function buildEventoDetailsResponse() {
  return {
    id_evento_processo: 1,
    id_processo: 9,
    id_processo_tanque_sensor: 2,
    tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
    origem_evento: origemevento.SISTEMA,
    severidade_evento: severidadeevento.INFO,
    ocorrido_em: new Date('2026-01-01T10:00:00Z'),
    processo: null,
    processo_tanque_sensor: null,
    sensor: null,
    tanque: null,
  };
}

function buildChartResponse(
  id_processo: number,
  id_processo_tanque_sensor: number | null,
) {
  return {
    id_processo,
    id_processo_tanque_sensor,
    vacuo_alvo: null,
    pontos: [],
    total_pontos: 0,
    intervalo: 'RAW',
    generated_at: new Date('2026-01-01T12:00:00Z'),
  };
}

function expectDate(): Date {
  return new Date('2026-01-01T12:00:00Z');
}
