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

  @IsString()
  @IsOptional()
  topico_configuracoes?: string;

  @IsString()
  @IsOptional()
  topico_acks?: string;

  @IsBoolean()
  @IsNotEmpty()
  retain_padrao!: boolean;

  @IsBoolean()
  reconexao_automatica!: boolean;

  @IsInt()
  @IsNotEmpty()
  @Min(1000)
  @Max(120000)
  timeout_comunicacao!: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsDateString()
  @IsNotEmpty()
  criado_em!: string;
}
