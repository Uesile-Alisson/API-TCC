import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { nivelacesso, statusprocesso } from '@prisma/client';
import type { Request } from 'express';
import type { Server } from 'http';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { ProcessosController } from '../src/processos/processos.controller';
import { ProcessosService } from '../src/processos/processos.service';

type ProcessosServiceMock = {
  create: jest.Mock;
  list: jest.Mock;
  findActive: jest.Mock;
  findById: jest.Mock;
  getDashboard: jest.Mock;
  updateConfig: jest.Mock;
  start: jest.Mock;
  pause: jest.Mock;
  resume: jest.Mock;
  finish: jest.Mock;
  interrupt: jest.Mock;
  emergencyStop: jest.Mock;
};

type AuthenticatedTestUser = {
  id_usuario: number;
  login: string;
  nome: string;
  id_nivel_acesso: number;
  nivel_acesso: {
    nome: nivelacesso;
  };
  primeiro_acesso: boolean;
};
type AuthenticatedTestRequest = Request & {
  user: AuthenticatedTestUser;
};

describe('ProcessosController (e2e)', () => {
  let app: INestApplication;
  let service: ProcessosServiceMock;

  const authenticatedUser = {
    id_usuario: 7,
    login: 'tecnico',
    nome: 'Tecnico Teste',
    id_nivel_acesso: 2,
    nivel_acesso: {
      nome: nivelacesso.TECNICO,
    },
    primeiro_acesso: false,
  };

  const authGuard: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      const requestContext = context
        .switchToHttp()
        .getRequest<AuthenticatedTestRequest>();
      requestContext.user = authenticatedUser;

      return true;
    },
  };

  const rolesGuard: CanActivate = {
    canActivate(): boolean {
      return true;
    },
  };

  beforeEach(async () => {
    service = {
      create: jest
        .fn()
        .mockResolvedValue(actionResult(statusprocesso.CONFIGURADO)),
      list: jest.fn().mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
      }),
      findActive: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue({ id_processo: 10 }),
      getDashboard: jest.fn().mockResolvedValue({ id_processo: 10 }),
      updateConfig: jest
        .fn()
        .mockResolvedValue(actionResult(statusprocesso.CONFIGURADO)),
      start: jest
        .fn()
        .mockResolvedValue(actionResult(statusprocesso.EM_EXECUCAO)),
      pause: jest.fn().mockResolvedValue(actionResult(statusprocesso.PAUSADO)),
      resume: jest
        .fn()
        .mockResolvedValue(actionResult(statusprocesso.EM_EXECUCAO)),
      finish: jest
        .fn()
        .mockResolvedValue(actionResult(statusprocesso.CONCLUIDO)),
      interrupt: jest
        .fn()
        .mockResolvedValue(actionResult(statusprocesso.INTERROMPIDO)),
      emergencyStop: jest
        .fn()
        .mockResolvedValue(actionResult(statusprocesso.INTERROMPIDO)),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProcessosController],
      providers: [{ provide: ProcessosService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(authGuard)
      .overrideGuard(RolesGuard)
      .useValue(rolesGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('responde nas rotas HTTP obrigatorias de processos', async () => {
    const server = getServer();

    await request(server).get('/api/processos').expect(200);
    await request(server).get('/api/processos/ativo').expect(200);
    await request(server).post('/api/processos').send(createDto()).expect(201);
    await request(server).get('/api/processos/10').expect(200);
    await request(server).get('/api/processos/10/dashboard').expect(200);
    await request(server)
      .patch('/api/processos/10/config')
      .send({ tempo_maximo: 120 })
      .expect(200);
    await request(server).post('/api/processos/10/iniciar').expect(201);
    await request(server).post('/api/processos/10/pausar').expect(201);
    await request(server).post('/api/processos/10/retomar').expect(201);
    await request(server)
      .post('/api/processos/10/finalizar')
      .send({ observacao: 'Finalizado sem falhas.' })
      .expect(201);
    await request(server)
      .post('/api/processos/10/interromper')
      .send({ motivo: 'Interrupcao operacional.' })
      .expect(201);
    await request(server)
      .post('/api/processos/10/parada-emergencia')
      .send({ motivo: 'Falha critica simulada.' })
      .expect(201);

    expect(service.create).toHaveBeenCalled();
    expect(service.getDashboard).toHaveBeenCalledWith(10);
    expect(service.emergencyStop).toHaveBeenCalled();
  });

  it('rejeita payload invalido antes de chamar service.create', async () => {
    await request(getServer())
      .post('/api/processos')
      .send({ tempo_maximo: 60 })
      .expect(400);

    expect(service.create).not.toHaveBeenCalled();
  });

  it('rejeita campos extras no DTO de criacao', async () => {
    await request(getServer())
      .post('/api/processos')
      .send({ ...createDto(), campo_extra: true })
      .expect(400);

    expect(service.create).not.toHaveBeenCalled();
  });

  function createDto() {
    return {
      tempo_maximo: 60,
      vacuo_alvo: -80,
      tanques: [
        {
          id_tanque: 1,
          sensores: [{ id_sensor: 1 }],
        },
      ],
    };
  }

  function getServer(): Server {
    return app.getHttpServer() as Server;
  }

  function actionResult(status_processo: statusprocesso) {
    return {
      success: true,
      message: 'ok',
      id_processo: 10,
      status_processo,
    };
  }
});
