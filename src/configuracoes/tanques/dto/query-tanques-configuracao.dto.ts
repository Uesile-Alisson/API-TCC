import { ApiPropertyOptional } from '@nestjs/swagger';
import { statustanque } from '@prisma/client';
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

export const TANQUES_ORDER_BY_FIELDS = [
  'id_tanque',
  'nome',
  'volume',
  'vacuo_padrao',
  'status_tanque',
  'criado_em',
  'atualizado_em',
] as const;

export type TanquesOrderBy = (typeof TANQUES_ORDER_BY_FIELDS)[number];

export class QueryTanquesConfiguracaoDto {
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

  @ApiPropertyOptional({ example: 'Tanque' })
  @IsOptional()
  @IsString({ message: 'busca deve ser texto.' })
  busca?: string;

  @ApiPropertyOptional({ enum: statustanque })
  @IsOptional()
  @IsEnum(statustanque, { message: 'status_tanque deve ser valido.' })
  status_tanque?: statustanque;

  @ApiPropertyOptional({ enum: TANQUES_ORDER_BY_FIELDS, example: 'nome' })
  @IsOptional()
  @IsIn(TANQUES_ORDER_BY_FIELDS, { message: 'order_by invalido.' })
  order_by?: TanquesOrderBy = 'nome';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order_direction deve ser asc ou desc.' })
  order_direction?: 'asc' | 'desc' = 'asc';
}
