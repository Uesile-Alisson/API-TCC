import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { GridFsService } from '../../mongodb/gridfs.service';
import type { GridFsFileMetadataInput } from '../../mongodb/gridfs.service';
import {
  RELATORIO_GRIDFS_BUCKET_NAME,
  RELATORIO_MESSAGES,
  RELATORIO_STORAGE_PROVIDER,
} from '../constants';
import { ReportFileService } from './report-file.service';
import type {
  DeleteReportFileParams,
  DeleteReportFileResult,
  ReadReportFileParams,
  ReadReportFileResult,
  SaveReportFileParams,
  SavedReportFileResult,
} from './report-storage.interface';

const SAFE_BUCKET_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

@Injectable()
export class GridFsReportStorageService {
  constructor(
    private readonly gridFsService: GridFsService,
    private readonly reportFileService: ReportFileService,
  ) {}

  async saveReportFile(
    params: SaveReportFileParams,
  ): Promise<SavedReportFileResult> {
    const geradoEm = params.gerado_em ?? new Date();
    const preparedFile = this.reportFileService.prepareReportFile({
      buffer: params.buffer,
      tipo_relatorio: params.tipo_relatorio,
      formato_relatorio: params.formato_relatorio,
      id_processo: params.id_processo,
      id_alarme: params.id_alarme,
      filename: params.filename,
      generatedAt: geradoEm,
    });
    const metadata: GridFsFileMetadataInput = {
      id_usuario: params.id_usuario,
      id_processo: params.id_processo ?? null,
      id_alarme: params.id_alarme ?? null,
      tipo_relatorio: params.tipo_relatorio,
      formato_relatorio: params.formato_relatorio,
      hash_arquivo: params.metadata?.hash_arquivo ?? preparedFile.hash_arquivo,
      sistema: params.metadata?.sistema ?? 'TSEA',
      gerado_em: geradoEm,
      origem: params.metadata?.origem ?? 'RELATORIOS_MODULE',
      titulo: params.metadata?.titulo ?? null,
      descricao: params.metadata?.descricao ?? null,
      observacao: params.observacao ?? null,
    };

    try {
      const uploadResult = await this.gridFsService.uploadFile({
        filename: preparedFile.nome_arquivo,
        buffer: preparedFile.buffer,
        contentType: preparedFile.content_type,
        metadata,
        bucketName: RELATORIO_GRIDFS_BUCKET_NAME,
      });

      return {
        gridfs_file_id: uploadResult.fileId,
        nome_arquivo: preparedFile.nome_arquivo,
        content_type: preparedFile.content_type,
        bucket_name: uploadResult.bucketName,
        storage_provider: RELATORIO_STORAGE_PROVIDER,
        hash_arquivo: preparedFile.hash_arquivo,
        tamanho_bytes: preparedFile.tamanho_bytes,
        upload_date: uploadResult.uploadDate,
      };
    } catch {
      throw new InternalServerErrorException(
        RELATORIO_MESSAGES.STORAGE.UPLOAD_FAILED,
      );
    }
  }

  async readReportFile(
    params: ReadReportFileParams,
  ): Promise<ReadReportFileResult> {
    const gridfsFileId = this.normalizeRequiredString(
      params.gridfs_file_id,
      'Identificador do arquivo no GridFS é obrigatório.',
    );
    const bucketName = this.resolveBucketName(params.bucket_name);
    const downloadResult = await this.gridFsService.openDownloadStream(
      gridfsFileId,
      bucketName,
    );
    const contentType =
      this.normalizeOptionalString(params.content_type) ??
      downloadResult.file.contentType;

    if (!contentType) {
      throw new InternalServerErrorException(
        RELATORIO_MESSAGES.STORAGE.INVALID_CONTENT_TYPE,
      );
    }

    return {
      stream: downloadResult.stream,
      nome_arquivo: this.normalizeRequiredString(
        params.nome_arquivo,
        'Nome do arquivo é obrigatório.',
      ),
      content_type: contentType,
      content_length: params.tamanho_bytes ?? downloadResult.file.length,
      bucket_name: bucketName,
    };
  }

  async fileExists(
    gridfsFileId: string,
    bucketName?: string | null,
  ): Promise<boolean> {
    return this.gridFsService.fileExists(
      gridfsFileId,
      this.resolveBucketName(bucketName),
    );
  }

  async deleteReportFile(
    params: DeleteReportFileParams,
  ): Promise<DeleteReportFileResult> {
    const gridfsFileId = this.normalizeRequiredString(
      params.gridfs_file_id,
      'Identificador do arquivo no GridFS é obrigatório.',
    );
    const bucketName = this.resolveBucketName(params.bucket_name);
    const result = await this.gridFsService.deleteFile(
      gridfsFileId,
      bucketName,
    );

    return {
      deleted: result.deleted,
      gridfs_file_id: result.fileId,
      bucket_name: result.bucketName,
    };
  }

  buildDownloadDisposition(filename: string): string {
    return this.reportFileService.buildContentDisposition({
      filename,
      disposition: 'attachment',
    });
  }

  buildPreviewDisposition(filename: string): string {
    return this.reportFileService.buildContentDisposition({
      filename,
      disposition: 'inline',
    });
  }

  private resolveBucketName(bucketName?: string | null): string {
    const normalizedBucketName =
      bucketName?.trim() || RELATORIO_GRIDFS_BUCKET_NAME;

    if (!SAFE_BUCKET_NAME_REGEX.test(normalizedBucketName)) {
      throw new BadRequestException('Nome de bucket inválido.');
    }

    return normalizedBucketName;
  }

  private normalizeRequiredString(value: string, message: string): string {
    const normalizedValue = value?.trim();

    if (!normalizedValue) {
      throw new BadRequestException(message);
    }

    return normalizedValue;
  }

  private normalizeOptionalString(value: string | null): string | null {
    const normalizedValue = value?.trim();

    return normalizedValue || null;
  }
}
