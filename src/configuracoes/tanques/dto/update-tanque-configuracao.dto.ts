import { ApiPropertyOptional } from '@nestjs/swagger';
import { statustanque } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNegative,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateTanqueConfiguracaoDto {
  @ApiPropertyOptional({ example: 'Tanque 01', maxLength: 80 })
  @IsOptional()
  @IsString({ message: 'nome deve ser texto.' })
  @MaxLength(80, { message: 'nome deve ter no maximo 80 caracteres.' })
  nome?: string;

  @ApiPropertyOptional({ example: 1000, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 },
    { message: 'volume deve ser um numero valido.' },
  )
  @Min(0.01, { message: 'volume deve ser maior que 0.' })
  volume?: number;

  @ApiPropertyOptional({ example: 'L', maxLength: 20 })
  @IsOptional()
  @IsString({ message: 'unidade_volume deve ser texto.' })
  @MaxLength(20, {
    message: 'unidade_volume deve ter no maximo 20 caracteres.',
  })
  unidade_volume?: string;

  @ApiPropertyOptional({
    example: -80.5,
    maximum: -0.001,
    description:
      'Vácuo padrão manométrico em kPa, expresso como valor negativo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 },
    { message: 'vacuo_padrao deve ser um numero valido.' },
  )
  @IsNegative({
    message:
      'vacuo_padrao deve ser menor que zero (pressao manometrica em kPa).',
  })
  vacuo_padrao?: number;

  @ApiPropertyOptional({ enum: statustanque, example: statustanque.ATIVO })
  @IsOptional()
  @IsEnum(statustanque, { message: 'status_tanque deve ser valido.' })
  status_tanque?: statustanque;
}
