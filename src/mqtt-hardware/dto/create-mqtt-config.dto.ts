import {
  IsBoolean,
  IsInt,
  IsString,
  IsNotEmpty,
  IsOptional,
  Max,
  Min,
  IsDateString,
} from 'class-validator';

export class CreateMqttConfigDTO {
  @IsString()
  @IsNotEmpty()
  broker_url!: string;

  @IsInt()
  @IsNotEmpty()
  @Max(65535)
  porta!: number;

  @IsString()
  @IsOptional()
  usuario_mqtt?: string;

  @IsOptional()
  @IsString()
  senha_mqtt?: string;

  @IsString()
  @IsNotEmpty()
  topico_leituras!: string;

  @IsString()
  @IsNotEmpty()
  topico_comandos!: string;

  @IsString()
  @IsNotEmpty()
  topico_status!: string;

  @IsString()
  @IsNotEmpty()
  topico_alarmes!: string;

  @IsString()
  @IsNotEmpty()
  topico_heartbeat!: string;

  @IsString()
  @IsNotEmpty()
  topico_acoplamentos!: string;

  @IsBoolean()
  @IsNotEmpty()
  retain_padrao!: boolean;

  @IsBoolean()
  reconexao_automatica!: boolean;

  @IsInt()
  @IsNotEmpty()
  @Min(1000)
  timeout_comunicacao!: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsDateString()
  @IsNotEmpty()
  criado_em!: string;
}
