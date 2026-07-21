import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMetaResponseDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() total_pages!: number;
  @ApiProperty() has_next_page!: boolean;
  @ApiProperty() has_previous_page!: boolean;
}

export class LeituraResponseDto {
  @ApiProperty() id_leitura_sensor!: number;
  @ApiProperty() id_processo_tanque_sensor!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) valor_vacuo!:
    | number
    | null;
  @ApiProperty({ type: String, format: 'date-time' }) leitura_em!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) recebido_em!: Date;
}

export class LeituraListResponseDto {
  @ApiProperty({ type: () => [LeituraResponseDto] })
  data!: LeituraResponseDto[];
  @ApiProperty({ type: () => PaginationMetaResponseDto })
  meta!: PaginationMetaResponseDto;
}

class LeituraProcessoResumoDto {
  @ApiProperty() id_processo!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_processo!:
    | string
    | null;
  @ApiProperty() status_processo!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  iniciado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finalizado_em!: Date | null;
}

class LeituraProcessoTanqueResumoDto {
  @ApiProperty() id_processo_tanque!: number;
  @ApiProperty() id_tanque!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_tanque!:
    | string
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_alvo!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_inicial!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_final!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_medio!:
    | number
    | null;
  @ApiProperty() status_tanque_processo!: string;
}

class LeituraSensorResumoDto {
  @ApiProperty() id_sensor!: number;
  @ApiProperty() nome_sensor!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) modelo_sensor!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) unidade_medida!:
    | string
    | null;
  @ApiProperty() status_sensor!: string;
}

export class LeituraDetailsResponseDto extends LeituraResponseDto {
  @ApiPropertyOptional({ type: () => LeituraProcessoResumoDto, nullable: true })
  processo!: LeituraProcessoResumoDto | null;
  @ApiPropertyOptional({
    type: () => LeituraProcessoTanqueResumoDto,
    nullable: true,
  })
  processo_tanque!: LeituraProcessoTanqueResumoDto | null;
  @ApiPropertyOptional({ type: () => LeituraSensorResumoDto, nullable: true })
  sensor!: LeituraSensorResumoDto | null;
}

export class LeituraDashboardResponseDto {
  @ApiProperty() total_leituras!: number;
  @ApiProperty() leituras_ultima_hora!: number;
  @ApiProperty() leituras_hoje!: number;
  @ApiProperty() sensores_com_leitura!: number;
  @ApiProperty() processos_com_leitura!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_minimo!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_maximo!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_medio!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  primeira_leitura_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultima_leitura_em!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) generated_at!: Date;
}

export class EventoResponseDto {
  @ApiProperty() id_evento_processo!: number;
  @ApiProperty() id_processo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  id_processo_tanque_sensor!: number | null;
  @ApiProperty() tipo_evento!: string;
  @ApiProperty() origem_evento!: string;
  @ApiProperty() severidade_evento!: string;
  @ApiProperty({ type: String, format: 'date-time' }) ocorrido_em!: Date;
}

export class EventoListResponseDto {
  @ApiProperty({ type: () => [EventoResponseDto] }) data!: EventoResponseDto[];
  @ApiProperty({ type: () => PaginationMetaResponseDto })
  meta!: PaginationMetaResponseDto;
}

class EventoProcessoResumoDto {
  @ApiProperty() id_processo!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_processo!:
    | string
    | null;
  @ApiProperty() status_processo!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  iniciado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finalizado_em!: Date | null;
}

class EventoProcessoTanqueSensorResumoDto {
  @ApiProperty() id_processo_tanque_sensor!: number;
  @ApiProperty() id_processo_tanque!: number;
  @ApiProperty() id_sensor!: number;
}

class EventoSensorResumoDto {
  @ApiProperty() id_sensor!: number;
  @ApiProperty() nome_sensor!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) modelo_sensor!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) unidade_medida!:
    | string
    | null;
  @ApiProperty() status_sensor!: string;
}

class EventoTanqueResumoDto {
  @ApiProperty() id_processo_tanque!: number;
  @ApiProperty() id_tanque!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_tanque!:
    | string
    | null;
  @ApiProperty() status_tanque_processo!: string;
}

export class EventoDetailsResponseDto extends EventoResponseDto {
  @ApiPropertyOptional({ type: () => EventoProcessoResumoDto, nullable: true })
  processo!: EventoProcessoResumoDto | null;
  @ApiPropertyOptional({
    type: () => EventoProcessoTanqueSensorResumoDto,
    nullable: true,
  })
  processo_tanque_sensor!: EventoProcessoTanqueSensorResumoDto | null;
  @ApiPropertyOptional({ type: () => EventoSensorResumoDto, nullable: true })
  sensor!: EventoSensorResumoDto | null;
  @ApiPropertyOptional({ type: () => EventoTanqueResumoDto, nullable: true })
  tanque!: EventoTanqueResumoDto | null;
}

class TimelineItemResponseDto {
  @ApiProperty({ enum: ['LEITURA', 'EVENTO'] }) type!: string;
  @ApiProperty({ type: String, format: 'date-time' }) timestamp!: Date;
  @ApiProperty() id!: number;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description!:
    | string
    | null;
  @ApiPropertyOptional({ enum: ['INFO', 'MEDIO', 'CRITICO'], nullable: true })
  severity!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) value!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) unit!: string | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  metadata!: Record<string, unknown> | null;
}

export class ProcessoTimelineResponseDto {
  @ApiProperty() id_processo!: number;
  @ApiProperty({ type: () => [TimelineItemResponseDto] })
  items!: TimelineItemResponseDto[];
  @ApiProperty() total_items!: number;
  @ApiProperty({ type: String, format: 'date-time' }) generated_at!: Date;
}

class LeituraChartPointResponseDto {
  @ApiProperty({ type: String, format: 'date-time' }) timestamp!: Date;
  @ApiPropertyOptional({ type: Number, nullable: true }) valor_vacuo!:
    | number
    | null;
  @ApiProperty() id_leitura_sensor!: number;
  @ApiProperty() id_processo_tanque_sensor!: number;
}

export class LeituraChartResponseDto {
  @ApiProperty() id_processo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true })
  id_processo_tanque_sensor!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_alvo!:
    | number
    | null;
  @ApiProperty({ type: () => [LeituraChartPointResponseDto] })
  pontos!: LeituraChartPointResponseDto[];
  @ApiProperty() total_pontos!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) intervalo!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time' }) generated_at!: Date;
}

export class ProcessoOperationalSummaryResponseDto {
  @ApiProperty() id_processo!: number;
  @ApiProperty() total_leituras!: number;
  @ApiProperty() total_eventos!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  primeira_leitura_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultima_leitura_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  primeiro_evento_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultimo_evento_em!: Date | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_minimo!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_maximo!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_medio!:
    | number
    | null;
  @ApiProperty() eventos_criticos!: number;
  @ApiProperty() eventos_medios!: number;
  @ApiProperty() eventos_info!: number;
  @ApiProperty({ type: String, format: 'date-time' }) generated_at!: Date;
}
