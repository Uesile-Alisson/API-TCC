export interface ConfiguracoesPaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedConfiguracoesResponse<TItem> {
  data: TItem[];
  meta: ConfiguracoesPaginationMeta;
}
