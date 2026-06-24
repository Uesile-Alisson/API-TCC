import { formatorelatorio } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

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

function toUppercaseFormatArray(value: unknown): unknown {
  if (!isUnknownArray(value)) {
    return value;
  }

  return value.map((item: unknown): unknown =>
    typeof item === 'string' ? item.trim().toUpperCase() : item,
  );
}

export class GenerateProcessReportDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toUppercaseFormatArray(value))
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsEnum(formatorelatorio, { each: true })
  formatos?: formatorelatorio[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalTrimmedString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  observacao?: string;
}
