import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class HistoricoProcessoIdParamDto {
  @ApiProperty({
    example: 1,
    description: 'Identificador do processo historico.',
  })
  @Type(() => Number)
  @IsInt({ message: 'id_processo deve ser um numero inteiro.' })
  @Min(1, { message: 'id_processo deve ser maior ou igual a 1.' })
  id_processo!: number;
}
