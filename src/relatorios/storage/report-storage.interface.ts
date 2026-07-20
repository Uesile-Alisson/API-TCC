import type { formatorelatorio, tiporelatorio } from '@prisma/client';
import type { Buffer } from 'node:buffer';
import type { Readable } from 'node:stream';

export interface SaveReportFileParams {
  buffer: Buffer;
  tipo_relatorio: tiporelatorio;
  formato_relatorio: formatorelatorio;
  id_usuario: number;
  id_processo?: number | null;
  id_alarme?: number | null;
  filename?: string;
  observacao?: string | null;
  gerado_em?: Date;
  metadata?: SaveReportFileMetadata;
}

export interface SaveReportFileMetadata {
  titulo?: string | null;
  descricao?: string | null;
  hash_arquivo?: string | null;
  sistema?: string;
  origem?: 'RELATORIOS_MODULE';
}

export interface SavedReportFileResult {
  gridfs_file_id: string;
  nome_arquivo: string;
  content_type: string;
  bucket_name: string;
  storage_provider: 'GRIDFS';
  hash_arquivo: string;
  tamanho_bytes: number;
  upload_date: Date;
}

export interface ReadReportFileParams {
  gridfs_file_id: string;
  nome_arquivo: string;
  content_type: string | null;
  bucket_name?: string | null;
  tamanho_bytes?: number | null;
}

export interface ReadReportFileResult {
  stream: Readable;
  nome_arquivo: string;
  content_type: string;
  content_length: number | null;
  bucket_name: string;
}

export interface DeleteReportFileParams {
  gridfs_file_id: string;
  bucket_name?: string | null;
}

export interface DeleteReportFileResult {
  deleted: boolean;
  gridfs_file_id: string;
  bucket_name: string;
}

export interface StoredReportFileCandidate {
  gridfs_file_id: string;
  bucket_name: string;
  upload_date: Date | null;
}

export interface BuildReportFilenameParams {
  tipo_relatorio: tiporelatorio;
  formato_relatorio: formatorelatorio;
  id_processo?: number | null;
  id_alarme?: number | null;
  generatedAt?: Date;
}

export interface PreparedReportFile {
  buffer: Buffer;
  nome_arquivo: string;
  content_type: string;
  extension: string;
  hash_arquivo: string;
  tamanho_bytes: number;
}

export type ReportFileDisposition = 'inline' | 'attachment';

export interface ReportContentDispositionParams {
  filename: string;
  disposition: ReportFileDisposition;
}
