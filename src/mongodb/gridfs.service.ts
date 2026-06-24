import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { Buffer } from 'node:buffer';
import type { Readable } from 'node:stream';
import { GridFSBucket, ObjectId } from 'mongodb';
import type { GridFSBucketWriteStream } from 'mongodb';
import { MongoDbService } from './mongodb.service';

const DEFAULT_BUCKET_NAME = 'relatorios';
const DEFAULT_UPLOAD_TIMEOUT_MS = 30000;
const SAFE_BUCKET_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
type GridFsMetadataValue = string | number | boolean | Date | null | undefined;

export interface GridFsFileMetadataInput {
  id_relatorio?: number | null;
  id_processo?: number | null;
  id_alarme?: number | null;
  id_usuario?: number | null;
  tipo_relatorio?: string | null;
  formato_relatorio?: string | null;
  hash_arquivo?: string | null;
  sistema?: string;
  gerado_em?: Date;
  [key: string]: GridFsMetadataValue;
}

export interface GridFsUploadFileParams {
  filename: string;
  buffer: Buffer;
  contentType: string;
  metadata?: GridFsFileMetadataInput;
  bucketName?: string;
}

export interface GridFsUploadResult {
  fileId: string;
  filename: string;
  contentType: string;
  bucketName: string;
  length: number;
  uploadDate: Date;
}

export interface GridFsStoredFile {
  fileId: string;
  filename: string;
  contentType: string | null;
  bucketName: string;
  length: number;
  uploadDate: Date | null;
  metadata: GridFsFileMetadataInput | null;
}

export interface GridFsDownloadStreamResult {
  stream: Readable;
  file: GridFsStoredFile;
}

export interface GridFsDeleteResult {
  deleted: boolean;
  fileId: string;
  bucketName: string;
}

interface MongoGridFsFileMetadata extends GridFsFileMetadataInput {
  contentType?: string | null;
}

interface MongoGridFsFileLike {
  [key: string]: unknown;
  _id: ObjectId;
  length: number;
  chunkSize?: number;
  uploadDate?: Date;
  filename: string;
  contentType?: string;
  metadata?: MongoGridFsFileMetadata;
}

@Injectable()
export class GridFsService {
  constructor(private readonly mongoDbService: MongoDbService) {}

  async uploadFile(
    params: GridFsUploadFileParams,
  ): Promise<GridFsUploadResult> {
    const filename = this.normalizeRequiredString(
      params.filename,
      'Nome do arquivo é obrigatório.',
    );
    const contentType = this.normalizeRequiredString(
      params.contentType,
      'Tipo de conteúdo é obrigatório.',
    );

    if (!params.buffer || params.buffer.length === 0) {
      throw new BadRequestException('Arquivo vazio ou inválido.');
    }

    const bucketName = this.normalizeBucketName(params.bucketName);
    const bucket = this.getBucket(bucketName);
    const metadata = this.cleanMetadata({
      ...params.metadata,
      contentType,
    });
    const uploadStream = bucket.openUploadStream(filename, {
      metadata,
    });
    const fileId = uploadStream.id.toString();

    try {
      await this.writeBufferToUploadStream(uploadStream, params.buffer);
    } catch {
      throw new InternalServerErrorException(
        'Falha ao salvar arquivo no GridFS.',
      );
    }

    const storedFile = await this.findFileById(fileId, bucketName);

    if (!storedFile) {
      throw new InternalServerErrorException(
        'Arquivo salvo, mas metadados do GridFS não foram encontrados.',
      );
    }

    return {
      fileId,
      filename: storedFile.filename,
      contentType: storedFile.contentType ?? contentType,
      bucketName,
      length: storedFile.length,
      uploadDate: storedFile.uploadDate ?? new Date(),
    };
  }

  async openDownloadStream(
    fileId: string,
    bucketName?: string,
  ): Promise<GridFsDownloadStreamResult> {
    const normalizedBucketName = this.normalizeBucketName(bucketName);
    const objectId = this.toObjectId(fileId);
    const file = await this.findFileById(fileId, normalizedBucketName);

    if (!file) {
      throw new NotFoundException('Arquivo não encontrado no GridFS.');
    }

    return {
      stream: this.getBucket(normalizedBucketName).openDownloadStream(objectId),
      file,
    };
  }

  async findFileById(
    fileId: string,
    bucketName?: string,
  ): Promise<GridFsStoredFile | null> {
    const objectId = this.toObjectId(fileId);
    const normalizedBucketName = this.normalizeBucketName(bucketName);
    const file = await this.mongoDbService
      .getDatabase()
      .collection<MongoGridFsFileLike>(`${normalizedBucketName}.files`)
      .findOne({ _id: objectId });

    return file ? this.mapGridFsFile(file, normalizedBucketName) : null;
  }

  async fileExists(fileId: string, bucketName?: string): Promise<boolean> {
    try {
      return (await this.findFileById(fileId, bucketName)) !== null;
    } catch (error) {
      if (error instanceof BadRequestException) {
        return false;
      }

      throw error;
    }
  }

  async deleteFile(
    fileId: string,
    bucketName?: string,
  ): Promise<GridFsDeleteResult> {
    const normalizedBucketName = this.normalizeBucketName(bucketName);
    const objectId = this.toObjectId(fileId);
    const file = await this.findFileById(fileId, normalizedBucketName);

    if (!file) {
      return {
        deleted: false,
        fileId,
        bucketName: normalizedBucketName,
      };
    }

    try {
      await this.getBucket(normalizedBucketName).delete(objectId);
    } catch {
      throw new InternalServerErrorException(
        'Falha ao remover arquivo do GridFS.',
      );
    }

    return {
      deleted: true,
      fileId,
      bucketName: normalizedBucketName,
    };
  }

  getBucket(bucketName?: string): GridFSBucket {
    return new GridFSBucket(this.mongoDbService.getDatabase(), {
      bucketName: this.normalizeBucketName(bucketName),
    });
  }

  normalizeBucketName(bucketName?: string | null): string {
    const normalized = bucketName?.trim() || DEFAULT_BUCKET_NAME;

    if (!SAFE_BUCKET_NAME_REGEX.test(normalized)) {
      throw new BadRequestException('Nome de bucket inválido.');
    }

    return normalized;
  }

  toObjectId(fileId: string): ObjectId {
    const normalizedFileId = this.normalizeRequiredString(
      fileId,
      'Identificador de arquivo é obrigatório.',
    );

    if (!ObjectId.isValid(normalizedFileId)) {
      throw new BadRequestException('Identificador de arquivo inválido.');
    }

    const objectId = new ObjectId(normalizedFileId);

    if (objectId.toHexString() !== normalizedFileId.toLowerCase()) {
      throw new BadRequestException('Identificador de arquivo inválido.');
    }

    return objectId;
  }

  mapGridFsFile(
    file: MongoGridFsFileLike,
    bucketName: string,
  ): GridFsStoredFile {
    const metadata = this.cleanMetadata(file.metadata) ?? null;
    const metadataContentType =
      typeof file.metadata?.contentType === 'string'
        ? file.metadata.contentType
        : null;

    return {
      fileId: file._id.toString(),
      filename: file.filename,
      contentType: file.contentType ?? metadataContentType,
      bucketName,
      length: file.length,
      uploadDate: file.uploadDate ?? null,
      metadata,
    };
  }

  private normalizeRequiredString(value: string, message: string): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw new BadRequestException(message);
    }

    return normalized;
  }

  private cleanMetadata(
    metadata?: GridFsFileMetadataInput,
  ): GridFsFileMetadataInput | undefined {
    if (!metadata) {
      return undefined;
    }

    const cleanedMetadata: GridFsFileMetadataInput = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined) {
        cleanedMetadata[key] = value;
      }
    }

    return Object.keys(cleanedMetadata).length > 0
      ? cleanedMetadata
      : undefined;
  }

  private writeBufferToUploadStream(
    uploadStream: GridFSBucketWriteStream,
    buffer: Buffer,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        uploadStream.destroy(new Error('Tempo limite de upload excedido.'));
      }, DEFAULT_UPLOAD_TIMEOUT_MS);

      const cleanup = () => {
        clearTimeout(timeout);
        uploadStream.removeAllListeners('error');
        uploadStream.removeAllListeners('finish');
      };

      uploadStream.once('error', (error: Error) => {
        cleanup();
        reject(error);
      });

      uploadStream.once('finish', () => {
        cleanup();
        resolve();
      });

      uploadStream.end(buffer);
    });
  }
}
