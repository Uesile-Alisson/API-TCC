import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
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

export class HistoricoProcessoAlarmesQueryDto {
  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Pagina atual da listagem historica de alarmes.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page deve ser um numero inteiro.' })
  @Min(1, { message: 'page deve ser maior ou igual a 1.' })
  page?: number;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Quantidade de alarmes historicos por pagina.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit deve ser um numero inteiro.' })
  @Min(1, { message: 'limit deve ser maior ou igual a 1.' })
  @Max(100, { message: 'limit deve ser menor ou igual a 100.' })
  limit?: number;

  @ApiPropertyOptional({
    enum: severidadealarme,
    example: severidadealarme.CRITICO,
  })
  @IsOptional()
  @IsEnum(severidadealarme, {
    message: 'A severidade informada e invalida.',
  })
  severidade?: severidadealarme;

  @ApiPropertyOptional({
    enum: statusalarme,
    example: statusalarme.ATIVO,
  })
  @IsOptional()
  @IsEnum(statusalarme, {
    message: 'O status_alarme informado e invalido.',
  })
  status_alarme?: statusalarme;

  @ApiPropertyOptional({
    enum: tipoalarme,
    example: tipoalarme.PROCESSO,
  })
  @IsOptional()
  @IsEnum(tipoalarme, {
    message: 'O tipo_alarme informado e invalido.',
  })
  tipo_alarme?: tipoalarme;

  @ApiPropertyOptional({
    enum: origemalarme,
    example: origemalarme.SISTEMA,
  })
  @IsOptional()
  @IsEnum(origemalarme, {
    message: 'A origem_alarme informada e invalida.',
  })
  origem_alarme?: origemalarme;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Data inicial dos alarmes historicos.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_inicio deve ser uma data valida.' })
  data_inicio?: Date;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.999Z',
    description: 'Data final dos alarmes historicos.',
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
