import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { formatorelatorio } from '@prisma/client';

import {
  RELATORIO_MAX_FILE_SIZE_BYTES,
  RELATORIO_MESSAGES,
  RELATORIO_MIME_TYPES,
  RELATORIO_STORAGE_PROVIDER,
} from '../constants';
import type { RelatorioFileMetadataRecord } from '../repositories';

export interface ValidateGeneratedFileParams {
  bufferSize: number;
  contentType: string;
  formato: formatorelatorio;
  filename: string;
}

export interface ValidateContentTypeForFormatParams {
  contentType: string | null | undefined;
  formato: formatorelatorio;
}

const GRIDFS_FILE_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

@Injectable()
export class RelatorioFileValidator {
  validateFileMetadata(record: RelatorioFileMetadataRecord | null): void {
    const metadata = this.getFileMetadata(record);

    this.validateGridFsFileId(metadata.gridfs_file_id);
    this.validateFilename(metadata.nome_arquivo);
    this.validateRequiredContentType(metadata.content_type);
    this.validateRequiredBucketName(metadata.bucket_name);
    this.validateStorageProvider(metadata.storage_provider);
    this.validateFileSize(metadata.tamanho_bytes);
  }

  validatePreviewMetadata(record: RelatorioFileMetadataRecord | null): void {
    const metadata = this.getFileMetadata(record);

    this.validateFileMetadata(metadata);
    this.validateContentTypeForFormat({
      contentType: metadata.content_type,
      formato: metadata.formato_relatorio,
    });
  }

  validateDownloadMetadata(record: RelatorioFileMetadataRecord | null): void {
    const metadata = this.getFileMetadata(record);

    this.validateFileMetadata(metadata);
    this.validateStoredContentTypeForFormat({
      contentType: metadata.content_type,
      formato: metadata.formato_relatorio,
    });
  }

  validateGeneratedFile(params: ValidateGeneratedFileParams): void {
    if (
      !Number.isFinite(params.bufferSize) ||
      params.bufferSize <= 0 ||
      params.bufferSize > RELATORIO_MAX_FILE_SIZE_BYTES
    ) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.STORAGE.INVALID_FILE_SIZE,
      );
    }

    this.validateContentTypeForFormat({
      contentType: params.contentType,
      formato: params.formato,
    });
    this.validateFilename(params.filename);
  }

  validateContentTypeForFormat(
    params: ValidateContentTypeForFormatParams,
  ): void {
    const expectedContentType = this.getExpectedContentType(params.formato);
    const normalizedContentType = params.contentType?.trim();

    if (
      !normalizedContentType ||
      normalizedContentType !== expectedContentType
    ) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.STORAGE.INVALID_CONTENT_TYPE,
      );
    }
  }

  validateStorageProvider(storageProvider: string | null | undefined): void {
    if (storageProvider?.trim() !== RELATORIO_STORAGE_PROVIDER) {
      throw new InternalServerErrorException(
        RELATORIO_MESSAGES.STORAGE.INVALID_CONTENT_TYPE,
      );
    }
  }

  validateGridFsFileId(gridfsFileId: string | null | undefined): void {
    const normalized = gridfsFileId?.trim();

    if (!normalized || !GRIDFS_FILE_ID_PATTERN.test(normalized)) {
      throw new NotFoundException(RELATORIO_MESSAGES.STORAGE.FILE_NOT_FOUND);
    }
  }

  validateFilename(filename: string | null | undefined): void {
    const normalized = filename?.trim();

    if (!normalized) {
      throw new BadRequestException('Nome de arquivo invalido.');
    }

    if (
      normalized.includes('/') ||
      normalized.includes('\\') ||
      normalized.includes('..') ||
      normalized.includes('\n') ||
      normalized.includes('\r')
    ) {
      throw new BadRequestException('Nome de arquivo invalido.');
    }

    const lowerFilename = normalized.toLowerCase();

    if (!lowerFilename.endsWith('.pdf') && !lowerFilename.endsWith('.xlsx')) {
      throw new BadRequestException('Nome de arquivo invalido.');
    }
  }

  validateFileSize(sizeBytes: number | bigint | null | undefined): void {
    if (sizeBytes === null || sizeBytes === undefined) {
      return;
    }

    const normalizedSize =
      typeof sizeBytes === 'bigint' ? Number(sizeBytes) : sizeBytes;

    if (
      !Number.isFinite(normalizedSize) ||
      normalizedSize <= 0 ||
      normalizedSize > RELATORIO_MAX_FILE_SIZE_BYTES
    ) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.STORAGE.INVALID_FILE_SIZE,
      );
    }
  }

  private validateRequiredContentType(
    contentType: string | null | undefined,
  ): void {
    if (!contentType?.trim()) {
      throw new InternalServerErrorException(
        RELATORIO_MESSAGES.STORAGE.INVALID_CONTENT_TYPE,
      );
    }
  }

  private validateRequiredBucketName(
    bucketName: string | null | undefined,
  ): void {
    if (!bucketName?.trim()) {
      throw new InternalServerErrorException(
        RELATORIO_MESSAGES.STORAGE.FILE_NOT_FOUND,
      );
    }
  }

  private validateStoredContentTypeForFormat(
    params: ValidateContentTypeForFormatParams,
  ): void {
    const expectedContentType = this.getExpectedContentType(params.formato);
    const normalizedContentType = params.contentType?.trim();

    if (
      !normalizedContentType ||
      normalizedContentType !== expectedContentType
    ) {
      throw new InternalServerErrorException(
        RELATORIO_MESSAGES.STORAGE.INVALID_CONTENT_TYPE,
      );
    }
  }

  private getExpectedContentType(formato: formatorelatorio): string {
    if (formato !== formatorelatorio.PDF && formato !== formatorelatorio.XLSX) {
      throw new BadRequestException(RELATORIO_MESSAGES.FORMAT.INVALID_FORMAT);
    }

    return RELATORIO_MIME_TYPES[formato];
  }

  private getFileMetadata(
    record: RelatorioFileMetadataRecord | null,
  ): RelatorioFileMetadataRecord {
    if (!record) {
      throw new NotFoundException(RELATORIO_MESSAGES.STORAGE.FILE_NOT_FOUND);
    }

    return record;
  }
}
