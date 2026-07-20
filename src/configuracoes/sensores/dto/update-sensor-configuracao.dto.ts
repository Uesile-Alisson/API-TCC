import { ApiPropertyOptional } from '@nestjs/swagger';
import { protocolosensor, statussensor, tiposensor } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsInt,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSensorConfiguracaoDto {
  @ApiPropertyOptional({ example: 'Sensor Vacuo 01', maxLength: 80 })
  @IsOptional()
  @IsString({ message: 'nome deve ser texto.' })
  @MaxLength(80, { message: 'nome deve ter no maximo 80 caracteres.' })
  nome?: string;

  @ApiPropertyOptional({ example: 'MPX5700', maxLength: 100 })
  @IsOptional()
  @IsString({ message: 'modelo deve ser texto.' })
  @MaxLength(100, { message: 'modelo deve ter no maximo 100 caracteres.' })
  modelo?: string;

  @ApiPropertyOptional({ enum: protocolosensor })
  @IsOptional()
  @IsEnum(protocolosensor, { message: 'protocolo deve ser valido.' })
  protocolo?: protocolosensor;

  @ApiPropertyOptional({ example: 'kPa', maxLength: 20 })
  @IsOptional()
  @IsString({ message: 'unidade_medida deve ser texto.' })
  @MaxLength(20, {
    message: 'unidade_medida deve ter no maximo 20 caracteres.',
  })
  unidade_medida?: string;

  @ApiPropertyOptional({ example: 0.01, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 },
    { message: 'precisao deve ser um numero valido.' },
  )
  @Min(0, { message: 'precisao deve ser maior ou igual a 0.' })
  precisao?: number;

  @ApiPropertyOptional({ enum: statussensor })
  @IsOptional()
  @IsEnum(statussensor, { message: 'status_sensor deve ser valido.' })
  status_sensor?: statussensor;

  @ApiPropertyOptional({ enum: tiposensor })
  @IsOptional()
  @IsEnum(tiposensor, { message: 'tipo_sensor deve ser valido.' })
  tipo_sensor?: tiposensor;

  @ApiPropertyOptional({ example: 1, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 },
    { message: 'fator_calibracao deve ser um numero valido.' },
  )
  @Min(0, { message: 'fator_calibracao deve ser maior ou igual a 0.' })
  fator_calibracao?: number;

  @ApiPropertyOptional({ example: -101.325 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  limite_minimo_operacional?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  limite_maximo_operacional?: number;

  @ApiPropertyOptional({ example: 30, minimum: 0.001 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0.001)
  variacao_maxima_por_segundo?: number;

  @ApiPropertyOptional({ example: 8, minimum: 0.001 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0.001)
  oscilacao_maxima?: number;

  @ApiPropertyOptional({ example: 60, minimum: 5, maximum: 86400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(86400)
  tempo_travado_segundos?: number;
}
