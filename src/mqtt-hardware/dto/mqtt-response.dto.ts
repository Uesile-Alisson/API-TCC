import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { statusconexaomqtt, statusgeralsistema } from '@prisma/client';

export class MqttConfigResponseDto {
  @ApiProperty({ example: 1 })
  id_mqtt_configuracao!: number;

  @ApiProperty({ nullable: true, example: 7 })
  id_usuario_alteracao!: number | null;

  @ApiProperty({ example: 'mqtt://localhost' })
  broker_url!: string;

  @ApiProperty({ example: 1883 })
  porta!: number;

  @ApiProperty()
  usuario_mqtt_configurado!: boolean;

  @ApiProperty()
  senha_mqtt_configurada!: boolean;

  @ApiProperty()
  credenciais_configuradas!: boolean;

  @ApiProperty()
  credenciais_verificadas!: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  credenciais_verificadas_em!: Date | null;

  @ApiProperty({ nullable: true })
  ultima_falha_credenciais!: string | null;

  @ApiProperty({ example: 'tsea/leituras' })
  topico_leituras!: string;

  @ApiProperty({ example: 'tsea/comandos' })
  topico_comandos!: string;

  @ApiProperty({ example: 'tsea/status' })
  topico_status!: string;

  @ApiProperty({ example: 'tsea/alarmes' })
  topico_alarmes!: string;

  @ApiProperty({ example: 'tsea/heartbeat' })
  topico_heartbeat!: string;

  @ApiProperty({ example: 'tsea/acoplamentos' })
  topico_acoplamentos!: string;

  @ApiProperty({ example: 'tsea/config' })
  topico_configuracoes!: string;

  @ApiProperty({ example: 'tsea/acks' })
  topico_acks!: string;

  @ApiProperty()
  reconexao_automatica!: boolean;

  @ApiProperty({ example: 10000 })
  timeout_comunicacao!: number;

  @ApiProperty({ enum: statusconexaomqtt })
  status_conexao!: statusconexaomqtt;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  ultima_conexao!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  ultima_sincronizacao!: Date | null;

  @ApiProperty({ nullable: true })
  ultima_falha!: string | null;

  @ApiProperty()
  ativo!: boolean;

  @ApiProperty()
  connected!: boolean;

  @ApiProperty()
  configuracao_aplicada!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  atualizado_em!: Date;
}

export class MqttCredentialsUpdateResponseDto {
  @ApiProperty({ enum: [true] })
  credenciais_atualizadas!: true;

  @ApiProperty()
  usuario_mqtt_configurado!: boolean;

  @ApiProperty()
  senha_mqtt_configurada!: boolean;

  @ApiProperty()
  credenciais_configuradas!: boolean;

  @ApiProperty()
  credenciais_verificadas!: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  credenciais_verificadas_em!: Date | null;

  @ApiProperty({ nullable: true })
  ultima_falha_credenciais!: string | null;

  @ApiProperty()
  connected!: boolean;

  @ApiProperty({ enum: statusconexaomqtt })
  status_conexao!: statusconexaomqtt;

  @ApiProperty()
  mensagem!: string;

  @ApiProperty({ nullable: true })
  erro_conexao!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  atualizado_em!: Date;
}

export class MqttConnectionTestResponseDto {
  @ApiProperty()
  connected!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  checked_at!: Date;

  @ApiProperty()
  message!: string;
}

export class MqttConnectionActionResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty({ nullable: true })
  error!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  executed_at!: Date;
}

export class MqttCommandResultResponseDto {
  @ApiProperty({ example: 'SINCRONIZAR_HARDWARE' })
  comando!: string;

  @ApiProperty({ example: 'tsea/comandos' })
  topic!: string;

  @ApiProperty({ enum: [0, 1, 2] })
  qos!: 0 | 1 | 2;

  @ApiProperty()
  retain!: boolean;

  @ApiProperty({ format: 'uuid' })
  correlation_id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  published_at!: Date;

  @ApiPropertyOptional()
  acknowledged?: boolean;

  @ApiPropertyOptional({ enum: ['EXECUTADO'] })
  ack_status?: 'EXECUTADO';

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  ack_received_at?: Date;

  @ApiPropertyOptional({ nullable: true })
  ack_message?: string | null;

  @ApiPropertyOptional()
  reused_ack?: boolean;
}

export class MqttCommandExecutionResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty({ type: MqttCommandResultResponseDto })
  command!: MqttCommandResultResponseDto;

  @ApiProperty({ type: String, format: 'date-time' })
  executed_at!: Date;
}

export class MqttHardwareStateResponseDto {
  @ApiProperty()
  mqttConnected!: boolean;

  @ApiProperty()
  esp32Online!: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastHeartbeatAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastStatusAt!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  lastReadingAt!: Date | null;

  @ApiProperty({ nullable: true, enum: statusgeralsistema })
  currentStatus!: statusgeralsistema | null;

  @ApiProperty({ nullable: true })
  lastError!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  enviado_em?: Date;
}

export class MqttPublicStateResponseDto {
  @ApiProperty()
  connected!: boolean;

  @ApiProperty()
  operacional!: boolean;

  @ApiProperty()
  configuracao_aplicada!: boolean;

  @ApiProperty({ enum: statusconexaomqtt })
  status_conexao!: statusconexaomqtt;

  @ApiProperty()
  broker_url!: string;

  @ApiProperty()
  porta!: number;

  @ApiProperty()
  usuario_mqtt_configurado!: boolean;

  @ApiProperty()
  senha_mqtt_configurada!: boolean;

  @ApiProperty()
  credenciais_configuradas!: boolean;

  @ApiProperty()
  credenciais_verificadas!: boolean;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  credenciais_verificadas_em!: Date | null;

  @ApiProperty({ nullable: true })
  ultima_falha_credenciais!: string | null;

  @ApiProperty()
  topico_comandos!: string;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  ultima_conexao!: Date | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  ultima_sincronizacao!: Date | null;

  @ApiProperty({ nullable: true })
  ultima_falha!: string | null;

  @ApiProperty()
  ativo!: boolean;
}

export class MqttHardwareStatusResponseDto {
  @ApiProperty({ type: MqttPublicStateResponseDto })
  mqtt!: MqttPublicStateResponseDto;

  @ApiProperty({ type: MqttHardwareStateResponseDto })
  hardware!: MqttHardwareStateResponseDto;

  @ApiProperty({ enum: statusconexaomqtt })
  status_conexao!: statusconexaomqtt;

  @ApiProperty()
  esp32_online!: boolean;

  @ApiProperty()
  comunicacao_pronta_para_processos!: boolean;

  @ApiProperty({ type: [String] })
  bloqueios_comunicacao_processos!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  consultado_em!: Date;
}

export class MqttEmergencyStopResponseDto {
  @ApiProperty({ enum: [true] })
  success!: true;

  @ApiProperty()
  message!: string;

  @ApiProperty({
    type: 'object',
    description:
      'Resultado coordenado: escopo, persistencia, confirmacao, comandos e eventuais falhas.',
    additionalProperties: true,
  })
  emergency!: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  executed_at!: Date;
}
