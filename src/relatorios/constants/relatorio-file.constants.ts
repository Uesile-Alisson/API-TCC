import { formatorelatorio, tiporelatorio } from '@prisma/client';

export const RELATORIO_MIME_TYPES = {
  [formatorelatorio.PDF]: 'application/pdf',
  [formatorelatorio.XLSX]:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export const RELATORIO_FILE_EXTENSIONS = {
  [formatorelatorio.PDF]: 'pdf',
  [formatorelatorio.XLSX]: 'xlsx',
} as const;

export const RELATORIO_FILE_PREFIX = 'tsea' as const;

export const RELATORIO_FILENAME_TYPE_SEGMENTS = {
  [tiporelatorio.PROCESSO]: 'processo',
  [tiporelatorio.ALARME]: 'alarme',
} as const;

export const RELATORIO_FILENAME_SEPARATOR = '-' as const;

export const RELATORIO_SAFE_FILENAME_REGEX = /^[a-zA-Z0-9._-]+$/;

export const RELATORIO_CONTENT_DISPOSITION = {
  INLINE: 'inline',
  ATTACHMENT: 'attachment',
} as const;

export const RELATORIO_FILE_HEADER_NAMES = {
  CONTENT_TYPE: 'Content-Type',
  CONTENT_LENGTH: 'Content-Length',
  CONTENT_DISPOSITION: 'Content-Disposition',
} as const;

export const RELATORIO_HASH_ALGORITHM = 'sha256' as const;

export const RELATORIO_PDF_EXTENSION = 'pdf' as const;

export const RELATORIO_XLSX_EXTENSION = 'xlsx' as const;
