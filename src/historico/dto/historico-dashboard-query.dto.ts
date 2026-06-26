import { ApiPropertyOptional } from '@nestjs/swagger';
import { statusprocesso } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

const HISTORICO_STATUS_PROCESSO = Object.values(statusprocesso);

const HISTORICO_CAMPOS_DATA = [
  'criado_em',
  'iniciado_em',
  'finalizado_em',
] as const;

const HISTORICO_AGRUPAMENTOS = ['DIA', 'SEMANA', 'MES'] as const;

type HistoricoCampoData = (typeof HISTORICO_CAMPOS_DATA)[number];
type HistoricoAgrupamento = (typeof HISTORICO_AGRUPAMENTOS)[number];

const toOptionalBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
};

export class HistoricoDashboardQueryDto {
  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Data inicial do dashboard historico.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_inicio deve ser uma data valida.' })
  data_inicio?: Date;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.999Z',
    description: 'Data final do dashboard historico.',
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

  @ApiPropertyOptional({
    enum: HISTORICO_STATUS_PROCESSO,
    example: statusprocesso.CONCLUIDO,
  })
  @IsOptional()
  @IsIn(HISTORICO_STATUS_PROCESSO, {
    message: 'status_processo deve ser um status valido de processo.',
  })
  status_processo?: statusprocesso;

  @ApiPropertyOptional({
    example: 1,
    description: 'Filtra dashboard historico por tanque.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_tanque deve ser um numero inteiro.' })
  @Min(1, { message: 'id_tanque deve ser maior ou igual a 1.' })
  id_tanque?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Inclui processos problematicos nos agregados do dashboard.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({
    message: 'incluir_processos_problematicos deve ser true ou false.',
  })
  incluir_processos_problematicos?: boolean;

  @ApiPropertyOptional({
    example: 10,
    description: 'Limite de itens em rankings historicos.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite_rankings deve ser um numero inteiro.' })
  @Min(1, { message: 'limite_rankings deve ser maior ou igual a 1.' })
  @Max(20, { message: 'limite_rankings deve ser menor ou igual a 20.' })
  limite_rankings?: number;
}
