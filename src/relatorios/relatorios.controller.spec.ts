import { StreamableFile } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { formatorelatorio, nivelacesso, tiporelatorio } from '@prisma/client';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type {
  RelatorioGenerationResult,
  RelatorioListResponse,
  RelatorioResponse,
  ReportDownloadResult,
  ReportPreviewResult,
  SingleRelatorioGenerationResult,
} from './interfaces';
import { RelatoriosController } from './relatorios.controller';
import {
  type AuthenticatedRelatoriosUser,
  RelatoriosService,
} from './relatorios.service';

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

type ResponseMockResult = {
  response: Response;
  setHeaderMock: jest.MockedFunction<Response['setHeader']>;
};

const currentUser = {
  id_usuario: 1,
  nome: 'Usuário Teste',
  nivel_acesso: {
    nome: nivelacesso.TECNICO,
  },
};

const serviceUser: AuthenticatedRelatoriosUser = {
  id_usuario: 1,
  nome: 'Usuário Teste',
  nivel_acesso: nivelacesso.TECNICO,
};

const relatorio: RelatorioResponse = {
  id_relatorio: 30,
  id_usuario: 1,
  id_processo: 10,
  id_alarme: null,
  tipo_relatorio: tiporelatorio.PROCESSO,
  formato_relatorio: formatorelatorio.PDF,
  titulo: 'Relatório',
  descricao: null,
  nome_arquivo: 'relatorio.pdf',
  tamanho_bytes: 10,
  content_type: 'application/pdf',
  gerado_em: new Date('2026-01-01T00:00:00.000Z'),
  gerado_por: null,
  processo: null,
  alarme: null,
  preview_disponivel: true,
  download_disponivel: true,
  possui_arquivo: true,
};

function responseMock(): ResponseMockResult {
  const setHeaderMock = jest.fn<Response['setHeader']>();

  const response = {
    setHeader: setHeaderMock,
  } as unknown as Response;

  return {
    response,
    setHeaderMock,
  };
}

describe('RelatoriosController', () => {
  let controller: RelatoriosController;
  let service: RelatoriosServiceMock;

  beforeEach(async () => {
    service = {
      listRelatorios: jest.fn<RelatoriosService['listRelatorios']>(),
      getRelatorioById: jest.fn<RelatoriosService['getRelatorioById']>(),
      generateProcessReports:
        jest.fn<RelatoriosService['generateProcessReports']>(),
      generateAlarmReport: jest.fn<RelatoriosService['generateAlarmReport']>(),
      previewRelatorio: jest.fn<RelatoriosService['previewRelatorio']>(),
      downloadRelatorio: jest.fn<RelatoriosService['downloadRelatorio']>(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [RelatoriosController],
      providers: [{ provide: RelatoriosService, useValue: service }],
    }).compile();

    controller = moduleRef.get(RelatoriosController);
  });

  it('listRelatorios chama service e retorna resposta', async () => {
    const result: RelatorioListResponse = {
      data: [relatorio],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        total_pages: 1,
        has_next_page: false,
        has_previous_page: false,
      },
    };

    service.listRelatorios.mockResolvedValue(result);

    await expect(controller.listRelatorios({}, currentUser)).resolves.toBe(
      result,
    );
    expect(service.listRelatorios).toHaveBeenCalledWith({}, serviceUser);
  });

  it('getRelatorioById chama service e retorna resposta', async () => {
    service.getRelatorioById.mockResolvedValue(relatorio);

    await expect(controller.getRelatorioById(30, currentUser)).resolves.toBe(
      relatorio,
    );
    expect(service.getRelatorioById).toHaveBeenCalledWith(30, serviceUser);
  });

  it('generateProcessReports chama service e retorna resposta', async () => {
    const result: RelatorioGenerationResult = {
      relatorios: [relatorio],
      total_gerados: 1,
      formatos_gerados: [formatorelatorio.PDF],
    };

    service.generateProcessReports.mockResolvedValue(result);

    await expect(
      controller.generateProcessReports(
        10,
        { formatos: [formatorelatorio.PDF] },
        currentUser,
      ),
    ).resolves.toBe(result);
    expect(service.generateProcessReports).toHaveBeenCalledWith(
      10,
      { formatos: [formatorelatorio.PDF] },
      serviceUser,
    );
  });

  it('generateAlarmReport chama service e retorna resposta', async () => {
    const result: SingleRelatorioGenerationResult = {
      relatorio,
      formato_gerado: formatorelatorio.PDF,
    };

    service.generateAlarmReport.mockResolvedValue(result);

    await expect(
      controller.generateAlarmReport(20, {}, currentUser),
    ).resolves.toBe(result);
    expect(service.generateAlarmReport).toHaveBeenCalledWith(
      20,
      {},
      serviceUser,
    );
  });

  it('previewRelatorio seta headers e retorna StreamableFile', async () => {
    const stream = Readable.from(['pdf']);
    const result: ReportPreviewResult = {
      stream,
      filename: 'relatorio.pdf',
      content_type: 'application/pdf',
      content_length: 3,
      disposition: 'inline',
    };
    const { response, setHeaderMock } = responseMock();

    service.previewRelatorio.mockResolvedValue(result);

    const file = await controller.previewRelatorio(30, currentUser, response);

    expect(file).toBeInstanceOf(StreamableFile);
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="relatorio.pdf"',
    );
    expect(setHeaderMock).toHaveBeenCalledWith('Content-Length', '3');
  });

  it('downloadRelatorio seta headers e retorna StreamableFile', async () => {
    const stream = Readable.from(['xlsx']);
    const result: ReportDownloadResult = {
      stream,
      filename: 'relatorio.xlsx',
      content_type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content_length: 4,
      disposition: 'attachment',
    };
    const { response, setHeaderMock } = responseMock();

    service.downloadRelatorio.mockResolvedValue(result);

    const file = await controller.downloadRelatorio(30, currentUser, response);

    expect(file).toBeInstanceOf(StreamableFile);
    expect(setHeaderMock).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="relatorio.xlsx"',
    );
    expect(setHeaderMock).toHaveBeenCalledWith('Content-Length', '4');
  });
});
