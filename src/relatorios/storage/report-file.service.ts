import { BadRequestException, Injectable } from '@nestjs/common';
import { formatorelatorio, tiporelatorio } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Buffer } from 'node:buffer';

import {
  RELATORIO_CONTENT_DISPOSITION,
  RELATORIO_FILE_EXTENSIONS,
  RELATORIO_FILE_PREFIX,
  RELATORIO_FILENAME_SEPARATOR,
  RELATORIO_FILENAME_TYPE_SEGMENTS,
  RELATORIO_HASH_ALGORITHM,
  RELATORIO_MAX_FILE_SIZE_BYTES,
  RELATORIO_MESSAGES,
  RELATORIO_MIME_TYPES,
  RELATORIO_SAFE_FILENAME_REGEX,
} from '../constants';
import type {
  BuildReportFilenameParams,
  PreparedReportFile,
  ReportContentDispositionParams,
} from './report-storage.interface';

interface PrepareReportFileParams {
  buffer: Buffer;
  tipo_relatorio: tiporelatorio;
  formato_relatorio: formatorelatorio;
  id_processo?: number | null;
  id_alarme?: number | null;
  filename?: string;
  generatedAt?: Date;
}

@Injectable()
export class ReportFileService {
  prepareReportFile(params: PrepareReportFileParams): PreparedReportFile {
    const tamanhoBytes = this.calculateSizeBytes(params.buffer);
    const contentType = this.resolveMimeType(params.formato_relatorio);
    const extension = this.resolveExtension(params.formato_relatorio);
    const nomeArquivo =
      params.filename?.trim() ||
      this.buildReportFilename({
        tipo_relatorio: params.tipo_relatorio,
        formato_relatorio: params.formato_relatorio,
        id_processo: params.id_processo,
        id_alarme: params.id_alarme,
        generatedAt: params.generatedAt,
      });

    this.assertSafeFilename(nomeArquivo);

    return {
      buffer: params.buffer,
      nome_arquivo: nomeArquivo,
      content_type: contentType,
      extension,
      hash_arquivo: this.calculateHash(params.buffer),
      tamanho_bytes: tamanhoBytes,
    };
  }

  buildReportFilename(params: BuildReportFilenameParams): string {
    const typeSegment = RELATORIO_FILENAME_TYPE_SEGMENTS[params.tipo_relatorio];
    const extension = this.resolveExtension(params.formato_relatorio);
    const timestamp = this.formatTimestampForFilename(
      params.generatedAt ?? new Date(),
    );

    if (!typeSegment) {
      throw new BadRequestException('Tipo de relatório inválido.');
    }

    const reportId =
      params.tipo_relatorio === tiporelatorio.PROCESSO
        ? this.requirePositiveId(
            params.id_processo,
            'Identificador do processo é obrigatório.',
          )
        : this.requirePositiveId(
            params.id_alarme,
            'Identificador do alarme é obrigatório.',
          );

    const filename = [
      RELATORIO_FILE_PREFIX,
      this.sanitizeFilenameSegment(typeSegment),
      String(reportId),
      'relatorio',
      this.sanitizeFilenameSegment(extension),
      timestamp,
    ].join(RELATORIO_FILENAME_SEPARATOR);
    const filenameWithExtension = `${filename}.${extension}`;

    this.assertSafeFilename(filenameWithExtension);

    return filenameWithExtension;
  }

  resolveMimeType(formato: formatorelatorio): string {
    const mimeType = RELATORIO_MIME_TYPES[formato];

    if (!mimeType) {
      throw new BadRequestException(RELATORIO_MESSAGES.FORMAT.INVALID_FORMAT);
    }

    return mimeType;
  }

  resolveExtension(formato: formatorelatorio): string {
    const extension = RELATORIO_FILE_EXTENSIONS[formato];

    if (!extension) {
      throw new BadRequestException(RELATORIO_MESSAGES.FORMAT.INVALID_FORMAT);
    }

    return extension;
  }

  calculateHash(buffer: Buffer): string {
    this.calculateSizeBytes(buffer);

    return createHash(RELATORIO_HASH_ALGORITHM).update(buffer).digest('hex');
  }

  calculateSizeBytes(buffer: Buffer): number {
    const sizeBytes = buffer?.length ?? 0;

    if (sizeBytes <= 0) {
      throw new BadRequestException('Arquivo vazio ou inválido.');
    }

    if (sizeBytes > RELATORIO_MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.STORAGE.INVALID_FILE_SIZE,
      );
    }

    return sizeBytes;
  }

  buildContentDisposition(params: ReportContentDispositionParams): string {
    const filename = params.filename.trim();

    this.assertSafeFilename(filename);

    if (
      params.disposition !== RELATORIO_CONTENT_DISPOSITION.INLINE &&
      params.disposition !== RELATORIO_CONTENT_DISPOSITION.ATTACHMENT
    ) {
      throw new BadRequestException('Disposição de arquivo inválida.');
    }

    return `${params.disposition}; filename="${filename}"`;
  }

  assertSafeFilename(filename: string): void {
    const normalizedFilename = filename?.trim();

    if (!normalizedFilename) {
      throw new BadRequestException('Nome do arquivo é obrigatório.');
    }

    if (
      normalizedFilename.includes('/') ||
      normalizedFilename.includes('\\') ||
      normalizedFilename.includes('..') ||
      normalizedFilename.includes('\n') ||
      normalizedFilename.includes('\r') ||
      normalizedFilename.includes('"') ||
      !RELATORIO_SAFE_FILENAME_REGEX.test(normalizedFilename)
    ) {
      throw new BadRequestException('Nome do arquivo inválido.');
    }
  }

  sanitizeFilenameSegment(value: string): string {
    const sanitized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, RELATORIO_FILENAME_SEPARATOR)
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/-+/g, RELATORIO_FILENAME_SEPARATOR)
      .replace(/^[._-]+|[._-]+$/g, '');

    return sanitized || 'arquivo';
  }

  formatTimestampForFilename(date: Date): string {
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Data de geração inválida.');
    }

    const year = date.getFullYear();
    const month = this.padDatePart(date.getMonth() + 1);
    const day = this.padDatePart(date.getDate());
    const hours = this.padDatePart(date.getHours());
    const minutes = this.padDatePart(date.getMinutes());
    const seconds = this.padDatePart(date.getSeconds());

    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }

  private requirePositiveId(
    value: number | null | undefined,
    message: string,
  ): number {
    if (!Number.isInteger(value) || Number(value) <= 0) {
      throw new BadRequestException(message);
    }

    return Number(value);
  }

  private padDatePart(value: number): string {
    return String(value).padStart(2, '0');
  }
}
