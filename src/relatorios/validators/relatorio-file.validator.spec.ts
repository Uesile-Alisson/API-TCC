import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { formatorelatorio, tiporelatorio } from '@prisma/client';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { RELATORIO_MAX_FILE_SIZE_BYTES } from '../constants';
import type { RelatorioFileMetadataRecord } from '../repositories';
import { RelatorioFileValidator } from './relatorio-file.validator';

function metadata(
  overrides: Partial<RelatorioFileMetadataRecord> = {},
): RelatorioFileMetadataRecord {
  return {
    id_relatorio: 30,
    id_usuario: 1,
    id_processo: 10,
    id_alarme: null,
    tipo_relatorio: tiporelatorio.PROCESSO,
    formato_relatorio: formatorelatorio.PDF,
    nome_arquivo: 'tsea-processo-10-relatorio-pdf.pdf',
    gridfs_file_id: '507f1f77bcf86cd799439011',
    content_type: 'application/pdf',
    bucket_name: 'relatorios',
    storage_provider: 'GRIDFS',
    tamanho_bytes: BigInt(120),
    ...overrides,
  };
}

describe('RelatorioFileValidator', () => {
  let validator: RelatorioFileValidator;

  beforeEach(() => {
    validator = new RelatorioFileValidator();
  });

  it('bloqueia metadados nulos ou sem gridfs_file_id valido', () => {
    expect(() => validator.validateFileMetadata(null)).toThrow(
      NotFoundException,
    );
    expect(() =>
      validator.validateFileMetadata(metadata({ gridfs_file_id: null })),
    ).toThrow(NotFoundException);
    expect(() =>
      validator.validateGridFsFileId('identificador-invalido'),
    ).toThrow(NotFoundException);
  });

  it('bloqueia provider diferente de GRIDFS', () => {
    expect(() =>
      validator.validateFileMetadata(metadata({ storage_provider: 'LOCAL' })),
    ).toThrow(InternalServerErrorException);
  });

  it('valida preview apenas para PDF', () => {
    expect(() => validator.validatePreviewMetadata(metadata())).not.toThrow();
    expect(() =>
      validator.validatePreviewMetadata(
        metadata({
          formato_relatorio: formatorelatorio.XLSX,
          nome_arquivo: 'tsea-processo-10-relatorio-xlsx.xlsx',
          content_type:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('valida download PDF e XLSX', () => {
    expect(() => validator.validateDownloadMetadata(metadata())).not.toThrow();
    expect(() =>
      validator.validateDownloadMetadata(
        metadata({
          formato_relatorio: formatorelatorio.XLSX,
          nome_arquivo: 'tsea-processo-10-relatorio-xlsx.xlsx',
          content_type:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ),
    ).not.toThrow();
  });

  it('bloqueia content type incompatível', () => {
    expect(() =>
      validator.validateDownloadMetadata(
        metadata({ content_type: 'application/json' }),
      ),
    ).toThrow(InternalServerErrorException);
  });

  it('bloqueia nomes inseguros e CSV', () => {
    expect(() => validator.validateFilename('../relatorio.pdf')).toThrow(
      BadRequestException,
    );
    expect(() => validator.validateFilename('pasta/relatorio.pdf')).toThrow(
      BadRequestException,
    );
    expect(() => validator.validateFilename('relatorio.csv')).toThrow(
      BadRequestException,
    );
  });

  it('bloqueia tamanho negativo ou acima do limite', () => {
    expect(() => validator.validateFileSize(-1)).toThrow(BadRequestException);
    expect(() =>
      validator.validateFileSize(RELATORIO_MAX_FILE_SIZE_BYTES + 1),
    ).toThrow(BadRequestException);
  });
});
