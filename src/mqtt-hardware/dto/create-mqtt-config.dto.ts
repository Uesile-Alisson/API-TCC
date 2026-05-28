import {
  IsBoolean,
  IsInt,
  IsString,
  IsNotEmpty,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class CreateMqttConfigDTO {
  @IsString()
  @IsNotEmpty()
  broker_url!: string;

  @IsInt()
  @IsNotEmpty()
  @Max(65535)
  porta!: number;

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

  @IsBoolean()
  @IsNotEmpty()
  retain_padrao!: boolean;

  @IsBoolean()
  reconexao_auto!: boolean;

  @IsInt()
  @IsNotEmpty()
  @Min(1000)
  timeout_comunicacao!: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
