import { ApiPropertyOptional } from '@nestjs/swagger';
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

const ORDER_DIRECTIONS = ['asc', 'desc'] as const;

type OrderDirection = (typeof ORDER_DIRECTIONS)[number];

export class HistoricoProcessoEventosQueryDto {
  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Pagina atual da listagem historica de eventos.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page deve ser um numero inteiro.' })
  @Min(1, { message: 'page deve ser maior ou igual a 1.' })
  page?: number;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Quantidade de eventos historicos por pagina.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit deve ser um numero inteiro.' })
  @Min(1, { message: 'limit deve ser maior ou igual a 1.' })
  @Max(100, { message: 'limit deve ser menor ou igual a 100.' })
  limit?: number;

  @ApiPropertyOptional({
    enum: severidadeevento,
    example: severidadeevento.INFO,
  })
  @IsOptional()
  @IsEnum(severidadeevento, {
    message: 'A severidade_evento informada e invalida.',
  })
  severidade_evento?: severidadeevento;

  @ApiPropertyOptional({
    enum: tipoeventoprocesso,
    example: tipoeventoprocesso.PROCESSO_CONCLUIDO,
  })
  @IsOptional()
  @IsEnum(tipoeventoprocesso, {
    message: 'O tipo_evento informado e invalido.',
  })
  tipo_evento?: tipoeventoprocesso;

  @ApiPropertyOptional({
    enum: origemevento,
    example: origemevento.SISTEMA,
  })
  @IsOptional()
  @IsEnum(origemevento, {
    message: 'A origem_evento informada e invalida.',
  })
  origem_evento?: origemevento;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Data inicial dos eventos historicos.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_inicio deve ser uma data valida.' })
  data_inicio?: Date;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.999Z',
    description: 'Data final dos eventos historicos.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_fim deve ser uma data valida.' })
  data_fim?: Date;

  @ApiPropertyOptional({
    enum: ORDER_DIRECTIONS,
    example: 'desc',
  })
  @IsOptional()
  @IsIn(ORDER_DIRECTIONS, {
    message: 'order_direction deve ser asc ou desc.',
  })
  order_direction?: OrderDirection;
}
