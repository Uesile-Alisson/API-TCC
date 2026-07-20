import { ApiProperty } from '@nestjs/swagger';
import { statusgeralsistema } from '@prisma/client';

export class ConfiguracoesSistemaResponseDto {
  @ApiProperty({ example: 1 })
  id_configuracao_sistema!: number;

  @ApiProperty({ example: 60 })
  tempo_maximo_padrao!: number;

  @ApiProperty({ example: true })
  encerramento_automatico!: boolean;

  @ApiProperty({ example: 30 })
  tempo_estabilizacao_vacuo_segundos!: number;

  @ApiProperty({ example: 80 })
  estabilizacao_cobertura_minima_percentual!: number;

  @ApiProperty({ example: 1000 })
  intervalo_leitura_esperado_ms!: number;

  @ApiProperty({ example: 2500 })
  timeout_leitura_sensor_ms!: number;

  @ApiProperty({ example: 30 })
  tempo_retencao_vacuo_segundos!: number;

  @ApiProperty({ example: 2 })
  perda_vacuo_maxima_retencao!: number;

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

  @ApiProperty({ example: 60 })
  estagnacao_janela_segundos!: number;

  @ApiProperty({ example: 2 })
  estagnacao_variacao_minima!: number;

  @ApiProperty({ example: 5 })
  estagnacao_leituras_minimas!: number;

  @ApiProperty({ example: 2 })
  estagnacao_janelas_consecutivas!: number;

  @ApiProperty({ example: 30 })
  estagnacao_tempo_minimo_bomba_principal_segundos!: number;

  @ApiProperty({ example: 180 })
  estagnacao_tempo_maximo_sem_progresso_segundos!: number;

  @ApiProperty({ example: 0.35 })
  estagnacao_fator_minimo_proximidade_alvo!: number;

  @ApiProperty({ example: 30 })
  auxilio_janela_avaliacao_segundos!: number;

  @ApiProperty({ example: 1 })
  auxilio_melhoria_minima!: number;

  @ApiProperty({ example: 180 })
  auxilio_timeout_segundos!: number;

  @ApiProperty({ example: 23, nullable: true })
  id_usuario_alteracao!: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  atualizado_em!: Date;
}
