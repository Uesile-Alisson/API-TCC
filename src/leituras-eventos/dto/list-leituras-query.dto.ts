import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

const LEITURAS_ORDER_BY_OPTIONS = [
  'leitura_em',
  'recebido_em',
  'valor_vacuo',
] as const;

const ORDER_DIRECTION_OPTIONS = ['asc', 'desc'] as const;

type LeiturasOrderBy = (typeof LEITURAS_ORDER_BY_OPTIONS)[number];
type OrderDirection = (typeof ORDER_DIRECTION_OPTIONS)[number];

export class ListLeiturasQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_processo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_processo_tanque?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_processo_tanque_sensor?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  leitura_de?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  leitura_ate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  recebido_de?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  recebido_ate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valor_minimo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valor_maximo?: number;

  @IsOptional()
  @IsIn(LEITURAS_ORDER_BY_OPTIONS)
  order_by?: LeiturasOrderBy;

  @IsOptional()
  @IsIn(ORDER_DIRECTION_OPTIONS)
  order_direction?: OrderDirection;
}
