import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
    maximum: -0.001,
    description:
      'Vácuo alvo manométrico do tanque em kPa, expresso como valor negativo. Se não for informado, o sistema poderá usar o vácuo alvo geral do processo ou o padrão do tanque.',
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
    maximum: -0.001,
    description:
      'Vácuo alvo manométrico geral do processo em kPa, expresso como valor negativo. Pode ser sobrescrito pelo vácuo alvo específico de cada tanque.',
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

  @ApiProperty({
    enum: modooperacaoauxiliar,
    example: modooperacaoauxiliar.AUTOMATICO,
    description:
      'Modo de operacao do subsistema auxiliar. Nao altera o lifecycle principal do processo.',
  })
  @IsEnum(modooperacaoauxiliar, {
    message: 'modo_operacao_auxiliar deve ser AUTOMATICO, ASSISTIDO ou MANUAL.',
  })
  modo_operacao_auxiliar: modooperacaoauxiliar;

  @ApiProperty({
    example: true,
    description:
      'Habilita o encerramento individual e geral automatico. E independente do modo do subsistema auxiliar.',
  })
  @IsBoolean({ message: 'encerramento_automatico deve ser booleano.' })
  encerramento_automatico: boolean;

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
