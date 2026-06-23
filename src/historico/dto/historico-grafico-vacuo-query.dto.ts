import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const ORDER_DIRECTIONS = ['asc', 'desc'] as const;

type OrderDirection = (typeof ORDER_DIRECTIONS)[number];

export class HistoricoGraficoVacuoQueryDto {
  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Data inicial das leituras historicas de vacuo.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_inicio deve ser uma data valida.' })
  data_inicio?: Date;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.999Z',
    description: 'Data final das leituras historicas de vacuo.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_fim deve ser uma data valida.' })
  data_fim?: Date;

  @ApiPropertyOptional({
    example: 1,
    description: 'Filtra pontos historicos por tanque.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_tanque deve ser um numero inteiro.' })
  @Min(1, { message: 'id_tanque deve ser maior ou igual a 1.' })
  id_tanque?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Filtra pontos historicos por sensor.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_sensor deve ser um numero inteiro.' })
  @Min(1, { message: 'id_sensor deve ser maior ou igual a 1.' })
  id_sensor?: number;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Limite maximo de pontos retornados no grafico.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite_pontos deve ser um numero inteiro.' })
  @Min(1, { message: 'limite_pontos deve ser maior ou igual a 1.' })
  @Max(5000, { message: 'limite_pontos deve ser menor ou igual a 5000.' })
  limite_pontos?: number;

  @ApiPropertyOptional({
    enum: ORDER_DIRECTIONS,
    example: 'asc',
  })
  @IsOptional()
  @IsIn(ORDER_DIRECTIONS, {
    message: 'order_direction deve ser asc ou desc.',
  })
  order_direction?: OrderDirection;

  // No repository, leituras devem ser filtradas via leiturasensores -> processostanquessensores -> processostanques -> processos.
}
