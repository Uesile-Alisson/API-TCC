import { Test, TestingModule } from '@nestjs/testing';
import { LeiturasEventosController } from '../leituras-eventos.controller';
import { LeiturasEventosService } from '../leituras-eventos.service';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('LeiturasEventosController', () => {
  let controller: LeiturasEventosController;
  let service: jest.Mocked<LeiturasEventosService>;

  let listLeiturasMock: jest.MockedFunction<
    LeiturasEventosService['listLeituras']
  >;
  let getLeiturasDashboardMock: jest.MockedFunction<
    LeiturasEventosService['getLeiturasDashboard']
  >;
  let findLeituraByIdMock: jest.MockedFunction<
    LeiturasEventosService['findLeituraById']
  >;
  let listEventosMock: jest.MockedFunction<
    LeiturasEventosService['listEventos']
  >;
  let findEventoByIdMock: jest.MockedFunction<
    LeiturasEventosService['findEventoById']
  >;
  let listLeiturasByProcessMock: jest.MockedFunction<
    LeiturasEventosService['listLeiturasByProcess']
  >;
  let listEventosByProcessMock: jest.MockedFunction<
    LeiturasEventosService['listEventosByProcess']
  >;
  let getProcessTimelineMock: jest.MockedFunction<
    LeiturasEventosService['getProcessTimeline']
  >;
  let getGraficoVacuoByProcessMock: jest.MockedFunction<
    LeiturasEventosService['getGraficoVacuoByProcess']
  >;
  let getResumoOperacionalByProcessMock: jest.MockedFunction<
    LeiturasEventosService['getResumoOperacionalByProcess']
  >;
  let listLeiturasByProcessTanqueSensorMock: jest.MockedFunction<
    LeiturasEventosService['listLeiturasByProcessTanqueSensor']
  >;
  let getGraficoVacuoByProcessTanqueSensorMock: jest.MockedFunction<
    LeiturasEventosService['getGraficoVacuoByProcessTanqueSensor']
  >;

  beforeEach(async () => {
    listLeiturasMock = jest.fn();
    getLeiturasDashboardMock = jest.fn();
    findLeituraByIdMock = jest.fn();
    listEventosMock = jest.fn();
    findEventoByIdMock = jest.fn();
    listLeiturasByProcessMock = jest.fn();
    listEventosByProcessMock = jest.fn();
    getProcessTimelineMock = jest.fn();
    getGraficoVacuoByProcessMock = jest.fn();
    getResumoOperacionalByProcessMock = jest.fn();
    listLeiturasByProcessTanqueSensorMock = jest.fn();
    getGraficoVacuoByProcessTanqueSensorMock = jest.fn();

    service = {
      listLeituras: listLeiturasMock,
      getLeiturasDashboard: getLeiturasDashboardMock,
      findLeituraById: findLeituraByIdMock,
      listEventos: listEventosMock,
      findEventoById: findEventoByIdMock,
      listLeiturasByProcess: listLeiturasByProcessMock,
      listEventosByProcess: listEventosByProcessMock,
      getProcessTimeline: getProcessTimelineMock,
      getGraficoVacuoByProcess: getGraficoVacuoByProcessMock,
      getResumoOperacionalByProcess: getResumoOperacionalByProcessMock,
      listLeiturasByProcessTanqueSensor: listLeiturasByProcessTanqueSensorMock,
      getGraficoVacuoByProcessTanqueSensor:
        getGraficoVacuoByProcessTanqueSensorMock,
    } as jest.Mocked<LeiturasEventosService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeiturasEventosController],
      providers: [
        {
          provide: LeiturasEventosService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get(LeiturasEventosController);
  });

  it('deve estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('deve delegar listLeituras', async () => {
    const query = { page: 1 };
    const result = { data: [], meta: buildMeta() };
    listLeiturasMock.mockResolvedValue(result);

    await expect(controller.listLeituras(query)).resolves.toBe(result);
    expect(listLeiturasMock).toHaveBeenCalledWith(query);
  });

  it('deve delegar getLeiturasDashboard', async () => {
    const query = { limit: 10 };
    const result = {
      total_leituras: 0,
      leituras_ultima_hora: 0,
      leituras_hoje: 0,
      sensores_com_leitura: 0,
      processos_com_leitura: 0,
      vacuo_minimo: null,
      vacuo_maximo: null,
      vacuo_medio: null,
      primeira_leitura_em: null,
      ultima_leitura_em: null,
      generated_at: new Date(),
    };
    getLeiturasDashboardMock.mockResolvedValue(result);

    await expect(controller.getLeiturasDashboard(query)).resolves.toBe(result);
    expect(getLeiturasDashboardMock).toHaveBeenCalledWith(query);
  });

  it('deve delegar findLeituraById', async () => {
    const result = buildLeituraDetails();
    findLeituraByIdMock.mockResolvedValue(result);

    await expect(controller.findLeituraById(1)).resolves.toBe(result);
    expect(findLeituraByIdMock).toHaveBeenCalledWith(1);
  });

  it('deve delegar listEventos', async () => {
    const query = { page: 1 };
    const result = { data: [], meta: buildMeta() };
    listEventosMock.mockResolvedValue(result);

    await expect(controller.listEventos(query)).resolves.toBe(result);
    expect(listEventosMock).toHaveBeenCalledWith(query);
  });

  it('deve delegar findEventoById', async () => {
    const result = buildEventoDetails();
    findEventoByIdMock.mockResolvedValue(result);

    await expect(controller.findEventoById(1)).resolves.toBe(result);
    expect(findEventoByIdMock).toHaveBeenCalledWith(1);
  });

  it('deve delegar listLeiturasByProcess', async () => {
    const query = { limit: 5 };
    const result = { data: [], meta: buildMeta() };
    listLeiturasByProcessMock.mockResolvedValue(result);

    await expect(controller.listLeiturasByProcess(9, query)).resolves.toBe(
      result,
    );
    expect(listLeiturasByProcessMock).toHaveBeenCalledWith(9, query);
  });

  it('deve delegar listEventosByProcess', async () => {
    const query = { limit: 5 };
    const result = { data: [], meta: buildMeta() };
    listEventosByProcessMock.mockResolvedValue(result);

    await expect(controller.listEventosByProcess(9, query)).resolves.toBe(
      result,
    );
    expect(listEventosByProcessMock).toHaveBeenCalledWith(9, query);
  });

  it('deve delegar getProcessTimeline', async () => {
    const query = { limit: 5 };
    const result = {
      id_processo: 9,
      items: [],
      total_items: 0,
      generated_at: new Date(),
    };
    getProcessTimelineMock.mockResolvedValue(result);

    await expect(controller.getProcessTimeline(9, query)).resolves.toBe(result);
    expect(getProcessTimelineMock).toHaveBeenCalledWith(9, query);
  });

  it('deve delegar getGraficoVacuoByProcess', async () => {
    const query = { limit: 5 };
    const result = {
      id_processo: 9,
      id_processo_tanque_sensor: null,
      vacuo_alvo: null,
      pontos: [],
      total_pontos: 0,
      intervalo: 'RAW',
      generated_at: new Date(),
    };
    getGraficoVacuoByProcessMock.mockResolvedValue(result);

    await expect(controller.getGraficoVacuoByProcess(9, query)).resolves.toBe(
      result,
    );
    expect(getGraficoVacuoByProcessMock).toHaveBeenCalledWith(9, query);
  });

  it('deve delegar getResumoOperacionalByProcess', async () => {
    const result = {
      id_processo: 9,
      total_leituras: 0,
      total_eventos: 0,
      primeira_leitura_em: null,
      ultima_leitura_em: null,
      primeiro_evento_em: null,
      ultimo_evento_em: null,
      vacuo_minimo: null,
      vacuo_maximo: null,
      vacuo_medio: null,
      eventos_criticos: 0,
      eventos_medios: 0,
      eventos_info: 0,
      generated_at: new Date(),
    };
    getResumoOperacionalByProcessMock.mockResolvedValue(result);

    await expect(controller.getResumoOperacionalByProcess(9)).resolves.toBe(
      result,
    );
    expect(getResumoOperacionalByProcessMock).toHaveBeenCalledWith(9);
  });

  it('deve delegar listLeiturasByProcessTanqueSensor', async () => {
    const query = { page: 1 };
    const result = { data: [], meta: buildMeta() };
    listLeiturasByProcessTanqueSensorMock.mockResolvedValue(result);

    await expect(
      controller.listLeiturasByProcessTanqueSensor(7, query),
    ).resolves.toBe(result);
    expect(listLeiturasByProcessTanqueSensorMock).toHaveBeenCalledWith(
      7,
      query,
    );
  });

  it('deve delegar getGraficoVacuoByProcessTanqueSensor', async () => {
    const query = { limit: 5 };
    const result = {
      id_processo: 0,
      id_processo_tanque_sensor: 7,
      vacuo_alvo: null,
      pontos: [],
      total_pontos: 0,
      intervalo: 'RAW',
      generated_at: new Date(),
    };
    getGraficoVacuoByProcessTanqueSensorMock.mockResolvedValue(result);

    await expect(
      controller.getGraficoVacuoByProcessTanqueSensor(7, query),
    ).resolves.toBe(result);
    expect(getGraficoVacuoByProcessTanqueSensorMock).toHaveBeenCalledWith(
      7,
      query,
    );
  });
});

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

function buildLeituraDetails() {
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

function buildEventoDetails() {
  return {
    id_evento_processo: 1,
    id_processo: 9,
    id_processo_tanque_sensor: null,
    tipo_evento: 'PROCESSO_INICIADO' as const,
    origem_evento: 'SISTEMA' as const,
    severidade_evento: 'INFO' as const,
    ocorrido_em: new Date('2026-01-01T10:00:00Z'),
    processo: null,
    processo_tanque_sensor: null,
    sensor: null,
    tanque: null,
  };
}
