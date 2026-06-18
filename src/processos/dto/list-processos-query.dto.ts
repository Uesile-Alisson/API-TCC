import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { statusprocesso } from '@prisma/client';

export class ListProcessosQueryDTO {
  @ApiPropertyOptional({
    enum: statusprocesso,
    example: statusprocesso.EM_EXECUCAO,
    description: 'Filtra processos por status.',
  })
  @IsOptional()
  @IsEnum(statusprocesso, {
    message: 'O status_processo informado é inválido.',
  })
  status_processo?: statusprocesso;

  @ApiPropertyOptional({
    example: 'Lote 001',
    description: 'Busca textual pelo nome do processo.',
  })
  @IsOptional()
  @IsString({ message: 'A busca deve ser um texto.' })
  @MaxLength(120, {
    message: 'A busca deve ter no máximo 120 caracteres.',
  })
  busca?: string;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Data inicial do filtro.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'data_inicio deve ser uma data válida.' })
  data_inicio?: Date;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.000Z',
    description: 'Data final do filtro.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'data_fim deve ser uma data válida.' })
  data_fim?: Date;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Página atual da listagem.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page deve ser um número inteiro.' })
  @Min(1, { message: 'page deve ser maior ou igual a 1.' })
  page?: number = 1;

  @ApiPropertyOptional({
    example: 10,
    default: 10,
    description: 'Quantidade de registros por página.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit deve ser um número inteiro.' })
  @Min(1, { message: 'limit deve ser maior ou igual a 1.' })
  @Max(100, { message: 'limit deve ser menor ou igual a 100.' })
  limit?: number = 10;
}
