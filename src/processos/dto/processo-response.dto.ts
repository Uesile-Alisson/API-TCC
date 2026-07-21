import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProcessoRecordResponseDto {
  @ApiProperty() id_processo!: number;
  @ApiProperty() id_usuario!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_processo!:
    | string
    | null;
  @ApiProperty() status_processo!: string;
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
  @ApiProperty() parada_emergencia!: boolean;
  @ApiProperty() modo_operacao_auxiliar!: string;
  @ApiProperty() encerramento_automatico!: boolean;
  @ApiProperty() encerramento_versao!: number;
  @ApiProperty() status_encerramento_geral!: string;
  @ApiProperty() etapa_encerramento_geral!: string;
  @ApiProperty({ type: String, format: 'date-time' }) criado_em!: Date;
  @ApiProperty() fase_processo!: string;
}

export class ProcessoDetailsResponseDto extends ProcessoRecordResponseDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  usuarios?: Record<string, unknown> | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  processosauxiliares?: Record<string, unknown> | null;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  processostanques!: Record<string, unknown>[];
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  alarmes!: Record<string, unknown>[];
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  eventos!: Record<string, unknown>[];
}

class ProcessoPaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class ProcessoListResponseDto {
  @ApiProperty({ type: () => [ProcessoDetailsResponseDto] })
  data!: ProcessoDetailsResponseDto[];
  @ApiProperty({ type: () => ProcessoPaginationMetaDto })
  meta!: ProcessoPaginationMetaDto;
}

export class ProcessoActionResultResponseDto {
  @ApiProperty() success!: boolean;
  @ApiProperty() message!: string;
  @ApiProperty() id_processo!: number;
  @ApiProperty() status_processo!: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  data?: unknown;
}

class ProcessoAuxiliarControlHolderDto {
  @ApiProperty() id_usuario!: number;
  @ApiProperty() nome!: string;
  @ApiProperty() login!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  assumido_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  expira_em!: Date | null;
}

class ProcessoAuxiliarPumpStateDto {
  @ApiProperty() id_bomba!: number;
  @ApiProperty() nome!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) codigo_hardware!:
    | string
    | null;
  @ApiProperty() status_configuracao!: string;
  @ApiPropertyOptional({ type: Boolean, nullable: true }) ligada_hardware!:
    | boolean
    | null;
  @ApiPropertyOptional({ type: Boolean, nullable: true }) disponivel_hardware!:
    | boolean
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultimo_status_hardware_em!: Date | null;
  @ApiPropertyOptional({
    type: () => ProcessoAuxiliarControlHolderDto,
    nullable: true,
  })
  controle!: ProcessoAuxiliarControlHolderDto | null;
}

class ProcessoAuxiliarValveStateDto {
  @ApiProperty() id_valvula!: number;
  @ApiProperty() nome!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) codigo_hardware!:
    | string
    | null;
  @ApiProperty() status_valvula!: string;
  @ApiProperty() ativa!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultimo_acionamento!: Date | null;
  @ApiPropertyOptional({
    type: () => ProcessoAuxiliarControlHolderDto,
    nullable: true,
  })
  controle!: ProcessoAuxiliarControlHolderDto | null;
}

class ProcessoAuxiliarTankStateDto {
  @ApiProperty() id_processo_tanque_auxiliar!: number;
  @ApiProperty() id_processo_tanque!: number;
  @ApiProperty() id_tanque!: number;
  @ApiProperty() nome_tanque!: string;
  @ApiProperty() status_auxilio!: string;
  @ApiProperty() prioridade!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) posicao_fila!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  solicitado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  iniciado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finalizado_em!: Date | null;
  @ApiProperty() versao!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) motivo_bloqueio!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ultimo_erro!:
    | string
    | null;
  @ApiPropertyOptional({
    type: () => ProcessoAuxiliarValveStateDto,
    nullable: true,
  })
  valvula_auxiliar!: ProcessoAuxiliarValveStateDto | null;
}

class ProcessoAuxiliarCurrentTankDto {
  @ApiProperty() id_processo_tanque!: number;
  @ApiProperty() id_tanque!: number;
  @ApiProperty() nome_tanque!: string;
}

export class ProcessoAuxiliarStateResponseDto {
  @ApiProperty() id_processo!: number;
  @ApiProperty() modo_operacao_auxiliar!: string;
  @ApiProperty() status_subsistema!: string;
  @ApiProperty() versao!: number;
  @ApiPropertyOptional({
    type: () => ProcessoAuxiliarCurrentTankDto,
    nullable: true,
  })
  tanque_em_atendimento!: ProcessoAuxiliarCurrentTankDto | null;
  @ApiPropertyOptional({
    type: () => ProcessoAuxiliarPumpStateDto,
    nullable: true,
  })
  bomba_auxiliar!: ProcessoAuxiliarPumpStateDto | null;
  @ApiProperty({ type: () => [ProcessoAuxiliarTankStateDto] })
  tanques!: ProcessoAuxiliarTankStateDto[];
  @ApiPropertyOptional({ type: String, nullable: true }) motivo_bloqueio!:
    | string
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) ultimo_erro!:
    | string
    | null;
  @ApiProperty({ type: String, format: 'date-time' }) atualizado_em!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) snapshot_at!: Date;
}

export class ProcessoAuxiliarMutationResponseDto {
  @ApiProperty({ enum: [true] }) success!: true;
  @ApiProperty() message!: string;
  @ApiPropertyOptional() resource?: string;
  @ApiPropertyOptional() operation?: string;
  @ApiPropertyOptional() action?: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_processo?:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_processo_tanque?:
    | number
    | null;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  lease?: Record<string, unknown>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  command?: Record<string, unknown>;
  @ApiPropertyOptional({
    type: () => ProcessoAuxiliarStateResponseDto,
    nullable: true,
  })
  auxiliary_state!: ProcessoAuxiliarStateResponseDto | null;
  @ApiPropertyOptional() auxiliary_state_warning?: string;
}

export class ProcessoGeneralClosureStateResponseDto {
  @ApiProperty() status!: string;
  @ApiProperty() etapa!: string;
  @ApiProperty() automatico!: boolean;
  @ApiProperty() pronto_para_iniciar!: boolean;
  @ApiProperty() aguardando_acao_manual!: boolean;
  @ApiProperty() hardware_confirmado!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  iniciado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  finalizado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  confirmacao_iniciada_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  proxima_tentativa_em!: Date | null;
  @ApiProperty() tentativa!: number;
  @ApiProperty() comando_tentativas!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) ultimo_erro!:
    | string
    | null;
  @ApiProperty() versao!: number;
}

export class ProcessoGeneralClosureStartResponseDto {
  @ApiProperty({ enum: [true] }) success!: true;
  @ApiProperty() message!: string;
  @ApiProperty() id_processo!: number;
  @ApiProperty({ type: () => ProcessoGeneralClosureStateResponseDto })
  encerramento!: ProcessoGeneralClosureStateResponseDto;
}

export class ProcessoTankClosureStateResponseDto {
  @ApiProperty() status!: string;
  @ApiProperty() etapa!: string;
  @ApiProperty() automatico!: boolean;
  @ApiProperty() pronto_para_encerrar!: boolean;
  @ApiProperty() aguardando_acao_manual!: boolean;
  @ApiProperty() pode_desacoplar!: boolean;
  @ApiPropertyOptional({ type: Boolean, nullable: true }) mangueira_acoplada!:
    | boolean
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  iniciado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  isolado_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  retencao_iniciada_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  retencao_finalizada_em!: Date | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_isolamento!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) perda_vacuo_retencao!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) motivo_bloqueio!:
    | string
    | null;
  @ApiProperty() versao!: number;
  @ApiProperty() tentativa!: number;
  @ApiProperty() comando_tentativas!: number;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  proxima_tentativa_em!: Date | null;
}

export class ProcessoTankClosureStartResponseDto {
  @ApiProperty({ enum: [true] }) success!: true;
  @ApiProperty() message!: string;
  @ApiProperty() id_processo!: number;
  @ApiProperty() id_processo_tanque!: number;
  @ApiProperty({ type: () => ProcessoTankClosureStateResponseDto })
  encerramento!: ProcessoTankClosureStateResponseDto;
}

class ProcessoPrecheckCorrectiveActionResponseDto {
  @ApiProperty({
    enum: [
      'CALIBRAR_SENSOR',
      'CONTINUAR_CALIBRACAO_SENSOR',
      'LIBERAR_SENSOR',
      'ATIVAR_SENSOR',
      'AGUARDAR_TELEMETRIA_SENSOR',
      'DIAGNOSTICAR_SENSOR',
      'TESTAR_ESTADO_SEGURO_VALVULA',
      'REVISAR_CONFIGURACAO_VALVULA',
    ],
  })
  codigo!: string;
  @ApiProperty() titulo!: string;
  @ApiPropertyOptional({
    enum: ['GET', 'POST', 'PATCH'],
    nullable: true,
  })
  metodo!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) endpoint!:
    | string
    | null;
  @ApiProperty() disponivel!: boolean;
  @ApiProperty() requer_confirmacao!: boolean;
  @ApiProperty() reexecutar_prechecagem!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true })
  motivo_indisponibilidade!: string | null;
}

export class ProcessoPrecheckItemResponseDto {
  @ApiProperty() codigo!: string;
  @ApiProperty() titulo!: string;
  @ApiProperty() grupo!: string;
  @ApiProperty() status!: string;
  @ApiProperty() obrigatorio!: boolean;
  @ApiProperty() bloqueante!: boolean;
  @ApiProperty() mensagem!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) evidencia!:
    | string
    | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  detalhes!: Record<string, unknown> | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_recurso!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, nullable: true }) tipo_recurso!:
    | string
    | null;
  @ApiPropertyOptional({
    type: () => ProcessoPrecheckCorrectiveActionResponseDto,
    nullable: true,
  })
  acao_corretiva!: ProcessoPrecheckCorrectiveActionResponseDto | null;
  @ApiProperty({ type: String, format: 'date-time' }) timestamp!: Date;
}

class ProcessoPrecheckGroupResponseDto {
  @ApiProperty() grupo!: string;
  @ApiProperty({ enum: ['APROVADO', 'REPROVADO'] }) status!: string;
  @ApiProperty() aprovado!: boolean;
  @ApiProperty() total_itens!: number;
  @ApiProperty() total_bloqueantes!: number;
}

export class ProcessoPrecheckResponseDto {
  @ApiProperty() id_processo!: number;
  @ApiProperty({ enum: ['APROVADO', 'REPROVADO'] }) status_geral!: string;
  @ApiProperty() aprovado!: boolean;
  @ApiProperty() bloqueado!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) executado_em!: Date;
  @ApiProperty() validade_segundos!: number;
  @ApiProperty({ type: () => [ProcessoPrecheckGroupResponseDto] })
  grupos!: ProcessoPrecheckGroupResponseDto[];
  @ApiProperty({ type: () => [ProcessoPrecheckItemResponseDto] })
  itens!: ProcessoPrecheckItemResponseDto[];
  @ApiProperty({ type: [String] }) falhas_bloqueantes!: string[];
  @ApiProperty({ type: [String] }) avisos!: string[];
  @ApiProperty({ type: [String] }) recomendacoes!: string[];
}

export class ProcessoValveResponseDto {
  @ApiProperty() id_valvula!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) codigo_hardware!:
    | string
    | null;
  @ApiProperty() id_bomba!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) id_tanque!:
    | number
    | null;
  @ApiProperty() numero_saida_manifold!: number;
  @ApiProperty() nome_valvula!: string;
  @ApiProperty() status_valvula!: string;
  @ApiProperty() ativo!: boolean;
  @ApiProperty() funcao_valvula!: string;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultimo_acionamento!: Date | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) bomba!: Record<
    string,
    unknown
  >;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  tanque!: Record<string, unknown> | null;
}

export class ProcessoValveActionResponseDto {
  @ApiProperty() id_processo!: number;
  @ApiProperty() id_valvula!: number;
  @ApiProperty({ enum: ['VALIDAR', 'ABRIR', 'FECHAR'] }) acao!: string;
  @ApiProperty() status!: string;
  @ApiProperty() aprovado!: boolean;
  @ApiProperty() mensagem!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) evidencia!:
    | string
    | null;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  detalhes!: Record<string, unknown> | null;
  @ApiProperty({ type: String, format: 'date-time' }) executado_em!: Date;
}

export class ProcessoEmergencyStateResponseDto {
  @ApiProperty() ativa!: boolean;
  @ApiProperty() status!: string;
  @ApiProperty() etapa!: string;
  @ApiProperty() hardware_confirmado!: boolean;
  @ApiProperty() nivel_confirmacao!: string;
  @ApiProperty() latch_emergencia_confirmado!: boolean;
  @ApiProperty() saidas_controlador_confirmadas!: boolean;
  @ApiProperty() feedback_mecanico_disponivel!: boolean;
  @ApiProperty() requer_intervencao!: boolean;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  solicitada_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  confirmada_em!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  proxima_tentativa_em!: Date | null;
  @ApiProperty() tentativa!: number;
  @ApiProperty() comando_tentativas!: number;
  @ApiPropertyOptional({ type: String, nullable: true }) ultimo_erro!:
    | string
    | null;
  @ApiProperty() versao!: number;
}

class ProcessoEmergencyActionDataResponseDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  processo!: Record<string, unknown>;

  @ApiProperty({ type: () => ProcessoEmergencyStateResponseDto })
  parada_emergencia!: ProcessoEmergencyStateResponseDto;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  command_results!: Record<string, unknown>[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  command_failures!: Record<string, unknown>[];

  @ApiProperty()
  idempotent!: boolean;
}

export class ProcessoEmergencyActionResponseDto extends ProcessoActionResultResponseDto {
  @ApiProperty({ type: () => ProcessoEmergencyActionDataResponseDto })
  declare data: ProcessoEmergencyActionDataResponseDto;
}

class ProcessoDashboardTankResponseDto {
  @ApiProperty() id_processo_tanque!: number;
  @ApiProperty() id_tanque!: number;
  @ApiProperty() nome_tanque!: string;
  @ApiProperty() status_tanque_processo!: string;
  @ApiProperty() vacuo_atingido!: boolean;
  @ApiProperty() vacuo_estabilizado!: boolean;
  @ApiProperty() vacuo_alvo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_atual!:
    | number
    | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) eficiencia!:
    | number
    | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  ultima_leitura_em!: Date | null;
  @ApiProperty() total_sensores!: number;
  @ApiProperty() total_leituras!: number;
  @ApiProperty({ type: () => ProcessoTankClosureStateResponseDto })
  encerramento!: ProcessoTankClosureStateResponseDto;
  @ApiProperty({ type: 'object', additionalProperties: true })
  estagnacao!: Record<string, unknown>;
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  leituras!: Record<string, unknown>[];
}

export class ProcessoDashboardResponseDto {
  @ApiProperty() id_processo!: number;
  @ApiProperty({ type: String, format: 'date-time' }) snapshot_at!: Date;
  @ApiPropertyOptional({ type: String, nullable: true }) nome_processo!:
    | string
    | null;
  @ApiProperty() status_processo!: string;
  @ApiProperty() vacuo_alvo!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) vacuo_atual!:
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
  @ApiProperty() progresso_percentual!: number;
  @ApiProperty({ type: () => ProcessoEmergencyStateResponseDto })
  parada_emergencia!: ProcessoEmergencyStateResponseDto;
  @ApiProperty({ type: 'object', additionalProperties: true })
  encerramento!: Record<string, unknown>;
  @ApiProperty({ type: () => ProcessoAuxiliarStateResponseDto })
  subsistema_auxiliar!: ProcessoAuxiliarStateResponseDto;
  @ApiProperty({ type: () => [ProcessoDashboardTankResponseDto] })
  tanques!: ProcessoDashboardTankResponseDto[];
  @ApiProperty({ type: 'object', additionalProperties: true }) alarmes!: Record<
    string,
    unknown
  >;
}
