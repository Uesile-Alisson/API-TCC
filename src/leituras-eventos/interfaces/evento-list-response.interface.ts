import { EventoResponse } from './evento-response.interface';
import { PaginationMeta } from './pagination-meta.interface';

export interface EventoListResponse {
  data: EventoResponse[];
  meta: PaginationMeta;
}
