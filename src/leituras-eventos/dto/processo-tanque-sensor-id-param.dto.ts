import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ProcessoTanqueSensorIdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_processo_tanque_sensor!: number;
}
