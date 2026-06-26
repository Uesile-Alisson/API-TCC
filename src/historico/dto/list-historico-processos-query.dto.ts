import { ApiPropertyOptional } from '@nestjs/swagger';
import { statusprocesso } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const HISTORICO_STATUS_PROCESSO = Object.values(statusprocesso);

const HISTORICO_CAMPOS_DATA = [
  'criado_em',
  'iniciado_em',
  'finalizado_em',
] as const;

const ORDER_DIRECTIONS = ['asc', 'desc'] as const;

type HistoricoCampoData = (typeof HISTORICO_CAMPOS_DATA)[number];
type OrderDirection = (typeof ORDER_DIRECTIONS)[number];

const toOptionalBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
};

const trimOptionalString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ListHistoricoProcessosQueryDto {
  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Pagina atual da listagem historica.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page deve ser um numero inteiro.' })
  @Min(1, { message: 'page deve ser maior ou igual a 1.' })
  page?: number;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Quantidade de processos historicos por pagina.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit deve ser um numero inteiro.' })
  @Min(1, { message: 'limit deve ser maior ou igual a 1.' })
  @Max(100, { message: 'limit deve ser menor ou igual a 100.' })
  limit?: number;

  @ApiPropertyOptional({
    enum: HISTORICO_STATUS_PROCESSO,
    example: statusprocesso.CONCLUIDO,
  })
  @IsOptional()
  @IsIn(HISTORICO_STATUS_PROCESSO, {
    message: 'status_processo deve ser um status valido de processo.',
  })
  status_processo?: statusprocesso;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Data inicial do filtro historico.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_inicio deve ser uma data valida.' })
  data_inicio?: Date;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.999Z',
    description: 'Data final do filtro historico.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'data_fim deve ser uma data valida.' })
  data_fim?: Date;

  @ApiPropertyOptional({
    enum: HISTORICO_CAMPOS_DATA,
    example: 'finalizado_em',
  })
  @IsOptional()
  @IsIn(HISTORICO_CAMPOS_DATA, {
    message: 'campo_data deve ser criado_em, iniciado_em ou finalizado_em.',
  })
  campo_data?: HistoricoCampoData;

  // Filtro restrito: nao deve ser permitido para OPERADOR. A regra de autorizacao sera aplicada no validator/service, nao no DTO.
  @ApiPropertyOptional({
    example: 1,
    description: 'Filtra processos historicos por usuario.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_usuario deve ser um numero inteiro.' })
  @Min(1, { message: 'id_usuario deve ser maior ou igual a 1.' })
  id_usuario?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Filtra processos historicos por tanque.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_tanque deve ser um numero inteiro.' })
  @Min(1, { message: 'id_tanque deve ser maior ou igual a 1.' })
  id_tanque?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Filtra processos historicos por sensor.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_sensor deve ser um numero inteiro.' })
  @Min(1, { message: 'id_sensor deve ser maior ou igual a 1.' })
  id_sensor?: number;

  @ApiPropertyOptional({
    example: 'Processo lote 001',
    description: 'Busca textual pelo nome do processo.',
  })
  @IsOptional()
  @Transform(trimOptionalString)
  @IsString({ message: 'nome_processo deve ser um texto.' })
  @MaxLength(120, {
    message: 'nome_processo deve ter no maximo 120 caracteres.',
  })
  nome_processo?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Filtra processos historicos com parada de emergencia.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'parada_emergencia deve ser true ou false.' })
  parada_emergencia?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtra processos historicos que possuem alarmes.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'possui_alarmes deve ser true ou false.' })
  possui_alarmes?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtra processos historicos que possuem alarme critico.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'possui_alarme_critico deve ser true ou false.' })
  possui_alarme_critico?: boolean;

  // Geracao de relatorio pertence ao RelatoriosModule; Historico apenas consulta a existencia futura desse vinculo.
  @ApiPropertyOptional({
    example: true,
    description: 'Filtra processos historicos que possuem relatorio.',
  })
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'possui_relatorio deve ser true ou false.' })
  possui_relatorio?: boolean;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'eficiencia_min deve ser um numero.' })
  @Min(0, { message: 'eficiencia_min deve ser maior ou igual a 0.' })
  @Max(100, { message: 'eficiencia_min deve ser menor ou igual a 100.' })
  eficiencia_min?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'eficiencia_max deve ser um numero.' })
  @Min(0, { message: 'eficiencia_max deve ser maior ou igual a 0.' })
  @Max(100, { message: 'eficiencia_max deve ser menor ou igual a 100.' })
  eficiencia_max?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tempo_execucao_min deve ser um numero.' })
  @Min(0, { message: 'tempo_execucao_min deve ser maior ou igual a 0.' })
  tempo_execucao_min?: number;

  @ApiPropertyOptional({ example: 3600 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'tempo_execucao_max deve ser um numero.' })
  @Min(0, { message: 'tempo_execucao_max deve ser maior ou igual a 0.' })
  tempo_execucao_max?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'vacuo_alvo_min deve ser um numero.' })
  vacuo_alvo_min?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'vacuo_alvo_max deve ser um numero.' })
  vacuo_alvo_max?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'vacuo_final_min deve ser um numero.' })
  vacuo_final_min?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'vacuo_final_max deve ser um numero.' })
  vacuo_final_max?: number;

  // Allowlist rigida de order_by sera aplicada posteriormente em constants/validators.
  @ApiPropertyOptional({
    example: 'finalizado_em',
    description: 'Campo de ordenacao historica.',
  })
  @IsOptional()
  @IsString({ message: 'order_by deve ser um texto.' })
  order_by?: string;

  @ApiPropertyOptional({
    enum: ORDER_DIRECTIONS,
    example: 'desc',
  })
  @IsOptional()
  @IsIn(ORDER_DIRECTIONS, {
    message: 'order_direction deve ser asc ou desc.',
  })
  order_direction?: OrderDirection;
}
