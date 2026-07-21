import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ALARM_SEVERITIES = ['INFO', 'MEDIO', 'CRITICO'] as const;
const ALARM_STATUSES = ['ATIVO', 'NORMALIZADO', 'RESOLVIDO'] as const;
const ALARM_TYPES = [
  'SENSOR',
  'BOMBA',
  'MQTT',
  'ESP32',
  'PROCESSO',
  'SEGURANCA',
  'SISTEMA',
  'TANQUE',
  'FLUXO',
  'NIVEL',
  'VALVULA',
  'MANGUEIRA',
] as const;
const ALARM_ORIGINS = [
  'SENSOR',
  'ESP32',
  'MQTT',
  'BACKEND',
  'SISTEMA',
  'USUARIO',
] as const;

export class AlarmeResponseDto {
  @ApiProperty() id_alarme!: number;
  @ApiProperty() titulo!: string;
  @ApiProperty() descricao!: string;
  @ApiProperty({ enum: ALARM_TYPES }) tipo_alarme!: string;
  @ApiProperty({ enum: ALARM_SEVERITIES }) severidade!: string;
  @ApiProperty({ enum: ALARM_STATUSES }) status_alarme!: string;
  @ApiProperty({ enum: ALARM_ORIGINS }) origem_alarme!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) valor_detectado!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) unidade!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time' }) ocorrido_em!: Date;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  normalizado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  resolvido_em!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) motivo_resolucao!:
    | string
    | null;
  @ApiProperty() bloqueante!: boolean;
  @ApiProperty() requer_intervencao!: boolean;
  @ApiProperty() recuperacao_automatica!: boolean;
  @ApiProperty() tentativas_recuperacao!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultima_tentativa_recuperacao_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultima_validacao_em!: Date | null;
  @ApiProperty() reconhecido!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultimo_reconhecimento_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  excluido_em!: Date | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_processo!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_processo_tanque!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  id_processo_tanque_sensor!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_mqtt_mensagem!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  id_usuario_responsavel!: number | null;
}

export class AlarmePaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() total_pages!: number;
  @ApiProperty() has_next_page!: boolean;
  @ApiProperty() has_previous_page!: boolean;
}

export class AlarmeListResponseDto {
  @ApiProperty({ type: () => [AlarmeResponseDto] }) data!: AlarmeResponseDto[];
  @ApiProperty({ type: () => AlarmePaginationMetaDto })
  meta!: AlarmePaginationMetaDto;
}

class AlarmeProcessSummaryDto {
  @ApiProperty() id_processo!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_processo!:
    | string
    | null;
  @ApiProperty() status_processo!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) fase_processo!:
    | string
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_alvo!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  iniciado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finalizado_em!: Date | null;
}

class AlarmeProcessTankSummaryDto {
  @ApiProperty() id_processo_tanque!: number;
  @ApiProperty() id_tanque!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_tanque!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  status_tanque_processo!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_alvo!:
    | number
    | null;
}

class AlarmeProcessTankSensorSummaryDto {
  @ApiProperty() id_processo_tanque_sensor!: number;
  @ApiProperty() id_sensor!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_sensor!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) modelo_sensor!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) unidade_medida!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) status_sensor!:
    | string
    | null;
}

class AlarmeMqttMessageSummaryDto {
  @ApiProperty() id_mqtt_mensagem!: number;
  @ApiProperty() topico!: string;
  @ApiProperty() direcao!: string;
  @ApiProperty() origem!: string;
  @ApiProperty({ type: String, format: 'date-time' }) criado_em!: Date;
}

class AlarmeResponsibleUserSummaryDto {
  @ApiProperty() id_usuario!: number;
  @ApiProperty() nome!: string;
}

export class AlarmeDetailsResponseDto extends AlarmeResponseDto {
  @ApiPropertyOptional({ type: () => AlarmeProcessSummaryDto, nullable: true })
  processo!: AlarmeProcessSummaryDto | null;
  @ApiPropertyOptional({
    type: () => AlarmeProcessTankSummaryDto,
    nullable: true,
  })
  processo_tanque!: AlarmeProcessTankSummaryDto | null;
  @ApiPropertyOptional({
    type: () => AlarmeProcessTankSensorSummaryDto,
    nullable: true,
  })
  processo_tanque_sensor!: AlarmeProcessTankSensorSummaryDto | null;
  @ApiPropertyOptional({
    type: () => AlarmeMqttMessageSummaryDto,
    nullable: true,
  })
  mqtt_mensagem!: AlarmeMqttMessageSummaryDto | null;
  @ApiPropertyOptional({
    type: () => AlarmeResponsibleUserSummaryDto,
    nullable: true,
  })
  usuario_responsavel!: AlarmeResponsibleUserSummaryDto | null;
}

class AlarmeCountBySeverityDto {
  @ApiProperty({ enum: ALARM_SEVERITIES }) severidade!: string;
  @ApiProperty() total!: number;
}

class AlarmeCountByStatusDto {
  @ApiProperty({ enum: ALARM_STATUSES }) status_alarme!: string;
  @ApiProperty() total!: number;
}

class AlarmeCountByTypeDto {
  @ApiProperty({ enum: ALARM_TYPES }) tipo_alarme!: string;
  @ApiProperty() total!: number;
}

class AlarmeCountByOriginDto {
  @ApiProperty({ enum: ALARM_ORIGINS }) origem_alarme!: string;
  @ApiProperty() total!: number;
}

export class AlarmeDashboardResponseDto {
  @ApiProperty() total!: number;
  @ApiProperty() ativos!: number;
  @ApiProperty() resolvidos!: number;
  @ApiProperty() criticos!: number;
  @ApiProperty() medios!: number;
  @ApiProperty() infos!: number;
  @ApiProperty({ type: () => [AlarmeCountBySeverityDto] })
  por_severidade!: AlarmeCountBySeverityDto[];
  @ApiProperty({ type: () => [AlarmeCountByStatusDto] })
  por_status!: AlarmeCountByStatusDto[];
  @ApiProperty({ type: () => [AlarmeCountByTypeDto] })
  por_tipo!: AlarmeCountByTypeDto[];
  @ApiProperty({ type: () => [AlarmeCountByOriginDto] })
  por_origem!: AlarmeCountByOriginDto[];
  @ApiProperty({ type: () => [AlarmeResponseDto] })
  ultimos_criticos!: AlarmeResponseDto[];
  @ApiProperty({ type: () => [AlarmeResponseDto] })
  ultimos_ativos!: AlarmeResponseDto[];
  @ApiProperty({ type: String, format: 'date-time' }) generated_at!: Date;
}

export class ResolveAlarmeResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() id_alarme!: number;
  @ApiProperty({ enum: ['RESOLVED'] }) action!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: String, format: 'date-time' }) occurred_at!: Date;
  @ApiProperty({ enum: ['RESOLVIDO'] }) status_alarme!: string;
  @ApiProperty({ type: String, format: 'date-time' }) resolvido_em!: Date;
  @ApiProperty() id_usuario_responsavel!: number;
}

export class AcknowledgeAlarmeResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() id_alarme!: number;
  @ApiProperty({ enum: ['ACKNOWLEDGED'] }) action!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: String, format: 'date-time' }) occurred_at!: Date;
  @ApiProperty({ enum: ALARM_STATUSES }) status_alarme!: string;
  @ApiProperty({ type: String, format: 'date-time' }) reconhecido_em!: Date;
  @ApiProperty() id_usuario!: number;
}
