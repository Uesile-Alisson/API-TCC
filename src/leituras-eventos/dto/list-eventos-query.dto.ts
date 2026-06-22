import {
  origemevento,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

const EVENTOS_ORDER_BY_OPTIONS = [
  'ocorrido_em',
  'tipo_evento',
  'severidade_evento',
] as const;

const ORDER_DIRECTION_OPTIONS = ['asc', 'desc'] as const;

type EventosOrderBy = (typeof EVENTOS_ORDER_BY_OPTIONS)[number];
type OrderDirection = (typeof ORDER_DIRECTION_OPTIONS)[number];

export class ListEventosQueryDto {
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
  id_processo_tanque_sensor?: number;

  @IsOptional()
  @IsEnum(tipoeventoprocesso)
  tipo_evento?: tipoeventoprocesso;

  @IsOptional()
  @IsEnum(origemevento)
  origem_evento?: origemevento;

  @IsOptional()
  @IsEnum(severidadeevento)
  severidade_evento?: severidadeevento;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  ocorrido_de?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  ocorrido_ate?: Date;

  @IsOptional()
  @IsIn(EVENTOS_ORDER_BY_OPTIONS)
  order_by?: EventosOrderBy;

  @IsOptional()
  @IsIn(ORDER_DIRECTION_OPTIONS)
  order_direction?: OrderDirection;
}
