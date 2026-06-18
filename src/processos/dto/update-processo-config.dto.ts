import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateProcessoSensorDTO {
  @ApiPropertyOptional({
    example: 1,
    description: 'ID do sensor que será associado ao tanque.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O id_sensor deve ser um número inteiro.' })
  @IsPositive({ message: 'O id_sensor deve ser maior que zero.' })
  id_sensor: number;

  @ApiPropertyOptional({
    example: 'Sensor ajustado antes do início do processo.',
  })
  @IsOptional()
  @IsString({ message: 'As observacoes devem ser um texto.' })
  @MaxLength(255, {
    message: 'As observacoes devem ter no máximo 255 caracteres.',
  })
  observacoes?: string;
}

export class UpdateProcessoTanqueDTO {
  @ApiPropertyOptional({
    example: 1,
    description: 'ID do tanque que será utilizado no processo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O id_tanque deve ser um número inteiro.' })
  @IsPositive({ message: 'O id_tanque deve ser maior que zero.' })
  id_tanque?: number;

  @ApiPropertyOptional({
    example: -80.5,
    description: 'Novo vácuo alvo específico do tanque.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 },
    { message: 'O vacuo_alvo do tanque deve ser um número válido.' },
  )
  vacuo_alvo?: number;

  @ApiPropertyOptional({
    type: [UpdateProcessoSensorDTO],
    description: 'Nova lista de sensores do tanque.',
  })
  @IsOptional()
  @IsArray({ message: 'sensores deve ser uma lista.' })
  @ArrayMinSize(1, {
    message: 'Cada tanque deve possuir pelo menos 1 sensor associado.',
  })
  @ValidateNested({ each: true })
  @Type(() => UpdateProcessoSensorDTO)
  sensores?: UpdateProcessoSensorDTO[];
}

export class UpdateProcessoConfigDTO {
  @ApiPropertyOptional({
    example: 'Processo de vácuo - Lote 002',
    description: 'Novo nome do processo.',
  })
  @IsOptional()
  @IsString({ message: 'O nome_processo deve ser um texto.' })
  @MaxLength(120, {
    message: 'O nome_processo deve ter no máximo 120 caracteres.',
  })
  nome_processo?: string;

  @ApiPropertyOptional({
    example: 900,
    description: 'Novo tempo máximo do processo em segundos.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O tempo_maximo deve ser um número inteiro.' })
  @Min(1, { message: 'O tempo_maximo deve ser maior que zero.' })
  tempo_maximo?: number;

  @ApiPropertyOptional({
    example: -80.5,
    description: 'Novo vácuo alvo geral do processo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 },
    { message: 'O vacuo_alvo deve ser um número válido.' },
  )
  vacuo_alvo?: number;

  @ApiPropertyOptional({
    type: [UpdateProcessoTanqueDTO],
    description:
      'Nova configuração dos tanques. Se enviada, substitui a configuração operacional anterior do processo.',
  })
  @IsOptional()
  @IsArray({ message: 'tanques deve ser uma lista.' })
  @ArrayMinSize(1, {
    message: 'O processo deve possuir pelo menos 1 tanque.',
  })
  @ArrayMaxSize(3, {
    message: 'O processo pode possuir no máximo 3 tanques.',
  })
  @ValidateNested({ each: true })
  @Type(() => UpdateProcessoTanqueDTO)
  tanques?: UpdateProcessoTanqueDTO[];
}
