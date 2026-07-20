import { ApiPropertyOptional } from '@nestjs/swagger';
import { statusgeralsistema } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNegative,
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

  @ApiPropertyOptional({ example: 30, minimum: 5, maximum: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tempo_estabilizacao_vacuo_segundos deve ser um inteiro.' })
  @Min(5, {
    message: 'tempo_estabilizacao_vacuo_segundos deve ser no minimo 5.',
  })
  @Max(3600, {
    message: 'tempo_estabilizacao_vacuo_segundos deve ser no maximo 3600.',
  })
  tempo_estabilizacao_vacuo_segundos?: number;

  @ApiPropertyOptional({ example: 80, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 },
    {
      message:
        'estabilizacao_cobertura_minima_percentual deve ser um numero valido.',
    },
  )
  @Min(1, {
    message: 'estabilizacao_cobertura_minima_percentual deve ser no minimo 1.',
  })
  @Max(100, {
    message:
      'estabilizacao_cobertura_minima_percentual deve ser no maximo 100.',
  })
  estabilizacao_cobertura_minima_percentual?: number;

  @ApiPropertyOptional({ example: 1000, minimum: 100, maximum: 60000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'intervalo_leitura_esperado_ms deve ser um inteiro.' })
  @Min(100, {
    message: 'intervalo_leitura_esperado_ms deve ser no minimo 100.',
  })
  @Max(60000, {
    message: 'intervalo_leitura_esperado_ms deve ser no maximo 60000.',
  })
  intervalo_leitura_esperado_ms?: number;

  @ApiPropertyOptional({ example: 2500, minimum: 100, maximum: 120000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'timeout_leitura_sensor_ms deve ser um inteiro.' })
  @Min(100, { message: 'timeout_leitura_sensor_ms deve ser no minimo 100.' })
  @Max(120000, {
    message: 'timeout_leitura_sensor_ms deve ser no maximo 120000.',
  })
  timeout_leitura_sensor_ms?: number;

  @ApiPropertyOptional({ example: 30, minimum: 5, maximum: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tempo_retencao_vacuo_segundos deve ser um inteiro.' })
  @Min(5, { message: 'tempo_retencao_vacuo_segundos deve ser no minimo 5.' })
  @Max(3600, {
    message: 'tempo_retencao_vacuo_segundos deve ser no maximo 3600.',
  })
  tempo_retencao_vacuo_segundos?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 },
    { message: 'perda_vacuo_maxima_retencao deve ser um numero valido.' },
  )
  @Min(0, { message: 'perda_vacuo_maxima_retencao deve ser no minimo 0.' })
  @Max(1000, {
    message: 'perda_vacuo_maxima_retencao deve ser no maximo 1000.',
  })
  perda_vacuo_maxima_retencao?: number;

  @ApiPropertyOptional({
    example: -95,
    maximum: -0.001,
    description:
      'Limite de segurança manométrico em kPa, expresso como valor negativo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 },
    { message: 'limite_seguranca_vacuo deve ser um numero valido.' },
  )
  @IsNegative({
    message:
      'limite_seguranca_vacuo deve ser menor que zero (pressao manometrica em kPa).',
  })
  limite_seguranca_vacuo?: number;

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

  @ApiPropertyOptional({ example: 60, minimum: 10, maximum: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'estagnacao_janela_segundos deve ser um inteiro.' })
  @Min(10, { message: 'estagnacao_janela_segundos deve ser no minimo 10.' })
  @Max(3600, {
    message: 'estagnacao_janela_segundos deve ser no maximo 3600.',
  })
  estagnacao_janela_segundos?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 },
    { message: 'estagnacao_variacao_minima deve ser um numero valido.' },
  )
  @Min(0, { message: 'estagnacao_variacao_minima deve ser no minimo 0.' })
  @Max(1000, {
    message: 'estagnacao_variacao_minima deve ser no maximo 1000.',
  })
  estagnacao_variacao_minima?: number;

  @ApiPropertyOptional({ example: 5, minimum: 3, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'estagnacao_leituras_minimas deve ser um inteiro.' })
  @Min(3, { message: 'estagnacao_leituras_minimas deve ser no minimo 3.' })
  @Max(1000, {
    message: 'estagnacao_leituras_minimas deve ser no maximo 1000.',
  })
  estagnacao_leituras_minimas?: number;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'estagnacao_janelas_consecutivas deve ser um inteiro.',
  })
  @Min(1, {
    message: 'estagnacao_janelas_consecutivas deve ser no minimo 1.',
  })
  @Max(10, {
    message: 'estagnacao_janelas_consecutivas deve ser no maximo 10.',
  })
  estagnacao_janelas_consecutivas?: number;

  @ApiPropertyOptional({ example: 30, minimum: 0, maximum: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3600)
  estagnacao_tempo_minimo_bomba_principal_segundos?: number;

  @ApiPropertyOptional({ example: 180, minimum: 10, maximum: 86400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(86400)
  estagnacao_tempo_maximo_sem_progresso_segundos?: number;

  @ApiPropertyOptional({ example: 0.35, minimum: 0.05, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0.05)
  @Max(1)
  estagnacao_fator_minimo_proximidade_alvo?: number;

  @ApiPropertyOptional({ example: 30, minimum: 5, maximum: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(3600)
  auxilio_janela_avaliacao_segundos?: number;

  @ApiPropertyOptional({ example: 1, minimum: 0.001, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(1000)
  auxilio_melhoria_minima?: number;

  @ApiPropertyOptional({ example: 180, minimum: 10, maximum: 86400 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(86400)
  auxilio_timeout_segundos?: number;
}
