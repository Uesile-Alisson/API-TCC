import { formatorelatorio } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function toOptionalTrimmedString(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function toOptionalUppercaseEnum(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class GenerateAlarmReportDto {
  // Relatório de alarme aceita apenas PDF. A validação final também será reforçada no RelatorioGenerationValidator.
  @IsOptional()
  @Transform(({ value }) => toOptionalUppercaseEnum(value))
  @IsEnum(formatorelatorio)
  @IsIn([formatorelatorio.PDF])
  formato?: formatorelatorio;

  @IsOptional()
  @Transform(({ value }) => toOptionalTrimmedString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  observacao?: string;
}
