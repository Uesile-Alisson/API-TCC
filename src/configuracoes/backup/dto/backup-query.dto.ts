import { ApiPropertyOptional } from '@nestjs/swagger';
import { statusbackup, tipobackup } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class BackupQueryDto {
  @ApiPropertyOptional({ enum: tipobackup, example: tipobackup.SISTEMA })
  @IsOptional()
  @IsEnum(tipobackup, { message: 'tipo_backup informado e invalido.' })
  tipo_backup?: tipobackup;

  @ApiPropertyOptional({ enum: statusbackup, example: statusbackup.GERADO })
  @IsOptional()
  @IsEnum(statusbackup, { message: 'status_backup informado e invalido.' })
  status_backup?: statusbackup;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString({}, { message: 'data_inicio deve ser uma data ISO valida.' })
  data_inicio?: string;

  @ApiPropertyOptional({ example: '2026-06-26T23:59:59.999Z' })
  @IsOptional()
  @IsDateString({}, { message: 'data_fim deve ser uma data ISO valida.' })
  data_fim?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
