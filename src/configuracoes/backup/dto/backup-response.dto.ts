import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const BACKUP_TYPES = ['SISTEMA', 'MQTT', 'COMPLETO'] as const;
const BACKUP_ORIGINS = ['MANUAL', 'AUTOMATICO', 'SISTEMA'] as const;
const BACKUP_STATUSES = [
  'GERADO',
  'RESTAURADO',
  'FALHA_GERACAO',
  'FALHA_RESTAURACAO',
  'INVALIDO',
] as const;

class BackupUserResponseDto {
  @ApiProperty() id_usuario!: number;
  @ApiProperty() nome!: string;
  @ApiProperty() login!: string;
}

export class BackupListItemResponseDto {
  @ApiProperty() id_backup!: number;
  @ApiProperty({ enum: BACKUP_TYPES }) tipo_backup!: string;
  @ApiProperty({ enum: BACKUP_ORIGINS }) origem_backup!: string;
  @ApiProperty({ enum: BACKUP_STATUSES }) status_backup!: string;
  @ApiProperty() nome_arquivo!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) hash_arquivo!:
    | string
    | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Inteiro serializado para preservar precisao de bigint.',
  })
  tamanho_bytes!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) content_type!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) storage_provider!:
    | string
    | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  metadados!: Record<string, unknown> | null;
  @ApiPropertyOptional({ type: String, nullable: true }) erro!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) criado_em!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  restaurado_em!: Date | null;
  @ApiProperty({ type: () => BackupUserResponseDto })
  usuario_criacao!: BackupUserResponseDto;
  @ApiPropertyOptional({ type: () => BackupUserResponseDto, nullable: true })
  usuario_restauracao!: BackupUserResponseDto | null;
}

export class BackupDetailsResponseDto extends BackupListItemResponseDto {
  @ApiProperty() id_usuario!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  id_usuario_restauracao!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  id_configuracao_sistema!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_mqtt_configuracao!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  id_mqtt_configuracao_historico!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) caminho_arquivo!:
    | string
    | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  snapshot_preview!: Record<string, unknown> | null;
}

class BackupPaginationMetaResponseDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() total_pages!: number;
}

export class BackupListResponseDto {
  @ApiProperty({ type: () => [BackupListItemResponseDto] })
  data!: BackupListItemResponseDto[];
  @ApiProperty({ type: () => BackupPaginationMetaResponseDto })
  meta!: BackupPaginationMetaResponseDto;
}

export class BackupRestoreResponseDto {
  @ApiProperty() id_backup!: number;
  @ApiProperty({ enum: ['RESTAURADO'] }) status_backup!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  restaurado_em!: Date | null;
  @ApiProperty({ type: [String] }) warnings!: string[];
  @ApiProperty({ type: () => BackupDetailsResponseDto })
  backup!: BackupDetailsResponseDto;
}
