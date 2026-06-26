import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { protocolosensor, statussensor, tiposensor } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSensorConfiguracaoDto {
  @ApiProperty({ example: 'Sensor Vacuo 01', maxLength: 80 })
  @IsString({ message: 'nome deve ser texto.' })
  @MaxLength(80, { message: 'nome deve ter no maximo 80 caracteres.' })
  nome!: string;

  @ApiProperty({ example: 'MPX5700', maxLength: 100 })
  @IsString({ message: 'modelo deve ser texto.' })
  @MaxLength(100, { message: 'modelo deve ter no maximo 100 caracteres.' })
  modelo!: string;

  @ApiProperty({ enum: protocolosensor, example: protocolosensor.I2C })
  @IsEnum(protocolosensor, { message: 'protocolo deve ser valido.' })
  protocolo!: protocolosensor;

  @ApiProperty({ example: 'kPa', maxLength: 20 })
  @IsString({ message: 'unidade_medida deve ser texto.' })
  @MaxLength(20, {
    message: 'unidade_medida deve ter no maximo 20 caracteres.',
  })
  unidade_medida!: string;

  @ApiPropertyOptional({ example: 0.01, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 },
    { message: 'precisao deve ser um numero valido.' },
  )
  @Min(0, { message: 'precisao deve ser maior ou igual a 0.' })
  precisao?: number;

  @ApiProperty({ enum: statussensor, example: statussensor.ATIVO })
  @IsEnum(statussensor, { message: 'status_sensor deve ser valido.' })
  status_sensor!: statussensor;

  @ApiPropertyOptional({ enum: tiposensor, example: tiposensor.VACUO })
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
}
