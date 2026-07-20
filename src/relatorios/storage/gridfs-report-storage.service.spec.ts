import { InternalServerErrorException } from '@nestjs/common';
import { formatorelatorio, tiporelatorio } from '@prisma/client';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { GridFsService } from '../../mongodb/gridfs.service';
import type { ReportFileService } from './report-file.service';
import { GridFsReportStorageService } from './gridfs-report-storage.service';

type GridFsServiceMock = {
  uploadFile: jest.MockedFunction<GridFsService['uploadFile']>;
  openDownloadStream: jest.MockedFunction<GridFsService['openDownloadStream']>;
  fileExists: jest.MockedFunction<GridFsService['fileExists']>;
  deleteFile: jest.MockedFunction<GridFsService['deleteFile']>;
  findFilesUploadedBefore: jest.MockedFunction<
    GridFsService['findFilesUploadedBefore']
  >;
};

type ReportFileServiceMock = {
  prepareReportFile: jest.MockedFunction<
    ReportFileService['prepareReportFile']
  >;
  buildContentDisposition: jest.MockedFunction<
    ReportFileService['buildContentDisposition']
  >;
};

describe('GridFsReportStorageService', () => {
  let service: GridFsReportStorageService;
  let gridFsService: GridFsServiceMock;
  let reportFileService: ReportFileServiceMock;

  beforeEach(() => {
    gridFsService = {
      uploadFile: jest.fn<GridFsService['uploadFile']>(),
      openDownloadStream: jest.fn<GridFsService['openDownloadStream']>(),
      fileExists: jest.fn<GridFsService['fileExists']>(),
      deleteFile: jest.fn<GridFsService['deleteFile']>(),
      findFilesUploadedBefore:
        jest.fn<GridFsService['findFilesUploadedBefore']>(),
    };

    reportFileService = {
      prepareReportFile: jest.fn<ReportFileService['prepareReportFile']>(),
      buildContentDisposition:
        jest.fn<ReportFileService['buildContentDisposition']>(),
    };

    service = new GridFsReportStorageService(
      gridFsService as unknown as GridFsService,
      reportFileService as unknown as ReportFileService,
    );
  });

  it('salva arquivo usando ReportFileService e GridFsService', async () => {
    const buffer = Buffer.from('arquivo');

    reportFileService.prepareReportFile.mockReturnValue({
      buffer,
      nome_arquivo: 'relatorio.pdf',
      content_type: 'application/pdf',
      extension: 'pdf',
      hash_arquivo: 'hash',
      tamanho_bytes: buffer.length,
    });
    gridFsService.uploadFile.mockResolvedValue({
      fileId: '507f1f77bcf86cd799439011',
      filename: 'relatorio.pdf',
      contentType: 'application/pdf',
      bucketName: 'relatorios',
      length: buffer.length,
      uploadDate: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.saveReportFile({
      buffer,
      tipo_relatorio: tiporelatorio.PROCESSO,
      formato_relatorio: formatorelatorio.PDF,
      id_usuario: 1,
      id_processo: 10,
      metadata: {
        titulo: 'Relatório',
        descricao: 'Descricao',
        hash_arquivo: 'hash',
      },
    });
    const metadata = gridFsService.uploadFile.mock.calls[0][0].metadata;

    expect(reportFileService.prepareReportFile).toHaveBeenCalled();
    expect(gridFsService.uploadFile).toHaveBeenCalled();
    expect(result).toMatchObject({
      gridfs_file_id: '507f1f77bcf86cd799439011',
      nome_arquivo: 'relatorio.pdf',
      content_type: 'application/pdf',
      bucket_name: 'relatorios',
      storage_provider: 'GRIDFS',
      hash_arquivo: 'hash',
      tamanho_bytes: buffer.length,
    });
    expect(metadata).not.toHaveProperty('buffer');
    expect(metadata).not.toHaveProperty('base64');
    expect(metadata).not.toHaveProperty('login');
    expect(metadata).not.toHaveProperty('email');
    expect(metadata).not.toHaveProperty('senha_hash');
  });

  it('normaliza falha de upload', async () => {
    reportFileService.prepareReportFile.mockReturnValue({
      buffer: Buffer.from('arquivo'),
      nome_arquivo: 'relatorio.pdf',
      content_type: 'application/pdf',
      extension: 'pdf',
      hash_arquivo: 'hash',
      tamanho_bytes: 7,
    });
    gridFsService.uploadFile.mockRejectedValue(new Error('mongo indisponivel'));

    await expect(
      service.saveReportFile({
        buffer: Buffer.from('arquivo'),
        tipo_relatorio: tiporelatorio.PROCESSO,
        formato_relatorio: formatorelatorio.PDF,
        id_usuario: 1,
        id_processo: 10,
      }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('lê, verifica existência e remove arquivo via GridFsService', async () => {
    const stream = Readable.from(['pdf']);

    gridFsService.openDownloadStream.mockResolvedValue({
      stream,
      file: {
        fileId: '507f1f77bcf86cd799439011',
        filename: 'relatorio.pdf',
        contentType: 'application/pdf',
        bucketName: 'relatorios',
        length: 10,
        uploadDate: new Date('2026-01-01T00:00:00.000Z'),
        metadata: null,
      },
    });
    gridFsService.fileExists.mockResolvedValue(true);
    gridFsService.deleteFile.mockResolvedValue({
      deleted: true,
      fileId: '507f1f77bcf86cd799439011',
      bucketName: 'relatorios',
    });

    await expect(
      service.readReportFile({
        gridfs_file_id: '507f1f77bcf86cd799439011',
        nome_arquivo: 'relatorio.pdf',
        content_type: 'application/pdf',
        bucket_name: 'relatorios',
      }),
    ).resolves.toMatchObject({
      stream,
      nome_arquivo: 'relatorio.pdf',
      content_type: 'application/pdf',
      content_length: 10,
    });
    await expect(
      service.fileExists('507f1f77bcf86cd799439011', 'relatorios'),
    ).resolves.toBe(true);
    await expect(
      service.deleteReportFile({
        gridfs_file_id: '507f1f77bcf86cd799439011',
        bucket_name: 'relatorios',
      }),
    ).resolves.toMatchObject({ deleted: true });
  });

  it('lista somente candidatos gerenciados anteriores ao limite', async () => {
    const uploadedBefore = new Date('2026-01-02T00:00:00.000Z');
    const uploadDate = new Date('2026-01-01T00:00:00.000Z');
    gridFsService.findFilesUploadedBefore.mockResolvedValue([
      {
        fileId: '507f1f77bcf86cd799439011',
        filename: 'relatorio.pdf',
        contentType: 'application/pdf',
        bucketName: 'relatorios',
        length: 10,
        uploadDate,
        metadata: { origem: 'RELATORIOS_MODULE' },
      },
    ]);

    await expect(
      service.findManagedFilesUploadedBefore(uploadedBefore),
    ).resolves.toEqual([
      {
        gridfs_file_id: '507f1f77bcf86cd799439011',
        bucket_name: 'relatorios',
        upload_date: uploadDate,
      },
    ]);
    expect(gridFsService.findFilesUploadedBefore).toHaveBeenCalledWith(
      uploadedBefore,
      { origem: 'RELATORIOS_MODULE' },
      'relatorios',
    );
  });
});
