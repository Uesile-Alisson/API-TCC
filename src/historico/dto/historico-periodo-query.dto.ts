import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';

const HISTORICO_CAMPOS_DATA = [
  'criado_em',
  'iniciado_em',
  'finalizado_em',
] as const;

const HISTORICO_AGRUPAMENTOS = ['DIA', 'SEMANA', 'MES'] as const;

type HistoricoCampoData = (typeof HISTORICO_CAMPOS_DATA)[number];
type HistoricoAgrupamento = (typeof HISTORICO_AGRUPAMENTOS)[number];

export class HistoricoPeriodoQueryDto {
  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Data inicial do periodo historico.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_inicio deve ser uma data valida.' })
  data_inicio?: Date;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.999Z',
    description: 'Data final do periodo historico.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_fim deve ser uma data valida.' })
  data_fim?: Date;

  @ApiPropertyOptional({
    enum: HISTORICO_CAMPOS_DATA,
    example: 'finalizado_em',
  })
  @IsOptional()
  @IsIn(HISTORICO_CAMPOS_DATA, {
    message: 'campo_data deve ser criado_em, iniciado_em ou finalizado_em.',
  })
  campo_data?: HistoricoCampoData;

  @ApiPropertyOptional({
    enum: HISTORICO_AGRUPAMENTOS,
    example: 'DIA',
  })
  @IsOptional()
  @IsIn(HISTORICO_AGRUPAMENTOS, {
    message: 'agrupamento deve ser DIA, SEMANA ou MES.',
  })
  agrupamento?: HistoricoAgrupamento;
}
