import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateProcessoSensorDTO {
  @ApiProperty({
    example: 1,
    description:
      'ID do sensor que será associado ao tanque dentro do processo.',
  })
  @Type(() => Number)
  @IsInt({ message: 'O id_sensor deve ser um número inteiro.' })
  @IsPositive({ message: 'O id_sensor deve ser maior que zero.' })
  id_sensor: number;

  @ApiPropertyOptional({
    example: 'Sensor principal do tanque 1.',
    description: 'Observações opcionais sobre o sensor no processo.',
  })
  @IsOptional()
  @IsString({ message: 'As observacoes devem ser um texto.' })
  @MaxLength(255, {
    message: 'As observacoes devem ter no máximo 255 caracteres.',
  })
  observacoes?: string;
}

export class CreateProcessoTanqueDTO {
  @ApiProperty({
    example: 1,
    description: 'ID do tanque que será utilizado no processo.',
  })
  @Type(() => Number)
  @IsInt({ message: 'O id_tanque deve ser um número inteiro.' })
  @IsPositive({ message: 'O id_tanque deve ser maior que zero.' })
  id_tanque: number;

  @ApiPropertyOptional({
    example: -80.5,
    description:
      'Vácuo alvo específico do tanque. Se não for informado, o sistema poderá usar o vácuo alvo geral do processo ou o padrão do tanque.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 },
    { message: 'O vacuo_alvo do tanque deve ser um número válido.' },
  )
  vacuo_alvo?: number;

  @ApiProperty({
    type: [CreateProcessoSensorDTO],
    description: 'Lista de sensores associados ao tanque dentro do processo.',
  })
  @IsArray({ message: 'sensores deve ser uma lista.' })
  @ArrayMinSize(1, {
    message: 'Cada tanque deve possuir pelo menos 1 sensor associado.',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateProcessoSensorDTO)
  sensores: CreateProcessoSensorDTO[];
}

export class CreateProcessoDTO {
  @ApiPropertyOptional({
    example: 'Processo de vácuo - Lote 001',
    description: 'Nome opcional do processo.',
  })
  @IsOptional()
  @IsString({ message: 'O nome_processo deve ser um texto.' })
  @MaxLength(120, {
    message: 'O nome_processo deve ter no máximo 120 caracteres.',
  })
  nome_processo?: string;

  @ApiProperty({
    example: 900,
    description: 'Tempo máximo do processo em segundos.',
  })
  @Type(() => Number)
  @IsInt({ message: 'O tempo_maximo deve ser um número inteiro.' })
  @Min(1, { message: 'O tempo_maximo deve ser maior que zero.' })
  tempo_maximo: number;

  @ApiPropertyOptional({
    example: -80.5,
    description:
      'Vácuo alvo geral do processo. Pode ser sobrescrito pelo vácuo alvo específico de cada tanque.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 },
    { message: 'O vacuo_alvo deve ser um número válido.' },
  )
  vacuo_alvo?: number;

  @ApiProperty({
    type: [CreateProcessoTanqueDTO],
    description:
      'Tanques que participarão do processo. O TSEA trabalha com no máximo 3 tanques simultâneos.',
  })
  @IsArray({ message: 'tanques deve ser uma lista.' })
  @ArrayMinSize(1, {
    message: 'O processo deve possuir pelo menos 1 tanque.',
  })
  @ArrayMaxSize(3, {
    message: 'O processo pode possuir no máximo 3 tanques.',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateProcessoTanqueDTO)
  tanques: CreateProcessoTanqueDTO[];
}
