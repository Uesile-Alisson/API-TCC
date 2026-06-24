export const RELATORIO_STORAGE_PROVIDER = 'GRIDFS' as const;

export const RELATORIO_GRIDFS_BUCKET_NAME = 'relatorios' as const;

export const RELATORIO_GRIDFS_COLLECTIONS = {
  FILES: 'relatorios.files',
  CHUNKS: 'relatorios.chunks',
} as const;

export const RELATORIO_GRIDFS_DEFAULT_METADATA_SYSTEM = 'TSEA' as const;

export const RELATORIO_STORAGE_FIELDS = {
  GRIDFS_FILE_ID: 'gridfs_file_id',
  CONTENT_TYPE: 'content_type',
  BUCKET_NAME: 'bucket_name',
  STORAGE_PROVIDER: 'storage_provider',
} as const;

// Campos internos de storage não devem ser expostos em respostas públicas.
export const RELATORIO_STORAGE_INTERNAL_FIELDS = [
  'gridfs_file_id',
  'bucket_name',
  'storage_provider',
  'hash_arquivo',
] as const;

export const RELATORIO_GRIDFS_UPLOAD_TIMEOUT_MS = 30000 as const;

export const RELATORIO_GRIDFS_DOWNLOAD_TIMEOUT_MS = 30000 as const;

// Limite defensivo para o MVP. Validator/storage futuro reforçará isso.
export const RELATORIO_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
