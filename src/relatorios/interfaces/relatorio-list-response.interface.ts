import type { PaginationMeta } from './pagination-meta.interface';
import type { RelatorioResponse } from './relatorio-response.interface';

export interface RelatorioListResponse {
  data: RelatorioResponse[];
  meta: PaginationMeta;
}
