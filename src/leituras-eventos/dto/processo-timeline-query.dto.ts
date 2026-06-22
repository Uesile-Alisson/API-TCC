import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

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

export class ProcessoTimelineQueryDto {
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  incluir_leituras?: boolean;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  incluir_eventos?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  ocorrido_de?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  ocorrido_ate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
