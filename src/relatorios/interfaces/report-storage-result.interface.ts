import type { formatorelatorio, tiporelatorio } from '@prisma/client';

export type ReportStorageProvider = 'GRIDFS';

export interface ReportStorageResult {
  gridfs_file_id: string;
  filename: string;
  content_type: string;
  bucket_name: string;
  storage_provider: ReportStorageProvider;
  size_bytes: number;
  upload_date: Date;
  hash_arquivo: string;
}

export interface ReportStorageMetadata {
  id_relatorio?: number | null;
  id_processo?: number | null;
  id_alarme?: number | null;
  id_usuario: number;
  tipo_relatorio: tiporelatorio;
  formato_relatorio: formatorelatorio;
  hash_arquivo: string;
  sistema: 'TSEA';
  gerado_em: Date;
}
