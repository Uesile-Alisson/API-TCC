import { LeituraResponse } from './leitura-response.interface';
import { PaginationMeta } from './pagination-meta.interface';

export interface LeituraListResponse {
  data: LeituraResponse[];
  meta: PaginationMeta;
}
