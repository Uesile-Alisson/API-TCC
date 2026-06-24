import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { formatorelatorio, nivelacesso, tiporelatorio } from '@prisma/client';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
  GeneratedReportFile,
  RelatorioListResponse,
  RelatorioResponse,
} from './interfaces';
import {
  AlarmReportDataMapper,
  ProcessReportDataMapper,
  RelatorioMapper,
} from './mappers';
import {
  RelatorioAlarmeDataRepository,
  RelatorioProcessoDataRepository,
  RelatoriosRepository,
} from './repositories';
import type {
  CompleteAlarmReportSource,
  CompleteProcessReportSource,
  RelatorioFileMetadataRecord,
  RelatorioWithRelations,
} from './repositories';
import {
  AlarmPdfReportGenerator,
  ProcessPdfReportGenerator,
} from './generators/pdf';
import { ProcessXlsxReportGenerator } from './generators/xlsx';
import { GridFsReportStorageService } from './storage';
import type { SavedReportFileResult } from './storage';
import {
  RelatorioFileValidator,
  RelatorioGenerationValidator,
  RelatorioPermissionValidator,
  RelatorioQueryValidator,
} from './validators';
import {
  type AuthenticatedRelatoriosUser,
  RelatoriosService,
} from './relatorios.service';

type RelatoriosRepositoryMock = {
  findMany: jest.MockedFunction<RelatoriosRepository['findMany']>;
  findById: jest.MockedFunction<RelatoriosRepository['findById']>;
  findFileMetadataById: jest.MockedFunction<
    RelatoriosRepository['findFileMetadataById']
  >;
  existsByProcessAndFormat: jest.MockedFunction<
    RelatoriosRepository['existsByProcessAndFormat']
  >;
  existsByAlarmAndFormat: jest.MockedFunction<
    RelatoriosRepository['existsByAlarmAndFormat']
  >;
  create: jest.MockedFunction<RelatoriosRepository['create']>;
};

type ProcessoRepositoryMock = {
  findCompleteProcessReportSource: jest.MockedFunction<
    RelatorioProcessoDataRepository['findCompleteProcessReportSource']
  >;
};

type AlarmeRepositoryMock = {
  findCompleteAlarmReportSource: jest.MockedFunction<
    RelatorioAlarmeDataRepository['findCompleteAlarmReportSource']
  >;
};

type StorageMock = {
  saveReportFile: jest.MockedFunction<
    GridFsReportStorageService['saveReportFile']
  >;
  readReportFile: jest.MockedFunction<
    GridFsReportStorageService['readReportFile']
  >;
  deleteReportFile: jest.MockedFunction<
    GridFsReportStorageService['deleteReportFile']
  >;
  buildPreviewDisposition: jest.MockedFunction<
    GridFsReportStorageService['buildPreviewDisposition']
  >;
  buildDownloadDisposition: jest.MockedFunction<
    GridFsReportStorageService['buildDownloadDisposition']
  >;
};

const user: AuthenticatedRelatoriosUser = {
  id_usuario: 1,
  nome: 'Usuário Teste',
  nivel_acesso: nivelacesso.TECNICO,
};

const relatorioResponse: RelatorioResponse = {
  id_relatorio: 30,
  id_usuario: 1,
  id_processo: 10,
  id_alarme: null,
  tipo_relatorio: tiporelatorio.PROCESSO,
  formato_relatorio: formatorelatorio.PDF,
  titulo: 'Relatório Teste',
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

function generatedFile(formato: formatorelatorio): GeneratedReportFile {
  const isPdf = formato === formatorelatorio.PDF;

  return {
    buffer: Buffer.from(isPdf ? 'pdf' : 'xlsx'),
    filename: isPdf ? 'relatorio.pdf' : 'relatorio.xlsx',
    extension: isPdf ? 'pdf' : 'xlsx',
    mime_type: isPdf
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size_bytes: isPdf ? 3 : 4,
    hash_arquivo: isPdf ? 'hash-pdf' : 'hash-xlsx',
  };
}

function storageResult(formato: formatorelatorio): SavedReportFileResult {
  const file = generatedFile(formato);

  return {
    gridfs_file_id: '507f1f77bcf86cd799439011',
    nome_arquivo: file.filename,
    content_type: file.mime_type,
    bucket_name: 'relatorios',
    storage_provider: 'GRIDFS',
    hash_arquivo: file.hash_arquivo,
    tamanho_bytes: file.size_bytes,
    upload_date: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('RelatoriosService', () => {
  let service: RelatoriosService;
  let relatoriosRepository: RelatoriosRepositoryMock;
  let processoRepository: ProcessoRepositoryMock;
  let alarmeRepository: AlarmeRepositoryMock;
  let relatorioMapper: {
    toListResponse: jest.MockedFunction<RelatorioMapper['toListResponse']>;
    toResponse: jest.MockedFunction<RelatorioMapper['toResponse']>;
  };
  let processMapper: {
    toReportData: jest.MockedFunction<ProcessReportDataMapper['toReportData']>;
  };
  let alarmMapper: {
    toReportData: jest.MockedFunction<AlarmReportDataMapper['toReportData']>;
  };
  let queryValidator: {
    validateListQuery: jest.MockedFunction<
      RelatorioQueryValidator['validateListQuery']
    >;
    validateRestrictedFilters: jest.MockedFunction<
      RelatorioQueryValidator['validateRestrictedFilters']
    >;
  };
  let generationValidator: {
    validateProcessReportGeneration: jest.MockedFunction<
      RelatorioGenerationValidator['validateProcessReportGeneration']
    >;
    validateAlarmReportGeneration: jest.MockedFunction<
      RelatorioGenerationValidator['validateAlarmReportGeneration']
    >;
  };
  let permissionValidator: {
    validateCanList: jest.MockedFunction<
      RelatorioPermissionValidator['validateCanList']
    >;
    validateCanView: jest.MockedFunction<
      RelatorioPermissionValidator['validateCanView']
    >;
    validateCanGenerateProcessReport: jest.MockedFunction<
      RelatorioPermissionValidator['validateCanGenerateProcessReport']
    >;
    validateCanGenerateAlarmReport: jest.MockedFunction<
      RelatorioPermissionValidator['validateCanGenerateAlarmReport']
    >;
    validateCanPreview: jest.MockedFunction<
      RelatorioPermissionValidator['validateCanPreview']
    >;
    validateCanDownload: jest.MockedFunction<
      RelatorioPermissionValidator['validateCanDownload']
    >;
  };
  let fileValidator: {
    validateGeneratedFile: jest.MockedFunction<
      RelatorioFileValidator['validateGeneratedFile']
    >;
    validatePreviewMetadata: jest.MockedFunction<
      RelatorioFileValidator['validatePreviewMetadata']
    >;
    validateDownloadMetadata: jest.MockedFunction<
      RelatorioFileValidator['validateDownloadMetadata']
    >;
  };
  let processPdfGenerator: {
    generate: jest.MockedFunction<ProcessPdfReportGenerator['generate']>;
  };
  let alarmPdfGenerator: {
    generate: jest.MockedFunction<AlarmPdfReportGenerator['generate']>;
  };
  let processXlsxGenerator: {
    generate: jest.MockedFunction<ProcessXlsxReportGenerator['generate']>;
  };
  let storage: StorageMock;

  beforeEach(async () => {
    relatoriosRepository = {
      findMany: jest.fn<RelatoriosRepository['findMany']>(),
      findById: jest.fn<RelatoriosRepository['findById']>(),
      findFileMetadataById:
        jest.fn<RelatoriosRepository['findFileMetadataById']>(),
      existsByProcessAndFormat:
        jest.fn<RelatoriosRepository['existsByProcessAndFormat']>(),
      existsByAlarmAndFormat:
        jest.fn<RelatoriosRepository['existsByAlarmAndFormat']>(),
      create: jest.fn<RelatoriosRepository['create']>(),
    };

    processoRepository = {
      findCompleteProcessReportSource:
        jest.fn<
          RelatorioProcessoDataRepository['findCompleteProcessReportSource']
        >(),
    };

    alarmeRepository = {
      findCompleteAlarmReportSource:
        jest.fn<
          RelatorioAlarmeDataRepository['findCompleteAlarmReportSource']
        >(),
    };

    relatorioMapper = {
      toListResponse: jest.fn<RelatorioMapper['toListResponse']>(),
      toResponse: jest.fn<RelatorioMapper['toResponse']>(),
    };

    processMapper = {
      toReportData: jest.fn<ProcessReportDataMapper['toReportData']>(),
    };

    alarmMapper = {
      toReportData: jest.fn<AlarmReportDataMapper['toReportData']>(),
    };

    queryValidator = {
      validateListQuery:
        jest.fn<RelatorioQueryValidator['validateListQuery']>(),
      validateRestrictedFilters:
        jest.fn<RelatorioQueryValidator['validateRestrictedFilters']>(),
    };

    generationValidator = {
      validateProcessReportGeneration:
        jest.fn<
          RelatorioGenerationValidator['validateProcessReportGeneration']
        >(),
      validateAlarmReportGeneration:
        jest.fn<
          RelatorioGenerationValidator['validateAlarmReportGeneration']
        >(),
    };

    permissionValidator = {
      validateCanList:
        jest.fn<RelatorioPermissionValidator['validateCanList']>(),
      validateCanView:
        jest.fn<RelatorioPermissionValidator['validateCanView']>(),
      validateCanGenerateProcessReport:
        jest.fn<
          RelatorioPermissionValidator['validateCanGenerateProcessReport']
        >(),
      validateCanGenerateAlarmReport:
        jest.fn<
          RelatorioPermissionValidator['validateCanGenerateAlarmReport']
        >(),
      validateCanPreview:
        jest.fn<RelatorioPermissionValidator['validateCanPreview']>(),
      validateCanDownload:
        jest.fn<RelatorioPermissionValidator['validateCanDownload']>(),
    };

    fileValidator = {
      validateGeneratedFile:
        jest.fn<RelatorioFileValidator['validateGeneratedFile']>(),
      validatePreviewMetadata:
        jest.fn<RelatorioFileValidator['validatePreviewMetadata']>(),
      validateDownloadMetadata:
        jest.fn<RelatorioFileValidator['validateDownloadMetadata']>(),
    };

    processPdfGenerator = {
      generate: jest.fn<ProcessPdfReportGenerator['generate']>(),
    };

    alarmPdfGenerator = {
      generate: jest.fn<AlarmPdfReportGenerator['generate']>(),
    };

    processXlsxGenerator = {
      generate: jest.fn<ProcessXlsxReportGenerator['generate']>(),
    };

    storage = {
      saveReportFile: jest.fn<GridFsReportStorageService['saveReportFile']>(),
      readReportFile: jest.fn<GridFsReportStorageService['readReportFile']>(),
      deleteReportFile:
        jest.fn<GridFsReportStorageService['deleteReportFile']>(),
      buildPreviewDisposition:
        jest.fn<GridFsReportStorageService['buildPreviewDisposition']>(),
      buildDownloadDisposition:
        jest.fn<GridFsReportStorageService['buildDownloadDisposition']>(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RelatoriosService,
        { provide: RelatoriosRepository, useValue: relatoriosRepository },
        {
          provide: RelatorioProcessoDataRepository,
          useValue: processoRepository,
        },
        { provide: RelatorioAlarmeDataRepository, useValue: alarmeRepository },
        { provide: RelatorioMapper, useValue: relatorioMapper },
        { provide: ProcessReportDataMapper, useValue: processMapper },
        { provide: AlarmReportDataMapper, useValue: alarmMapper },
        { provide: RelatorioQueryValidator, useValue: queryValidator },
        {
          provide: RelatorioGenerationValidator,
          useValue: generationValidator,
        },
        {
          provide: RelatorioPermissionValidator,
          useValue: permissionValidator,
        },
        { provide: RelatorioFileValidator, useValue: fileValidator },
        { provide: ProcessPdfReportGenerator, useValue: processPdfGenerator },
        { provide: AlarmPdfReportGenerator, useValue: alarmPdfGenerator },
        { provide: ProcessXlsxReportGenerator, useValue: processXlsxGenerator },
        { provide: GridFsReportStorageService, useValue: storage },
      ],
    }).compile();

    service = moduleRef.get(RelatoriosService);
  });

  it('lista relatórios validando permissão, query e filtros restritos', async () => {
    const listResponse: RelatorioListResponse = {
      data: [relatorioResponse],
      meta: {
        page: 1,
        limit: 20,
        total: 1,
        total_pages: 1,
        has_next_page: false,
        has_previous_page: false,
      },
    };

    relatoriosRepository.findMany.mockResolvedValue({
      data: [{} as RelatorioWithRelations],
      total: 1,
    });
    relatorioMapper.toListResponse.mockReturnValue(listResponse);

    await expect(
      service.listRelatorios(
        {},
        {
          ...user,
          nivel_acesso: nivelacesso.OPERADOR,
        },
      ),
    ).resolves.toBe(listResponse);

    expect(permissionValidator.validateCanList).toHaveBeenCalledWith(
      nivelacesso.OPERADOR,
    );
    expect(queryValidator.validateListQuery).toHaveBeenCalled();
    expect(queryValidator.validateRestrictedFilters).toHaveBeenCalled();
    expect(relatoriosRepository.findMany).toHaveBeenCalled();
    expect(relatorioMapper.toListResponse).toHaveBeenCalled();
  });

  it('busca relatório por id, mapeia e lança NotFound quando não existe', async () => {
    relatoriosRepository.findById.mockResolvedValue(
      {} as RelatorioWithRelations,
    );
    relatorioMapper.toResponse.mockReturnValue(relatorioResponse);

    await expect(service.getRelatorioById(30, user)).resolves.toBe(
      relatorioResponse,
    );
    expect(permissionValidator.validateCanView).toHaveBeenCalled();
    expect(relatoriosRepository.findById).toHaveBeenCalledWith(30);
    expect(relatorioMapper.toResponse).toHaveBeenCalled();

    relatoriosRepository.findById.mockResolvedValueOnce(null);

    await expect(service.getRelatorioById(999, user)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('gera relatórios de processo PDF e XLSX por padrão', async () => {
    processoRepository.findCompleteProcessReportSource.mockResolvedValue({
      processo: {},
    } as CompleteProcessReportSource);
    relatoriosRepository.existsByProcessAndFormat.mockResolvedValue(false);
    processMapper.toReportData.mockReturnValue(
      {} as Parameters<ProcessPdfReportGenerator['generate']>[0],
    );
    processPdfGenerator.generate.mockResolvedValue(
      generatedFile(formatorelatorio.PDF),
    );
    processXlsxGenerator.generate.mockResolvedValue(
      generatedFile(formatorelatorio.XLSX),
    );
    storage.saveReportFile
      .mockResolvedValueOnce(storageResult(formatorelatorio.PDF))
      .mockResolvedValueOnce(storageResult(formatorelatorio.XLSX));
    relatoriosRepository.create.mockResolvedValue({} as RelatorioWithRelations);
    relatorioMapper.toResponse.mockReturnValue(relatorioResponse);

    const result = await service.generateProcessReports(10, {}, user);

    expect(
      permissionValidator.validateCanGenerateProcessReport,
    ).toHaveBeenCalled();
    expect(
      processoRepository.findCompleteProcessReportSource,
    ).toHaveBeenCalledWith(10);
    expect(relatoriosRepository.existsByProcessAndFormat).toHaveBeenCalledTimes(
      2,
    );
    expect(
      generationValidator.validateProcessReportGeneration,
    ).toHaveBeenCalled();
    expect(processMapper.toReportData).toHaveBeenCalled();
    expect(processPdfGenerator.generate).toHaveBeenCalled();
    expect(processXlsxGenerator.generate).toHaveBeenCalled();
    expect(storage.saveReportFile).toHaveBeenCalledTimes(2);
    expect(relatoriosRepository.create).toHaveBeenCalledTimes(2);
    expect(result.total_gerados).toBe(2);
    expect(result.formatos_gerados).toEqual([
      formatorelatorio.PDF,
      formatorelatorio.XLSX,
    ]);
  });

  it('gera processo apenas PDF quando solicitado', async () => {
    processoRepository.findCompleteProcessReportSource.mockResolvedValue({
      processo: {},
    } as CompleteProcessReportSource);
    relatoriosRepository.existsByProcessAndFormat.mockResolvedValue(false);
    processMapper.toReportData.mockReturnValue(
      {} as Parameters<ProcessPdfReportGenerator['generate']>[0],
    );
    processPdfGenerator.generate.mockResolvedValue(
      generatedFile(formatorelatorio.PDF),
    );
    storage.saveReportFile.mockResolvedValue(
      storageResult(formatorelatorio.PDF),
    );
    relatoriosRepository.create.mockResolvedValue({} as RelatorioWithRelations);
    relatorioMapper.toResponse.mockReturnValue(relatorioResponse);

    await service.generateProcessReports(
      10,
      { formatos: [formatorelatorio.PDF] },
      user,
    );

    expect(processPdfGenerator.generate).toHaveBeenCalled();
    expect(processXlsxGenerator.generate).not.toHaveBeenCalled();
  });

  it('gera processo apenas XLSX quando solicitado', async () => {
    processoRepository.findCompleteProcessReportSource.mockResolvedValue({
      processo: {},
    } as CompleteProcessReportSource);
    relatoriosRepository.existsByProcessAndFormat.mockResolvedValue(false);
    processMapper.toReportData.mockReturnValue(
      {} as Parameters<ProcessPdfReportGenerator['generate']>[0],
    );
    processXlsxGenerator.generate.mockResolvedValue(
      generatedFile(formatorelatorio.XLSX),
    );
    storage.saveReportFile.mockResolvedValue(
      storageResult(formatorelatorio.XLSX),
    );
    relatoriosRepository.create.mockResolvedValue({} as RelatorioWithRelations);
    relatorioMapper.toResponse.mockReturnValue(relatorioResponse);

    await service.generateProcessReports(
      10,
      { formatos: [formatorelatorio.XLSX] },
      user,
    );

    expect(processXlsxGenerator.generate).toHaveBeenCalled();
    expect(processPdfGenerator.generate).not.toHaveBeenCalled();
  });

  it('faz rollback do GridFS quando create de metadados falha', async () => {
    processoRepository.findCompleteProcessReportSource.mockResolvedValue({
      processo: {},
    } as CompleteProcessReportSource);
    relatoriosRepository.existsByProcessAndFormat.mockResolvedValue(false);
    processMapper.toReportData.mockReturnValue(
      {} as Parameters<ProcessPdfReportGenerator['generate']>[0],
    );
    processPdfGenerator.generate.mockResolvedValue(
      generatedFile(formatorelatorio.PDF),
    );
    storage.saveReportFile.mockResolvedValue(
      storageResult(formatorelatorio.PDF),
    );
    relatoriosRepository.create.mockRejectedValue(new Error('postgres falhou'));
    storage.deleteReportFile.mockResolvedValue({
      deleted: true,
      gridfs_file_id: '507f1f77bcf86cd799439011',
      bucket_name: 'relatorios',
    });

    await expect(
      service.generateProcessReports(
        10,
        { formatos: [formatorelatorio.PDF] },
        user,
      ),
    ).rejects.toThrow(InternalServerErrorException);
    expect(storage.deleteReportFile).toHaveBeenCalledWith({
      gridfs_file_id: '507f1f77bcf86cd799439011',
      bucket_name: 'relatorios',
    });
  });

  it('gera relatório de alarme PDF e não chama XLSX', async () => {
    alarmeRepository.findCompleteAlarmReportSource.mockResolvedValue({
      alarme: { id_processo: 10 },
    } as CompleteAlarmReportSource);
    relatoriosRepository.existsByAlarmAndFormat.mockResolvedValue(false);
    alarmMapper.toReportData.mockReturnValue(
      {} as Parameters<AlarmPdfReportGenerator['generate']>[0],
    );
    alarmPdfGenerator.generate.mockResolvedValue(
      generatedFile(formatorelatorio.PDF),
    );
    storage.saveReportFile.mockResolvedValue(
      storageResult(formatorelatorio.PDF),
    );
    relatoriosRepository.create.mockResolvedValue({} as RelatorioWithRelations);
    relatorioMapper.toResponse.mockReturnValue(relatorioResponse);

    const result = await service.generateAlarmReport(20, {}, user);

    expect(
      permissionValidator.validateCanGenerateAlarmReport,
    ).toHaveBeenCalled();
    expect(alarmeRepository.findCompleteAlarmReportSource).toHaveBeenCalledWith(
      20,
    );
    expect(relatoriosRepository.existsByAlarmAndFormat).toHaveBeenCalledWith(
      20,
      formatorelatorio.PDF,
    );
    expect(
      generationValidator.validateAlarmReportGeneration,
    ).toHaveBeenCalled();
    expect(alarmMapper.toReportData).toHaveBeenCalled();
    expect(alarmPdfGenerator.generate).toHaveBeenCalled();
    expect(processXlsxGenerator.generate).not.toHaveBeenCalled();
    expect(result.formato_gerado).toBe(formatorelatorio.PDF);
  });

  it('prepara preview sem criar StreamableFile', async () => {
    const stream = Readable.from(['pdf']);

    relatoriosRepository.findFileMetadataById.mockResolvedValue({
      gridfs_file_id: '507f1f77bcf86cd799439011',
      nome_arquivo: 'relatorio.pdf',
      content_type: 'application/pdf',
      bucket_name: 'relatorios',
      tamanho_bytes: BigInt(3),
    } as RelatorioFileMetadataRecord);
    storage.readReportFile.mockResolvedValue({
      stream,
      nome_arquivo: 'relatorio.pdf',
      content_type: 'application/pdf',
      content_length: 3,
      bucket_name: 'relatorios',
    });
    storage.buildPreviewDisposition.mockReturnValue(
      'inline; filename="relatorio.pdf"',
    );

    await expect(service.previewRelatorio(30, user)).resolves.toMatchObject({
      stream,
      filename: 'relatorio.pdf',
      content_type: 'application/pdf',
      content_length: 3,
      disposition: 'inline',
    });
    expect(permissionValidator.validateCanPreview).toHaveBeenCalled();
    expect(fileValidator.validatePreviewMetadata).toHaveBeenCalled();
    expect(storage.readReportFile).toHaveBeenCalled();
  });

  it('prepara download sem criar StreamableFile', async () => {
    const stream = Readable.from(['xlsx']);

    relatoriosRepository.findFileMetadataById.mockResolvedValue({
      gridfs_file_id: '507f1f77bcf86cd799439011',
      nome_arquivo: 'relatorio.xlsx',
      content_type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bucket_name: 'relatorios',
      tamanho_bytes: BigInt(4),
    } as RelatorioFileMetadataRecord);
    storage.readReportFile.mockResolvedValue({
      stream,
      nome_arquivo: 'relatorio.xlsx',
      content_type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content_length: 4,
      bucket_name: 'relatorios',
    });
    storage.buildDownloadDisposition.mockReturnValue(
      'attachment; filename="relatorio.xlsx"',
    );

    await expect(service.downloadRelatorio(30, user)).resolves.toMatchObject({
      stream,
      filename: 'relatorio.xlsx',
      content_length: 4,
      disposition: 'attachment',
    });
    expect(permissionValidator.validateCanDownload).toHaveBeenCalled();
    expect(fileValidator.validateDownloadMetadata).toHaveBeenCalled();
    expect(storage.readReportFile).toHaveBeenCalled();
  });

  it('propaga bloqueio de operador para gerar e baixar', async () => {
    permissionValidator.validateCanGenerateProcessReport.mockImplementation(
      () => {
        throw new ForbiddenException();
      },
    );
    await expect(service.generateProcessReports(10, {}, user)).rejects.toThrow(
      ForbiddenException,
    );

    permissionValidator.validateCanDownload.mockImplementation(() => {
      throw new ForbiddenException();
    });
    await expect(service.downloadRelatorio(30, user)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
