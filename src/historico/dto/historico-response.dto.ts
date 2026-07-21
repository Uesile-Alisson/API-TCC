import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class HistoricoPaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() total_pages!: number;
  @ApiProperty() has_next_page!: boolean;
  @ApiProperty() has_previous_page!: boolean;
}

class HistoricoUsuarioResumoDto {
  @ApiProperty() id_usuario!: number;
  @ApiProperty() nome!: string;
}

export class HistoricoProcessoListItemDto {
  @ApiProperty() id_processo!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_processo!:
    | string
    | null;
  @ApiProperty() status_processo!: string;
  @ApiPropertyOptional({
    type: () => HistoricoUsuarioResumoDto,
    nullable: true,
  })
  usuario_responsavel!: HistoricoUsuarioResumoDto | null;
  @ApiProperty() quantidade_tanques!: number;
  @ApiProperty() vacuo_alvo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_inicial!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_final!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_medio!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) eficiencia!:
    | number
    | null;
  @ApiProperty() tempo_maximo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) tempo_execucao!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  iniciado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finalizado_em!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) criado_em!: Date;
  @ApiProperty() parada_emergencia!: boolean;
  @ApiProperty() total_alarmes!: number;
  @ApiProperty() total_alarmes_criticos!: number;
  @ApiProperty() total_eventos!: number;
  @ApiProperty() possui_relatorio!: boolean;
}

export class HistoricoProcessoListResponseDto {
  @ApiProperty({ type: () => [HistoricoProcessoListItemDto] })
  data!: HistoricoProcessoListItemDto[];
  @ApiProperty({ type: () => HistoricoPaginationMetaDto })
  meta!: HistoricoPaginationMetaDto;
}

export class HistoricoTanqueSummaryDto {
  @ApiProperty() id_processo_tanque!: number;
  @ApiProperty() id_tanque!: number;
  @ApiProperty() nome_tanque!: string;
  @ApiProperty() status_tanque_processo!: string;
  @ApiProperty() vacuo_alvo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_inicial!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_final!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_medio!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) eficiencia!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  iniciado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finalizado_em!: Date | null;
  @ApiProperty() quantidade_sensores!: number;
  @ApiProperty() quantidade_leituras!: number;
  @ApiProperty() total_alarmes!: number;
  @ApiProperty() total_alarmes_criticos!: number;
}

export class HistoricoAlarmeSummaryDto {
  @ApiProperty() id_alarme!: number;
  @ApiProperty() titulo!: string;
  @ApiProperty() descricao!: string;
  @ApiProperty() tipo_alarme!: string;
  @ApiProperty({ enum: ['INFO', 'MEDIO', 'CRITICO'] }) severidade!: string;
  @ApiProperty({ enum: ['ATIVO', 'NORMALIZADO', 'RESOLVIDO'] })
  status_alarme!: string;
  @ApiProperty() origem_alarme!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) valor_detectado!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) unidade!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time' }) ocorrido_em!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  resolvido_em!: Date | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_processo!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_processo_tanque!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  id_processo_tanque_sensor!: number | null;
}

export class HistoricoEventoSummaryDto {
  @ApiProperty() id_evento_processo!: number;
  @ApiProperty() id_processo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  id_processo_tanque_sensor!: number | null;
  @ApiProperty() tipo_evento!: string;
  @ApiProperty() origem_evento!: string;
  @ApiProperty() severidade_evento!: string;
  @ApiProperty({ type: String, format: 'date-time' }) ocorrido_em!: Date;
}

class HistoricoAlarmeListResponseDto {
  @ApiProperty({ type: () => [HistoricoAlarmeSummaryDto] })
  data!: HistoricoAlarmeSummaryDto[];
  @ApiProperty({ type: () => HistoricoPaginationMetaDto })
  meta!: HistoricoPaginationMetaDto;
}

class HistoricoEventoListResponseDto {
  @ApiProperty({ type: () => [HistoricoEventoSummaryDto] })
  data!: HistoricoEventoSummaryDto[];
  @ApiProperty({ type: () => HistoricoPaginationMetaDto })
  meta!: HistoricoPaginationMetaDto;
}

export { HistoricoAlarmeListResponseDto, HistoricoEventoListResponseDto };

export class HistoricoRelatorioSummaryDto {
  @ApiProperty() id_relatorio!: number;
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
  @ApiProperty({ type: String, format: 'date-time' }) gerado_em!: Date;
}

class HistoricoProcessoDetalheBaseDto {
  @ApiProperty() id_processo!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_processo!:
    | string
    | null;
  @ApiProperty() status_processo!: string;
  @ApiPropertyOptional({
    type: () => HistoricoUsuarioResumoDto,
    nullable: true,
  })
  usuario_responsavel!: HistoricoUsuarioResumoDto | null;
  @ApiProperty() vacuo_alvo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_inicial!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_final!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_medio!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) eficiencia!:
    | number
    | null;
  @ApiProperty() tempo_maximo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) tempo_execucao!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  iniciado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  pausado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  retomado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finalizado_em!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) criado_em!: Date;
  @ApiProperty() parada_emergencia!: boolean;
}

class HistoricoAlarmesResumoDto {
  @ApiProperty() total!: number;
  @ApiProperty() info!: number;
  @ApiProperty() medio!: number;
  @ApiProperty() critico!: number;
  @ApiProperty() ativos!: number;
  @ApiProperty() resolvidos!: number;
}

class HistoricoEventosResumoDto {
  @ApiProperty() total!: number;
  @ApiProperty() info!: number;
  @ApiProperty() aviso!: number;
  @ApiProperty() critico!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  primeiro_evento_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultimo_evento_em!: Date | null;
}

class HistoricoDiagnosticoDto {
  @ApiProperty({ enum: ['NORMAL', 'ATENCAO', 'CRITICO'] })
  classificacao_resultado!: string;
  @ApiProperty({ type: [String] }) motivos!: string[];
  @ApiProperty({ type: [String] }) recomendacoes!: string[];
}

export class HistoricoProcessoDetailsResponseDto {
  @ApiProperty({ type: () => HistoricoProcessoDetalheBaseDto })
  processo!: HistoricoProcessoDetalheBaseDto;
  @ApiProperty({ type: () => [HistoricoTanqueSummaryDto] })
  tanques!: HistoricoTanqueSummaryDto[];
  @ApiProperty({ type: () => HistoricoAlarmesResumoDto })
  resumo_alarmes!: HistoricoAlarmesResumoDto;
  @ApiProperty({ type: () => HistoricoEventosResumoDto })
  resumo_eventos!: HistoricoEventosResumoDto;
  @ApiProperty({ type: () => [HistoricoRelatorioSummaryDto] })
  relatorios!: HistoricoRelatorioSummaryDto[];
  @ApiProperty({ type: () => HistoricoDiagnosticoDto })
  diagnostico!: HistoricoDiagnosticoDto;
}

class HistoricoKpisDto {
  @ApiProperty() total_processos!: number;
  @ApiProperty() total_concluidos!: number;
  @ApiProperty() total_interrompidos!: number;
  @ApiProperty() total_falhas!: number;
  @ApiProperty() taxa_sucesso_percentual!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) eficiencia_media!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) tempo_execucao_medio!:
    | number
    | null;
  @ApiProperty() tempo_execucao_total!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_medio_geral!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_final_medio!:
    | number
    | null;
  @ApiProperty() processos_com_parada_emergencia!: number;
  @ApiProperty() total_alarmes!: number;
  @ApiProperty() total_alarmes_criticos!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  media_alarmes_por_processo!: number | null;
}

class HistoricoStatusChartPointDto {
  @ApiProperty() status_processo!: string;
  @ApiProperty() total!: number;
}

class HistoricoTimeSeriesPointDto {
  @ApiProperty() periodo!: string;
  @ApiProperty() valor!: number;
}

class HistoricoEfficiencyTimePointDto {
  @ApiProperty() periodo!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) eficiencia_media!:
    | number
    | null;
}

class HistoricoExecutionTimePointDto {
  @ApiProperty() periodo!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) tempo_execucao_medio!:
    | number
    | null;
}

class HistoricoAlarmSeverityChartPointDto {
  @ApiProperty({ enum: ['INFO', 'MEDIO', 'CRITICO'] }) severidade!: string;
  @ApiProperty() total!: number;
}

export class HistoricoTanqueRankingItemDto {
  @ApiProperty() id_tanque!: number;
  @ApiProperty() nome_tanque!: string;
  @ApiProperty() total_processos!: number;
  @ApiProperty() total_concluidos!: number;
  @ApiProperty() total_falhas!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) eficiencia_media!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) tempo_execucao_medio!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_medio!:
    | number
    | null;
  @ApiProperty() total_alarmes!: number;
  @ApiProperty() total_alarmes_criticos!: number;
}

export class HistoricoDashboardResponseDto {
  @ApiProperty({ type: () => HistoricoKpisDto }) kpis!: HistoricoKpisDto;
  @ApiProperty({ type: () => [HistoricoStatusChartPointDto] })
  processos_por_status!: HistoricoStatusChartPointDto[];
  @ApiProperty({ type: () => [HistoricoTimeSeriesPointDto] })
  processos_por_periodo!: HistoricoTimeSeriesPointDto[];
  @ApiProperty({ type: () => [HistoricoEfficiencyTimePointDto] })
  eficiencia_por_periodo!: HistoricoEfficiencyTimePointDto[];
  @ApiProperty({ type: () => [HistoricoExecutionTimePointDto] })
  tempo_execucao_por_periodo!: HistoricoExecutionTimePointDto[];
  @ApiProperty({ type: () => [HistoricoAlarmSeverityChartPointDto] })
  alarmes_por_severidade!: HistoricoAlarmSeverityChartPointDto[];
  @ApiProperty({ type: () => [HistoricoTanqueRankingItemDto] })
  comparativo_tanques!: HistoricoTanqueRankingItemDto[];
  @ApiProperty({ type: () => [HistoricoProcessoListItemDto] })
  processos_problematicos!: HistoricoProcessoListItemDto[];
}

class HistoricoVacuoChartPointDto {
  @ApiProperty() id_leitura_sensor!: number;
  @ApiProperty() id_processo_tanque_sensor!: number;
  @ApiProperty() id_tanque!: number;
  @ApiProperty() nome_tanque!: string;
  @ApiProperty() id_sensor!: number;
  @ApiProperty() nome_sensor!: string;
  @ApiProperty() valor_vacuo!: number;
  @ApiProperty({ type: String, format: 'date-time' }) leitura_em!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) recebido_em!: Date;
}

export class HistoricoVacuoChartResponseDto {
  @ApiProperty() id_processo!: number;
  @ApiProperty() vacuo_alvo!: number;
  @ApiProperty() total_pontos!: number;
  @ApiProperty({ type: () => [HistoricoVacuoChartPointDto] })
  data!: HistoricoVacuoChartPointDto[];
}

export class HistoricoTanqueComparisonResponseDto {
  @ApiProperty({ type: () => [HistoricoTanqueRankingItemDto] })
  data!: HistoricoTanqueRankingItemDto[];
}
