import { ApiProperty } from '@nestjs/swagger';
import { statusgeralsistema } from '@prisma/client';

export class ConfiguracoesSistemaResponseDto {
  @ApiProperty({ example: 1 })
  id_configuracao_sistema!: number;

  @ApiProperty({ example: 60 })
  tempo_maximo_padrao!: number;

  @ApiProperty({ example: true })
  encerramento_automatico!: boolean;

  @ApiProperty({ example: -95 })
  limite_seguranca_vacuo!: number;

  @ApiProperty({ example: -80.5 })
  vacuo_padrao!: number;

  @ApiProperty({ example: 4 })
  quantidade_maxima_tanques!: number;

  @ApiProperty({ enum: statusgeralsistema })
  status_geral_sistema!: statusgeralsistema;

  @ApiProperty({ example: '1.0.0' })
  versao_sistema!: string;

  @ApiProperty({ example: 10 })
  tolerancia_vacuo_percentual!: number;

  @ApiProperty({ example: 23, nullable: true })
  id_usuario_alteracao!: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  atualizado_em!: Date;
}
