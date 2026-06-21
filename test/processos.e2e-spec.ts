import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { statusprocesso } from '@prisma/client';
import { ProcessosController } from '../src/processos/processos.controller';
import { ProcessosService } from '../src/processos/processos.service';
import type { Server } from 'node:http';

type ProcessCommandResponse = {
  success: boolean;
  message: string;
  id_processo: number;
  status_processo: statusprocesso;
};

type ProcessListResponse = {
  data: unknown[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ProcessFindOneResponse = {
  id_processo: number;
} | null;

type MockProcessosService = {
  create: jest.MockedFunction<() => Promise<ProcessCommandResponse>>;
  findAll: jest.MockedFunction<() => Promise<ProcessListResponse>>;
  findOne: jest.MockedFunction<() => Promise<ProcessFindOneResponse>>;
  start: jest.MockedFunction<() => Promise<ProcessCommandResponse>>;
  pause: jest.MockedFunction<() => Promise<ProcessCommandResponse>>;
  resume: jest.MockedFunction<() => Promise<ProcessCommandResponse>>;
  finish: jest.MockedFunction<() => Promise<ProcessCommandResponse>>;
  cancel: jest.MockedFunction<() => Promise<ProcessCommandResponse>>;
  emergencyStop: jest.MockedFunction<() => Promise<ProcessCommandResponse>>;
};

describe('ProcessosController (e2e)', () => {
  let app: INestApplication;
  let processosService: MockProcessosService;
  let httpServer: Server;

  const processoConfiguradoResponse: ProcessCommandResponse = {
    success: true,
    message: 'Processo criado com sucesso.',
    id_processo: 1,
    status_processo: statusprocesso.CONFIGURADO,
  };

  const processoIniciadoResponse: ProcessCommandResponse = {
    success: true,
    message: 'Processo iniciado com sucesso.',
    id_processo: 1,
    status_processo: statusprocesso.EM_EXECUCAO,
  };

  const processoPausadoResponse: ProcessCommandResponse = {
    success: true,
    message: 'Processo pausado com sucesso.',
    id_processo: 1,
    status_processo: statusprocesso.PAUSADO,
  };

  const processoRetomadoResponse: ProcessCommandResponse = {
    success: true,
    message: 'Processo retomado com sucesso.',
    id_processo: 1,
    status_processo: statusprocesso.EM_EXECUCAO,
  };

  const processoFinalizadoResponse: ProcessCommandResponse = {
    success: true,
    message: 'Processo finalizado com sucesso.',
    id_processo: 1,
    status_processo: statusprocesso.CONCLUIDO,
  };

  const processoCanceladoResponse: ProcessCommandResponse = {
    success: true,
    message: 'Processo cancelado com sucesso.',
    id_processo: 1,
    status_processo: statusprocesso.INTERROMPIDO,
  };

  const paradaEmergenciaResponse: ProcessCommandResponse = {
    success: true,
    message: 'Parada de emergência executada com sucesso.',
    id_processo: 1,
    status_processo: statusprocesso.INTERROMPIDO,
  };

  beforeEach(async () => {
    processosService = {
      create: jest.fn<() => Promise<ProcessCommandResponse>>(),
      findAll: jest.fn<() => Promise<ProcessListResponse>>(),
      findOne: jest.fn<() => Promise<ProcessFindOneResponse>>(),
      start: jest.fn<() => Promise<ProcessCommandResponse>>(),
      pause: jest.fn<() => Promise<ProcessCommandResponse>>(),
      resume: jest.fn<() => Promise<ProcessCommandResponse>>(),
      finish: jest.fn<() => Promise<ProcessCommandResponse>>(),
      cancel: jest.fn<() => Promise<ProcessCommandResponse>>(),
      emergencyStop: jest.fn<() => Promise<ProcessCommandResponse>>(),
    };

    processosService.create.mockResolvedValue(processoConfiguradoResponse);

    processosService.findAll.mockResolvedValue({
      data: [],
      meta: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      },
    });

    processosService.findOne.mockResolvedValue({
      id_processo: 1,
    });

    processosService.start.mockResolvedValue(processoIniciadoResponse);
    processosService.pause.mockResolvedValue(processoPausadoResponse);
    processosService.resume.mockResolvedValue(processoRetomadoResponse);
    processosService.finish.mockResolvedValue(processoFinalizadoResponse);
    processosService.cancel.mockResolvedValue(processoCanceladoResponse);
    processosService.emergencyStop.mockResolvedValue(paradaEmergenciaResponse);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProcessosController],
      providers: [
        {
          provide: ProcessosService,
          useValue: processosService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    httpServer = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    jest.clearAllMocks();

    if (app) {
      await app.close();
    }
  });

  it('/processos (POST) deve criar um processo', async () => {
    const body = {
      nome_processo: 'Processo de teste',
      vacuo_alvo: -80,
      tempo_maximo: 300,
      tanques: [
        {
          id_tanque: 1,
          id_sensor: 1,
          vacuo_alvo: -80,
        },
      ],
    };

    const response = await request(httpServer)
      .post('/processos')
      .send(body)
      .expect(201);

    expect(response.body).toEqual(processoConfiguradoResponse);
    expect(processosService.create).toHaveBeenCalledTimes(1);
  });

  it('/processos (GET) deve listar processos paginados', async () => {
    const response = await request(httpServer)
      .get('/processos?page=1&limit=10')
      .expect(200);

    expect(response.body).toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      },
    });

    expect(processosService.findAll).toHaveBeenCalledTimes(1);
  });

  it('/processos/:id (GET) deve buscar processo por ID', async () => {
    const response = await request(httpServer).get('/processos/1').expect(200);

    expect(response.body).toEqual({
      id_processo: 1,
    });

    expect(processosService.findOne).toHaveBeenCalledTimes(1);
  });

  it('/processos/:id/iniciar (POST) deve iniciar processo', async () => {
    const response = await request(httpServer)
      .post('/processos/1/iniciar')
      .expect(201);

    expect(response.body).toEqual(processoIniciadoResponse);
    expect(processosService.start).toHaveBeenCalledTimes(1);
  });

  it('/processos/:id/pausar (POST) deve pausar processo', async () => {
    const response = await request(httpServer)
      .post('/processos/1/pausar')
      .expect(201);

    expect(response.body).toEqual(processoPausadoResponse);
    expect(processosService.pause).toHaveBeenCalledTimes(1);
  });

  it('/processos/:id/retomar (POST) deve retomar processo', async () => {
    const response = await request(httpServer)
      .post('/processos/1/retomar')
      .expect(201);

    expect(response.body).toEqual(processoRetomadoResponse);
    expect(processosService.resume).toHaveBeenCalledTimes(1);
  });

  it('/processos/:id/finalizar (POST) deve finalizar processo', async () => {
    const response = await request(httpServer)
      .post('/processos/1/finalizar')
      .expect(201);

    expect(response.body).toEqual(processoFinalizadoResponse);
    expect(processosService.finish).toHaveBeenCalledTimes(1);
  });

  it('/processos/:id/cancelar (POST) deve cancelar processo', async () => {
    const response = await request(httpServer)
      .post('/processos/1/cancelar')
      .expect(201);

    expect(response.body).toEqual(processoCanceladoResponse);
    expect(processosService.cancel).toHaveBeenCalledTimes(1);
  });

  it('/processos/:id/parada-emergencia (POST) deve executar parada de emergência', async () => {
    const response = await request(httpServer)
      .post('/processos/1/parada-emergencia')
      .expect(201);

    expect(response.body).toEqual(paradaEmergenciaResponse);
    expect(processosService.emergencyStop).toHaveBeenCalledTimes(1);
  });
});
