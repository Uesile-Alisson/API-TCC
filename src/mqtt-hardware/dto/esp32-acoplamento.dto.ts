import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsOptional, Min } from 'class-validator';

export class Esp32AcoplamentoDTO {
  @IsInt()
  @Min(1)
  id_sensor: number;

  @IsInt()
  @Min(1)
  id_tanque: number;

  @IsBoolean()
  sinal_detectado: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  verificado_em: Date;
}
