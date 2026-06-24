import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  formatorelatorio,
  nivelacesso,
  severidadealarme,
  statusalarme,
  statusprocesso,
  tiporelatorio,
} from '@prisma/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import type { Server } from 'node:http';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import type {
  RelatorioGenerationResult,
  RelatorioListResponse,
  RelatorioResponse,
  ReportDownloadResult,
  ReportPreviewResult,
  SingleRelatorioGenerationResult,
} from '../src/relatorios/interfaces';
import { RelatoriosController } from '../src/relatorios/relatorios.controller';
import { RelatoriosService } from '../src/relatorios/relatorios.service';

type RelatoriosServiceMock = {
  listRelatorios: jest.MockedFunction<RelatoriosService['listRelatorios']>;
  getRelatorioById: jest.MockedFunction<RelatoriosService['getRelatorioById']>;
  generateProcessReports: jest.MockedFunction<
    RelatoriosService['generateProcessReports']
  >;
  generateAlarmReport: jest.MockedFunction<
    RelatoriosService['generateAlarmReport']
  >;
  previewRelatorio: jest.MockedFunction<RelatoriosService['previewRelatorio']>;
  downloadRelatorio: jest.MockedFunction<
    RelatoriosService['downloadRelatorio']
  >;
};

interface RelatoriosTestUser {
  id_usuario: number;
  sub: number;
  nome: string;
  nivel_acesso: nivelacesso;
}

interface RequestWithUser extends Request {
  user?: RelatoriosTestUser;
}

const operadorUser: RelatoriosTestUser = {
  id_usuario: 1,
  sub: 1,
  nome: 'Operador Teste',
  nivel_acesso: nivelacesso.OPERADOR,
};

const tecnicoUser: RelatoriosTestUser = {
  id_usuario: 2,
  sub: 2,
  nome: 'Técnico Teste',
  nivel_acesso: nivelacesso.TECNICO,
};

const adminUser: RelatoriosTestUser = {
  id_usuario: 3,
  sub: 3,
  nome: 'Administrador Teste',
  nivel_acesso: nivelacesso.ADMINISTRADOR,
};

const relatorioProcessoPdfResponse: RelatorioResponse = {
  id_relatorio: 100,
  id_usuario: 2,
  id_processo: 10,
  id_alarme: null,
  tipo_relatorio: tiporelatorio.PROCESSO,
  formato_relatorio: formatorelatorio.PDF,
  titulo: 'Relatório operacional do processo #10 - PDF',
  descricao: null,
  nome_arquivo: 'tsea-processo-10-relatorio-pdf.pdf',
  tamanho_bytes: 1234,
  content_type: 'application/pdf',
  gerado_em: new Date('2026-01-01T10:00:00.000Z'),
  gerado_por: {
    id_usuario: 2,
    nome: 'Técnico Teste',
  },
  processo: {
    id_processo: 10,
    nome_processo: 'Processo Teste',
    status_processo: statusprocesso.CONCLUIDO,
  },
  alarme: null,
  preview_disponivel: true,
  download_disponivel: true,
  possui_arquivo: true,
};

const relatorioProcessoXlsxResponse: RelatorioResponse = {
  ...relatorioProcessoPdfResponse,
  id_relatorio: 101,
  formato_relatorio: formatorelatorio.XLSX,
  titulo: 'Relatório operacional do processo #10 - XLSX',
  nome_arquivo: 'tsea-processo-10-relatorio-xlsx.xlsx',
  content_type:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  preview_disponivel: false,
};

const relatorioAlarmePdfResponse: RelatorioResponse = {
  id_relatorio: 200,
  id_usuario: 2,
  id_processo: 10,
  id_alarme: 20,
  tipo_relatorio: tiporelatorio.ALARME,
  formato_relatorio: formatorelatorio.PDF,
  titulo: 'Relatório técnico do alarme #20',
  descricao: null,
  nome_arquivo: 'tsea-alarme-20-relatorio-pdf.pdf',
  tamanho_bytes: 900,
  content_type: 'application/pdf',
  gerado_em: new Date('2026-01-01T10:00:00.000Z'),
  gerado_por: {
    id_usuario: 2,
    nome: 'Técnico Teste',
  },
  processo: {
    id_processo: 10,
    nome_processo: 'Processo Teste',
    status_processo: statusprocesso.CONCLUIDO,
  },
  alarme: {
    id_alarme: 20,
    titulo: 'Alarme crítico',
    severidade: severidadealarme.CRITICO,
    status_alarme: statusalarme.RESOLVIDO,
    ocorrido_em: new Date('2026-01-01T09:50:00.000Z'),
  },
  preview_disponivel: true,
  download_disponivel: true,
  possui_arquivo: true,
};

function expectNoInternalFields(value: unknown): void {
  const serialized = JSON.stringify(value);

  expect(serialized).not.toContain('gridfs_file_id');
  expect(serialized).not.toContain('bucket_name');
  expect(serialized).not.toContain('storage_provider');
  expect(serialized).not.toContain('hash_arquivo');
  expect(serialized).not.toContain('senha_hash');
  expect(serialized).not.toContain('payload');
}

function getResponseBody<TBody>(response: SupertestResponse): TBody {
  return response.body as TBody;
}

describe('RelatoriosController (e2e controlado)', () => {
  let app: INestApplication;
  let httpServer: Server;
  let relatoriosService: RelatoriosServiceMock;
  let currentUser: RelatoriosTestUser;

  beforeEach(async () => {
    currentUser = tecnicoUser;
    relatoriosService = {
      listRelatorios: jest.fn<RelatoriosService['listRelatorios']>(),
      getRelatorioById: jest.fn<RelatoriosService['getRelatorioById']>(),
      generateProcessReports:
        jest.fn<RelatoriosService['generateProcessReports']>(),
      generateAlarmReport: jest.fn<RelatoriosService['generateAlarmReport']>(),
      previewRelatorio: jest.fn<RelatoriosService['previewRelatorio']>(),
      downloadRelatorio: jest.fn<RelatoriosService['downloadRelatorio']>(),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RelatoriosController],
      providers: [
        {
          provide: RelatoriosService,
          useValue: relatoriosService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(
      (req: RequestWithUser, _res: Response, next: NextFunction): void => {
        req.user = currentUser;
        next();
      },
    );
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    jest.clearAllMocks();

    if (app) {
      await app.close();
    }
  });

  it('GET /relatorios lista relatórios sem expor storage interno', async () => {
    const responseBody: RelatorioListResponse = {
      data: [relatorioProcessoPdfResponse],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        total_pages: 1,
        has_next_page: false,
        has_previous_page: false,
      },
    };

    currentUser = operadorUser;
    relatoriosService.listRelatorios.mockResolvedValue(responseBody);

    const response = await request(httpServer)
      .get('/relatorios?page=1&limit=20')
      .expect(200);

    const body = getResponseBody<RelatorioListResponse>(response);

    expect(body.data).toHaveLength(1);
    expect(body.meta).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
    });

    expect(relatoriosService.listRelatorios).toHaveBeenCalledWith(
      expect.objectContaining({
        page: '1',
        limit: '20',
      }),
      expect.objectContaining({
        id_usuario: 1,
        nivel_acesso: nivelacesso.OPERADOR,
      }),
    );
    expectNoInternalFields(body);
  });

  it('GET /relatorios/:id_relatorio retorna detalhe público', async () => {
    relatoriosService.getRelatorioById.mockResolvedValue(
      relatorioProcessoPdfResponse,
    );

    const response = await request(httpServer)
      .get('/relatorios/100')
      .expect(200);

    const body = getResponseBody<RelatorioResponse>(response);

    expect(body.id_relatorio).toBe(100);
    expect(relatoriosService.getRelatorioById).toHaveBeenCalledWith(
      100,
      expect.objectContaining({
        id_usuario: 2,
        nivel_acesso: nivelacesso.TECNICO,
      }),
    );
    expectNoInternalFields(body);
  });

  it('POST /relatorios/processos/:id_processo gera PDF e XLSX', async () => {
    const responseBody: RelatorioGenerationResult = {
      relatorios: [relatorioProcessoPdfResponse, relatorioProcessoXlsxResponse],
      total_gerados: 2,
      formatos_gerados: [formatorelatorio.PDF, formatorelatorio.XLSX],
    };

    currentUser = adminUser;
    relatoriosService.generateProcessReports.mockResolvedValue(responseBody);

    const response = await request(httpServer)
      .post('/relatorios/processos/10')
      .send({
        formatos: ['PDF', 'XLSX'],
        observacao: 'Geração de teste',
      })
      .expect(201);

    const body = getResponseBody<RelatorioGenerationResult>(response);

    expect(body.total_gerados).toBe(2);
    expect(body.formatos_gerados).toEqual(['PDF', 'XLSX']);
    expect(JSON.stringify(body)).not.toContain('CSV');
    expect(
      body.relatorios.some(
        (relatorio) =>
          relatorio.tipo_relatorio === tiporelatorio.ALARME &&
          relatorio.formato_relatorio === formatorelatorio.XLSX,
      ),
    ).toBe(false);
    expect(relatoriosService.generateProcessReports).toHaveBeenCalledWith(
      10,
      {
        formatos: ['PDF', 'XLSX'],
        observacao: 'Geração de teste',
      },
      expect.objectContaining({
        id_usuario: 3,
        nivel_acesso: nivelacesso.ADMINISTRADOR,
      }),
    );
  });

  it('POST /relatorios/alarmes/:id_alarme gera apenas PDF', async () => {
    const responseBody: SingleRelatorioGenerationResult = {
      relatorio: relatorioAlarmePdfResponse,
      formato_gerado: formatorelatorio.PDF,
    };

    relatoriosService.generateAlarmReport.mockResolvedValue(responseBody);

    const response = await request(httpServer)
      .post('/relatorios/alarmes/20')
      .send({
        formato: 'PDF',
        observacao: 'Geração de teste',
      })
      .expect(201);

    const body = getResponseBody<SingleRelatorioGenerationResult>(response);

    expect(body.formato_gerado).toBe(formatorelatorio.PDF);
    expect(body.relatorio.tipo_relatorio).toBe(tiporelatorio.ALARME);
    expect(body.relatorio.formato_relatorio).toBe(formatorelatorio.PDF);
    expect(body.relatorio.formato_relatorio).not.toBe(formatorelatorio.XLSX);
    expect(relatoriosService.generateAlarmReport).toHaveBeenCalledWith(
      20,
      {
        formato: 'PDF',
        observacao: 'Geração de teste',
      },
      expect.objectContaining({
        id_usuario: 2,
        nivel_acesso: nivelacesso.TECNICO,
      }),
    );
  });

  it('GET /relatorios/:id_relatorio/preview retorna PDF inline via stream', async () => {
    const result: ReportPreviewResult = {
      stream: Readable.from([Buffer.from('pdf-preview')]),
      filename: 'tsea-processo-10-relatorio-pdf.pdf',
      content_type: 'application/pdf',
      content_length: 11,
      disposition: 'inline',
    };

    relatoriosService.previewRelatorio.mockResolvedValue(result);

    const response = await request(httpServer)
      .get('/relatorios/100/preview')
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(response.headers['content-disposition']).toContain(
      'tsea-processo-10-relatorio-pdf.pdf',
    );
    expect(Buffer.from(response.body).toString()).toBe('pdf-preview');
    expect(JSON.stringify(response.body)).not.toContain('gridfs_file_id');
    expect(relatoriosService.previewRelatorio).toHaveBeenCalledWith(
      100,
      expect.objectContaining({
        id_usuario: 2,
      }),
    );
  });

  it('GET /relatorios/:id_relatorio/download retorna PDF attachment', async () => {
    const result: ReportDownloadResult = {
      stream: Readable.from([Buffer.from('pdf-download')]),
      filename: 'tsea-processo-10-relatorio-pdf.pdf',
      content_type: 'application/pdf',
      content_length: 12,
      disposition: 'attachment',
    };

    relatoriosService.downloadRelatorio.mockResolvedValue(result);

    const response = await request(httpServer)
      .get('/relatorios/100/download')
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('.pdf');
    expect(Buffer.from(response.body).toString()).toBe('pdf-download');
  });

  it('GET /relatorios/:id_relatorio/download retorna XLSX attachment', async () => {
    const result: ReportDownloadResult = {
      stream: Readable.from([Buffer.from('xlsx')]),
      filename: 'tsea-processo-10-relatorio-xlsx.xlsx',
      content_type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content_length: 4,
      disposition: 'attachment',
    };

    relatoriosService.downloadRelatorio.mockResolvedValue(result);

    const response = await request(httpServer)
      .get('/relatorios/101/download')
      .buffer(true)
      .responseType('blob')
      .expect(200);

    const responseBody = response.body as Buffer;

    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('.xlsx');
    expect(Buffer.isBuffer(responseBody)).toBe(true);
    expect(responseBody.toString()).toBe('xlsx');
  });

  it('propaga erros 400, 403, 404 e 409 do service', async () => {
    relatoriosService.listRelatorios.mockRejectedValueOnce(
      new BadRequestException('Query inválida'),
    );
    await request(httpServer).get('/relatorios?order_by=invalido').expect(400);

    relatoriosService.downloadRelatorio.mockRejectedValueOnce(
      new ForbiddenException('Sem permissão'),
    );
    await request(httpServer).get('/relatorios/100/download').expect(403);

    relatoriosService.getRelatorioById.mockRejectedValueOnce(
      new NotFoundException('Relatório não encontrado'),
    );
    await request(httpServer).get('/relatorios/999').expect(404);

    relatoriosService.generateProcessReports.mockRejectedValueOnce(
      new ConflictException('Relatório duplicado'),
    );
    await request(httpServer)
      .post('/relatorios/processos/10')
      .send({ formatos: ['PDF'] })
      .expect(409);
  });

  it('retorna 404 para rotas proibidas', async () => {
    await request(httpServer).post('/relatorios').expect(404);
    await request(httpServer).patch('/relatorios/100').expect(404);
    await request(httpServer).put('/relatorios/100').expect(404);
    await request(httpServer).delete('/relatorios/100').expect(404);
    await request(httpServer).post('/relatorios/100/regenerate').expect(404);
    await request(httpServer).post('/relatorios/100/regerar').expect(404);
    await request(httpServer).get('/relatorios/100/csv').expect(404);
    await request(httpServer).post('/relatorios/oleo').expect(404);
    await request(httpServer).post('/relatorios/vazao').expect(404);
    await request(httpServer).post('/relatorios/nivel').expect(404);
    await request(httpServer).post('/relatorios/volume').expect(404);
    await request(httpServer).post('/relatorios/manual').expect(404);
    await request(httpServer).post('/relatorios/upload').expect(404);
  });
});
