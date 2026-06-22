import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ProcessoIdParamDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id_processo!: number;
}
