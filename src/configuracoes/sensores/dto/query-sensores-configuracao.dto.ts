import { ApiPropertyOptional } from '@nestjs/swagger';
import { statussensor, tiposensor } from '@prisma/client';
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

export const SENSORES_ORDER_BY_FIELDS = [
  'id_sensor',
  'nome',
  'modelo',
  'protocolo',
  'unidade_medida',
  'status_sensor',
  'tipo_sensor',
  'criado_em',
] as const;

export type SensoresOrderBy = (typeof SENSORES_ORDER_BY_FIELDS)[number];

export class QuerySensoresConfiguracaoDto {
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

  @ApiPropertyOptional({ example: 'Vacuo' })
  @IsOptional()
  @IsString({ message: 'busca deve ser texto.' })
  busca?: string;

  @ApiPropertyOptional({ enum: statussensor })
  @IsOptional()
  @IsEnum(statussensor, { message: 'status_sensor deve ser valido.' })
  status_sensor?: statussensor;

  @ApiPropertyOptional({ enum: tiposensor })
  @IsOptional()
  @IsEnum(tiposensor, { message: 'tipo_sensor deve ser valido.' })
  tipo_sensor?: tiposensor;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_tanque deve ser um numero inteiro.' })
  @Min(1, { message: 'id_tanque deve ser maior ou igual a 1.' })
  id_tanque?: number;

  @ApiPropertyOptional({ enum: SENSORES_ORDER_BY_FIELDS, example: 'nome' })
  @IsOptional()
  @IsIn(SENSORES_ORDER_BY_FIELDS, { message: 'order_by invalido.' })
  order_by?: SensoresOrderBy = 'nome';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], example: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order_direction deve ser asc ou desc.' })
  order_direction?: 'asc' | 'desc' = 'asc';
}
