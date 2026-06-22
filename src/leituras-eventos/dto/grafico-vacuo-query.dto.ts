import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const GRAFICO_VACUO_INTERVALOS = [
  'RAW',
  'MINUTO',
  'CINCO_MINUTOS',
  'DEZ_MINUTOS',
] as const;

export type GraficoVacuoIntervalo = (typeof GRAFICO_VACUO_INTERVALOS)[number];

export class GraficoVacuoQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_processo_tanque_sensor?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  leitura_de?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  leitura_ate?: Date;

  @IsOptional()
  @IsIn(GRAFICO_VACUO_INTERVALOS)
  intervalo?: GraficoVacuoIntervalo;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}
