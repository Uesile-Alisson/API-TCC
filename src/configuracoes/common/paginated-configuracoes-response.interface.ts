import { ApiProperty } from '@nestjs/swagger';

export interface ConfiguracoesPaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export class ConfiguracoesPaginationMetaDto
  implements ConfiguracoesPaginationMeta
{
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  total_pages!: number;
}

export interface PaginatedConfiguracoesResponse<TItem> {
  data: TItem[];
  meta: ConfiguracoesPaginationMeta;
}
