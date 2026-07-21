import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class RelatorioUsuarioResumoDto {
  @ApiProperty() id_usuario!: number;
  @ApiProperty() nome!: string;
}

class RelatorioProcessoResumoDto {
  @ApiProperty() id_processo!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_processo!:
    | string
    | null;
  @ApiProperty() status_processo!: string;
}

class RelatorioAlarmeResumoDto {
  @ApiProperty() id_alarme!: number;
  @ApiProperty() titulo!: string;
  @ApiProperty({ enum: ['INFO', 'MEDIO', 'CRITICO'] }) severidade!: string;
  @ApiProperty({ enum: ['ATIVO', 'NORMALIZADO', 'RESOLVIDO'] })
  status_alarme!: string;
  @ApiProperty({ type: String, format: 'date-time' }) ocorrido_em!: Date;
}

export class RelatorioResponseDto {
  @ApiProperty() id_relatorio!: number;
  @ApiProperty() id_usuario!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_processo!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_alarme!:
    | number
    | null;
  @ApiProperty({ enum: ['PROCESSO', 'ALARME'] }) tipo_relatorio!: string;
  @ApiProperty({ enum: ['PDF', 'XLSX'] }) formato_relatorio!: string;
  @ApiProperty() titulo!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) descricao!:
    | string
    | null;
  @ApiProperty() nome_arquivo!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) tamanho_bytes!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) content_type!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time' }) gerado_em!: Date;
  @ApiPropertyOptional({
    type: () => RelatorioUsuarioResumoDto,
    nullable: true,
  })
  gerado_por!: RelatorioUsuarioResumoDto | null;
  @ApiPropertyOptional({
    type: () => RelatorioProcessoResumoDto,
    nullable: true,
  })
  processo!: RelatorioProcessoResumoDto | null;
  @ApiPropertyOptional({ type: () => RelatorioAlarmeResumoDto, nullable: true })
  alarme!: RelatorioAlarmeResumoDto | null;
  @ApiProperty() preview_disponivel!: boolean;
  @ApiProperty() download_disponivel!: boolean;
  @ApiProperty() possui_arquivo!: boolean;
}

class RelatorioPaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() total_pages!: number;
  @ApiProperty() has_next_page!: boolean;
  @ApiProperty() has_previous_page!: boolean;
}

export class RelatorioListResponseDto {
  @ApiProperty({ type: () => [RelatorioResponseDto] })
  data!: RelatorioResponseDto[];
  @ApiProperty({ type: () => RelatorioPaginationMetaDto })
  meta!: RelatorioPaginationMetaDto;
}

export class RelatorioGenerationResponseDto {
  @ApiProperty({ type: () => [RelatorioResponseDto] })
  relatorios!: RelatorioResponseDto[];
  @ApiProperty() total_gerados!: number;
  @ApiProperty({ enum: ['PDF', 'XLSX'], isArray: true })
  formatos_gerados!: string[];
}

export class SingleRelatorioGenerationResponseDto {
  @ApiProperty({ type: () => RelatorioResponseDto })
  relatorio!: RelatorioResponseDto;
  @ApiProperty({ enum: ['PDF', 'XLSX'] }) formato_gerado!: string;
}
