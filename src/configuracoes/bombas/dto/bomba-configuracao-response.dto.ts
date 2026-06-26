import { ApiProperty } from '@nestjs/swagger';
import { statusbomba, tipobomba } from '@prisma/client';

export class BombaConfiguracaoResponseDto {
  @ApiProperty({ example: 1 })
  id_bomba!: number;

  @ApiProperty({ example: 1 })
  id_configuracao_sistema!: number;

  @ApiProperty({ example: 23, nullable: true })
  id_usuario_alteracao!: number | null;

  @ApiProperty({ example: 'Bomba Principal' })
  nome!: string;

  @ApiProperty({ enum: tipobomba })
  tipo_bomba!: tipobomba;

  @ApiProperty({ enum: statusbomba })
  status_padrao!: statusbomba;

  @ApiProperty({ example: true })
  entrada_por_pressao!: boolean;

  @ApiProperty({ example: false })
  entrada_por_tempo!: boolean;

  @ApiProperty({ example: true })
  encerramento_automatico!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  atualizado_em!: Date;
}
