import type {
  formatorelatorio,
  severidadealarme,
  statusalarme,
  statusprocesso,
  tiporelatorio,
} from '@prisma/client';

export interface RelatorioResponse {
  id_relatorio: number;
  id_usuario: number;
  id_processo: number | null;
  id_alarme: number | null;
  tipo_relatorio: tiporelatorio;
  formato_relatorio: formatorelatorio;
  titulo: string;
  descricao: string | null;
  nome_arquivo: string;
  tamanho_bytes: number | null;
  content_type: string | null;
  gerado_em: Date;
  gerado_por: RelatorioUsuarioResumo | null;
  processo: RelatorioProcessoResumo | null;
  alarme: RelatorioAlarmeResumo | null;
  preview_disponivel: boolean;
  download_disponivel: boolean;
  possui_arquivo: boolean;
}

export interface RelatorioUsuarioResumo {
  id_usuario: number;
  nome: string;
}

export interface RelatorioProcessoResumo {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
}

export interface RelatorioAlarmeResumo {
  id_alarme: number;
  titulo: string;
  severidade: severidadealarme;
  status_alarme: statusalarme;
  ocorrido_em: Date;
}

export interface RelatorioStorageMetadata {
  gridfs_file_id: string | null;
  content_type: string | null;
  bucket_name: string | null;
  storage_provider: string | null;
  hash_arquivo: string | null;
}
