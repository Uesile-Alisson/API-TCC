import type { AlarmeResponse } from './alarme-response.interface';

export interface AlarmePaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
}

export interface AlarmeListResponse {
  data: AlarmeResponse[];
  meta: AlarmePaginationMeta;
}
