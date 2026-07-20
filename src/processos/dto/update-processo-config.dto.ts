import { ApiPropertyOptional } from '@nestjs/swagger';
import { modooperacaoauxiliar } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNegative,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
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
    maximum: -0.001,
    description:
      'Novo vácuo alvo manométrico do tanque em kPa, expresso como valor negativo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 },
    { message: 'O vacuo_alvo do tanque deve ser um número válido.' },
  )
  @IsNegative({
    message:
      'O vacuo_alvo do tanque deve ser menor que zero (pressao manometrica em kPa).',
  })
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
    maximum: -0.001,
    description:
      'Novo vácuo alvo manométrico geral do processo em kPa, expresso como valor negativo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 },
    { message: 'O vacuo_alvo deve ser um número válido.' },
  )
  @IsNegative({
    message:
      'O vacuo_alvo deve ser menor que zero (pressao manometrica em kPa).',
  })
  vacuo_alvo?: number;

  @ApiPropertyOptional({
    enum: modooperacaoauxiliar,
    example: modooperacaoauxiliar.ASSISTIDO,
    description:
      'Novo modo de operacao do subsistema auxiliar. So pode ser alterado enquanto o processo estiver configurado.',
  })
  @IsOptional()
  @IsEnum(modooperacaoauxiliar, {
    message: 'modo_operacao_auxiliar deve ser AUTOMATICO, ASSISTIDO ou MANUAL.',
  })
  modo_operacao_auxiliar?: modooperacaoauxiliar;

  @ApiPropertyOptional({
    example: false,
    description:
      'Habilita ou desabilita o encerramento automatico. So pode ser alterado enquanto o processo estiver configurado.',
  })
  @IsOptional()
  @IsBoolean({ message: 'encerramento_automatico deve ser booleano.' })
  encerramento_automatico?: boolean;

  @ApiPropertyOptional({ example: 60, minimum: 10, maximum: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(3600)
  estagnacao_janela_segundos?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1000)
  estagnacao_variacao_minima?: number;

  @ApiPropertyOptional({ example: 5, minimum: 3, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(1000)
  estagnacao_leituras_minimas?: number;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
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
