import { ApiProperty } from '@nestjs/swagger';
import { statustanque } from '@prisma/client';

export class TanqueConfiguracaoResponseDto {
  @ApiProperty({ example: 1 })
  id_tanque!: number;

  @ApiProperty({ example: 'Tanque 01' })
  nome!: string;

  @ApiProperty({ example: 1000 })
  volume!: number;

  @ApiProperty({ example: 'L' })
  unidade_volume!: string;

  @ApiProperty({ example: -80.5 })
  vacuo_padrao!: number;

  @ApiProperty({ enum: statustanque })
  status_tanque!: statustanque;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  atualizado_em!: Date;
}
