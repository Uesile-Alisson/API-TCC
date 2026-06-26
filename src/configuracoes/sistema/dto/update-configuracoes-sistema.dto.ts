import { ApiPropertyOptional } from '@nestjs/swagger';
import { statusgeralsistema } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateConfiguracoesSistemaDto {
  @ApiPropertyOptional({ example: 60, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tempo_maximo_padrao deve ser um numero inteiro.' })
  @Min(1, { message: 'tempo_maximo_padrao deve ser maior ou igual a 1.' })
  tempo_maximo_padrao?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'encerramento_automatico deve ser booleano.' })
  encerramento_automatico?: boolean;

  @ApiPropertyOptional({ example: -95 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 },
    { message: 'limite_seguranca_vacuo deve ser um numero valido.' },
  )
  limite_seguranca_vacuo?: number;

  @ApiPropertyOptional({ example: -80.5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 },
    { message: 'vacuo_padrao deve ser um numero valido.' },
  )
  vacuo_padrao?: number;

  @ApiPropertyOptional({ example: 4, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'quantidade_maxima_tanques deve ser um numero inteiro.' })
  @Min(1, { message: 'quantidade_maxima_tanques deve ser maior ou igual a 1.' })
  quantidade_maxima_tanques?: number;

  @ApiPropertyOptional({ enum: statusgeralsistema })
  @IsOptional()
  @IsEnum(statusgeralsistema, {
    message: 'status_geral_sistema deve ser um status valido.',
  })
  status_geral_sistema?: statusgeralsistema;

  @ApiPropertyOptional({ example: '1.0.1', maxLength: 30 })
  @IsOptional()
  @IsString({ message: 'versao_sistema deve ser texto.' })
  @MaxLength(30, {
    message: 'versao_sistema deve ter no maximo 30 caracteres.',
  })
  versao_sistema?: string;

  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 },
    { message: 'tolerancia_vacuo_percentual deve ser um numero valido.' },
  )
  @Min(0, { message: 'tolerancia_vacuo_percentual deve ser no minimo 0.' })
  @Max(100, { message: 'tolerancia_vacuo_percentual deve ser no maximo 100.' })
  tolerancia_vacuo_percentual?: number;
}
