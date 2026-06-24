import { formatorelatorio, tiporelatorio } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

type OrderDirection = 'asc' | 'desc';

function isOptionalValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function toOptionalNumber(value: unknown): unknown {
  if (isOptionalValue(value)) {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed.length > 0 ? Number(trimmed) : undefined;
  }

  return value;
}

function toOptionalDate(value: unknown): unknown {
  if (isOptionalValue(value)) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed.length > 0 ? new Date(trimmed) : undefined;
  }

  if (typeof value === 'number') {
    return new Date(value);
  }

  return value;
}

function toOptionalUppercaseEnum(value: unknown): unknown {
  if (isOptionalValue(value)) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toUpperCase();

  return normalized.length > 0 ? normalized : undefined;
}

function toOptionalLowercaseString(value: unknown): unknown {
  if (isOptionalValue(value)) {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : undefined;
}

export class ListRelatoriosQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalNumber(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalUppercaseEnum(value))
  @IsEnum(tiporelatorio)
  tipo_relatorio?: tiporelatorio;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalUppercaseEnum(value))
  @IsEnum(formatorelatorio)
  formato_relatorio?: formatorelatorio;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalNumber(value))
  @IsInt()
  @IsPositive()
  id_processo?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalNumber(value))
  @IsInt()
  @IsPositive()
  id_alarme?: number;

  // Filtro potencialmente restrito. A permissão será validada no RelatorioPermissionValidator, não no DTO.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalNumber(value))
  @IsInt()
  @IsPositive()
  id_usuario?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalDate(value))
  @IsDate()
  data_inicio?: Date;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalDate(value))
  @IsDate()
  data_fim?: Date;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    toOptionalLowercaseString(value),
  )
  @IsString()
  @MaxLength(50)
  order_by?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    toOptionalLowercaseString(value),
  )
  @IsIn(['asc', 'desc'])
  order_direction?: OrderDirection;
}
