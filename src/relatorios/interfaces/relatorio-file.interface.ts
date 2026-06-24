import type { Buffer } from 'node:buffer';

export type RelatorioFileExtension = 'pdf' | 'xlsx';

export type RelatorioMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface GeneratedReportFile {
  buffer: Buffer;
  filename: string;
  extension: RelatorioFileExtension;
  mime_type: RelatorioMimeType;
  size_bytes: number;
  hash_arquivo: string;
}

export interface GeneratedReportFileDescriptor {
  filename: string;
  extension: RelatorioFileExtension;
  mime_type: RelatorioMimeType;
  size_bytes: number;
  hash_arquivo: string;
}
