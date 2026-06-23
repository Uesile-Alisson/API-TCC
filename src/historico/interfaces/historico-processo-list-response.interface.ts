import type { HistoricoProcessoListItem } from './historico-processo-list-item.interface';
import type { PaginationMeta } from './pagination-meta.interface';

export interface HistoricoProcessoListResponse {
  data: HistoricoProcessoListItem[];
  meta: PaginationMeta;
}
