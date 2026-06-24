import { Transform } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

function toRequiredNumber(value: unknown): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return Number(value);
}

export class RelatorioIdParamDto {
  @Transform(({ value }) => toRequiredNumber(value))
  @IsInt()
  @IsPositive()
  id_relatorio: number;
}
