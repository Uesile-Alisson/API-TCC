import { ApiPropertyOptional } from '@nestjs/swagger';
import { statusbomba, tipobomba } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const BOMBAS_ORDER_BY_FIELDS = [
  'id_bomba',
  'nome',
  'tipo_bomba',
  'status_padrao',
  'criado_em',
  'atualizado_em',
] as const;

export type BombasOrderBy = (typeof BOMBAS_ORDER_BY_FIELDS)[number];

export class QueryBombasConfiguracaoDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page deve ser um numero inteiro.' })
  @Min(1, { message: 'page deve ser maior ou igual a 1.' })
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit deve ser um numero inteiro.' })
  @Min(1, { message: 'limit deve ser maior ou igual a 1.' })
  @Max(100, { message: 'limit deve ser menor ou igual a 100.' })
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'Bomba' })
  @IsOptional()
  @IsString({ message: 'busca deve ser texto.' })
  busca?: string;

  @ApiPropertyOptional({ enum: statusbomba })
  @IsOptional()
  @IsEnum(statusbomba, { message: 'status_padrao deve ser valido.' })
  status_padrao?: statusbomba;

  @ApiPropertyOptional({ enum: tipobomba })
  @IsOptional()
  @IsEnum(tipobomba, { message: 'tipo_bomba deve ser valido.' })
  tipo_bomba?: tipobomba;

  @ApiPropertyOptional({ enum: BOMBAS_ORDER_BY_FIELDS, example: 'nome' })
  @IsOptional()
  @IsIn(BOMBAS_ORDER_BY_FIELDS, { message: 'order_by invalido.' })
  order_by?: BombasOrderBy = 'nome';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order_direction deve ser asc ou desc.' })
  order_direction?: 'asc' | 'desc' = 'asc';
}
