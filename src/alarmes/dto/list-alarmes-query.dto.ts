import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const ALARME_ORDER_BY_OPTIONS = [
  'ocorrido_em',
  'severidade',
  'status_alarme',
  'tipo_alarme',
] as const;

const ORDER_DIRECTION_OPTIONS = ['asc', 'desc'] as const;

type AlarmeOrderBy = (typeof ALARME_ORDER_BY_OPTIONS)[number];
type OrderDirection = (typeof ORDER_DIRECTION_OPTIONS)[number];

const parseBooleanQuery = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
};

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ListAlarmesQueryDto {
  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Pagina atual da listagem.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page deve ser um numero inteiro.' })
  @Min(1, { message: 'page deve ser maior ou igual a 1.' })
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    description: 'Quantidade de alarmes por pagina.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit deve ser um numero inteiro.' })
  @Min(1, { message: 'limit deve ser maior ou igual a 1.' })
  @Max(100, { message: 'limit deve ser menor ou igual a 100.' })
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: severidadealarme,
    example: severidadealarme.CRITICO,
  })
  @IsOptional()
  @IsEnum(severidadealarme, {
    message: 'A severidade informada e invalida.',
  })
  severidade?: severidadealarme;

  @ApiPropertyOptional({
    enum: statusalarme,
    example: statusalarme.ATIVO,
  })
  @IsOptional()
  @IsEnum(statusalarme, {
    message: 'O status_alarme informado e invalido.',
  })
  status_alarme?: statusalarme;

  @ApiPropertyOptional({
    enum: tipoalarme,
    example: tipoalarme.PROCESSO,
  })
  @IsOptional()
  @IsEnum(tipoalarme, {
    message: 'O tipo_alarme informado e invalido.',
  })
  tipo_alarme?: tipoalarme;

  @ApiPropertyOptional({
    enum: origemalarme,
    example: origemalarme.MQTT,
  })
  @IsOptional()
  @IsEnum(origemalarme, {
    message: 'A origem_alarme informada e invalida.',
  })
  origem_alarme?: origemalarme;

  @ApiPropertyOptional({
    example: 10,
    description: 'Filtra alarmes vinculados a um processo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_processo deve ser um numero inteiro.' })
  @Min(1, { message: 'id_processo deve ser maior ou igual a 1.' })
  id_processo?: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Filtra alarmes vinculados a um tanque do processo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_processo_tanque deve ser um numero inteiro.' })
  @Min(1, { message: 'id_processo_tanque deve ser maior ou igual a 1.' })
  id_processo_tanque?: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Filtra alarmes vinculados a um sensor no processo.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'id_processo_tanque_sensor deve ser um numero inteiro.',
  })
  @Min(1, {
    message: 'id_processo_tanque_sensor deve ser maior ou igual a 1.',
  })
  id_processo_tanque_sensor?: number;

  @ApiPropertyOptional({
    example: 40,
    description: 'Filtra alarmes vinculados a uma mensagem MQTT.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'id_mqtt_mensagem deve ser um numero inteiro.' })
  @Min(1, { message: 'id_mqtt_mensagem deve ser maior ou igual a 1.' })
  id_mqtt_mensagem?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtra apenas alarmes ativos.',
  })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean({ message: 'apenas_ativos deve ser true ou false.' })
  apenas_ativos?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtra apenas alarmes criticos.',
  })
  @IsOptional()
  @Transform(parseBooleanQuery)
  @IsBoolean({ message: 'apenas_criticos deve ser true ou false.' })
  apenas_criticos?: boolean;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Data inicial de ocorrencia do alarme.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'ocorrido_de deve ser uma data valida.' })
  ocorrido_de?: Date;

  @ApiPropertyOptional({
    example: '2026-06-21T23:59:59.999Z',
    description: 'Data final de ocorrencia do alarme.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'ocorrido_ate deve ser uma data valida.' })
  ocorrido_ate?: Date;

  @ApiPropertyOptional({
    example: 'mangueira desacoplada',
    description: 'Busca textual futura por titulo ou descricao.',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'busca deve ser um texto.' })
  @MinLength(1, { message: 'busca deve possuir pelo menos 1 caractere.' })
  @MaxLength(120, {
    message: 'busca deve ter no maximo 120 caracteres.',
  })
  busca?: string;

  @ApiPropertyOptional({
    enum: ALARME_ORDER_BY_OPTIONS,
    example: 'ocorrido_em',
    default: 'ocorrido_em',
  })
  @IsOptional()
  @IsIn(ALARME_ORDER_BY_OPTIONS, {
    message:
      'order_by deve ser ocorrido_em, severidade, status_alarme ou tipo_alarme.',
  })
  order_by?: AlarmeOrderBy = 'ocorrido_em';

  @ApiPropertyOptional({
    enum: ORDER_DIRECTION_OPTIONS,
    example: 'desc',
    default: 'desc',
  })
  @IsOptional()
  @IsIn(ORDER_DIRECTION_OPTIONS, {
    message: 'order_direction deve ser asc ou desc.',
  })
  order_direction?: OrderDirection = 'desc';
}
