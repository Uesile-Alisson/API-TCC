import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  protocolosensor,
  statussensor,
  statusintegridadesensor,
  tiposensor,
} from '@prisma/client';
import { ConfiguracoesPaginationMetaDto } from '../../common/paginated-configuracoes-response.interface';

export class SensorConfiguracaoResponseDto {
  @ApiProperty({ example: 1 })
  id_sensor!: number;

  @ApiProperty({ example: 'Sensor Vacuo 01' })
  nome!: string;

  @ApiProperty({ example: 'MPX5700' })
  modelo!: string;

  @ApiProperty({ enum: protocolosensor })
  protocolo!: protocolosensor;

  @ApiProperty({ example: 'kPa' })
  unidade_medida!: string;

  @ApiPropertyOptional({ example: 0.01, nullable: true })
  precisao!: number | null;

  @ApiProperty({ enum: statussensor })
  status_sensor!: statussensor;

  @ApiProperty({ enum: tiposensor })
  tipo_sensor!: tiposensor;

  @ApiPropertyOptional({ example: 1, nullable: true })
  fator_calibracao!: number;

  @ApiProperty({ example: 0 })
  offset_calibracao!: number;

  @ApiProperty({ enum: statusintegridadesensor })
  status_integridade!: statusintegridadesensor;

  @ApiPropertyOptional({ example: -49.8, nullable: true })
  ultimo_valor_bruto!: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  calibrado_em!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  calibracao_valida_ate!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  calibracao_referencia!: string | null;

  @ApiPropertyOptional({ nullable: true })
  calibracao_incerteza!: number | null;

  @ApiPropertyOptional({ nullable: true })
  calibracao_observacoes!: string | null;

  @ApiPropertyOptional({ nullable: true })
  id_usuario_calibracao!: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  liberado_em!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  id_usuario_liberacao!: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  integridade_validada_em!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  integridade_ultimo_erro!: string | null;

  @ApiProperty({ example: false })
  modo_calibracao_ativo!: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  calibracao_iniciada_em!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  limite_minimo_operacional!: number | null;

  @ApiPropertyOptional({ nullable: true })
  limite_maximo_operacional!: number | null;

  @ApiPropertyOptional({ nullable: true })
  variacao_maxima_por_segundo!: number | null;

  @ApiPropertyOptional({ nullable: true })
  oscilacao_maxima!: number | null;

  @ApiProperty({ example: 60 })
  tempo_travado_segundos!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: Date;
}

export class SensoresConfiguracaoListResponseDto {
  @ApiProperty({ type: SensorConfiguracaoResponseDto, isArray: true })
  data!: SensorConfiguracaoResponseDto[];

  @ApiProperty({ type: ConfiguracoesPaginationMetaDto })
  meta!: ConfiguracoesPaginationMetaDto;
}
