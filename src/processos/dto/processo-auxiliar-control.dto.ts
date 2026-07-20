import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ProcessoAuxiliarLeaseDTO {
  @ApiProperty({
    example: 4,
    description: 'Versao atual do recurso auxiliar para concorrencia otimista.',
  })
  @Type(() => Number)
  @IsInt({ message: 'expected_version deve ser um numero inteiro.' })
  @Min(0, { message: 'expected_version nao pode ser negativo.' })
  expected_version!: number;

  @ApiPropertyOptional({
    example: 120,
    default: 120,
    minimum: 30,
    maximum: 300,
    description: 'Duracao do lease em segundos.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'duration_seconds deve ser um numero inteiro.' })
  @Min(30, { message: 'duration_seconds deve ser no minimo 30.' })
  @Max(300, { message: 'duration_seconds deve ser no maximo 300.' })
  duration_seconds?: number;

  @ApiProperty({
    example: 'Ajuste tecnico supervisionado do subsistema auxiliar.',
  })
  @IsString({ message: 'motivo deve ser um texto.' })
  @MinLength(3, { message: 'motivo deve ter pelo menos 3 caracteres.' })
  @MaxLength(500, { message: 'motivo deve ter no maximo 500 caracteres.' })
  motivo!: string;
}

export class ProcessoAuxiliarReleaseDTO {
  @ApiProperty({
    example: 5,
    description: 'Versao atual do recurso cujo lease sera liberado.',
  })
  @Type(() => Number)
  @IsInt({ message: 'expected_version deve ser um numero inteiro.' })
  @Min(0, { message: 'expected_version nao pode ser negativo.' })
  expected_version!: number;

  @ApiProperty({ example: 'Intervencao tecnica concluida.' })
  @IsString({ message: 'motivo deve ser um texto.' })
  @MinLength(3, { message: 'motivo deve ter pelo menos 3 caracteres.' })
  @MaxLength(500, { message: 'motivo deve ter no maximo 500 caracteres.' })
  motivo!: string;
}

export class ProcessoAuxiliarCommandDTO {
  @ApiProperty({
    example: 6,
    description: 'Versao atual do contrato global do subsistema auxiliar.',
  })
  @Type(() => Number)
  @IsInt({
    message: 'expected_subsystem_version deve ser um numero inteiro.',
  })
  @Min(0, {
    message: 'expected_subsystem_version nao pode ser negativo.',
  })
  expected_subsystem_version!: number;

  @ApiPropertyOptional({
    example: 3,
    description:
      'Versao auxiliar do tanque. Obrigatoria para comandos associados a tanque/valvula.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'expected_tank_version deve ser um numero inteiro.' })
  @Min(0, { message: 'expected_tank_version nao pode ser negativo.' })
  expected_tank_version?: number;

  @ApiPropertyOptional({
    example: 'front-aux-command-018f51f1',
    description:
      'Chave idempotente opcional. Reutilize o mesmo valor ao repetir a mesma requisicao.',
  })
  @IsOptional()
  @IsString({ message: 'correlation_id deve ser um texto.' })
  @MinLength(8, { message: 'correlation_id deve ter pelo menos 8 caracteres.' })
  @MaxLength(160, {
    message: 'correlation_id deve ter no maximo 160 caracteres.',
  })
  correlation_id?: string;

  @ApiProperty({
    example: 'Auxiliar manual para recuperar progresso do tanque.',
  })
  @IsString({ message: 'motivo deve ser um texto.' })
  @MinLength(3, { message: 'motivo deve ter pelo menos 3 caracteres.' })
  @MaxLength(500, { message: 'motivo deve ter no maximo 500 caracteres.' })
  motivo!: string;
}
