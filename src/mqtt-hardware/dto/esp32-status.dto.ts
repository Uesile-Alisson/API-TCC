import { statusgeralsistema, StatusValvula } from '@prisma/client';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsIn,
  IsArray,
  Min,
} from 'class-validator';
import { ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS } from '../interfaces/esp32-contracts.interface';
import type { Esp32MqttSchemaVersion } from '../interfaces/esp32-contracts.interface';

export class Esp32StatusValveDTO {
  @IsOptional()
  @IsInt()
  @Min(1)
  id_valvula?: number;

  @IsString()
  @IsNotEmpty()
  codigo_hardware!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  id_tanque?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  numero_saida_manifold?: number;

  @IsOptional()
  @IsIn(['PRINCIPAL', 'AUXILIAR', 'OUTRA'])
  tipo?: 'PRINCIPAL' | 'AUXILIAR' | 'OUTRA';

  @IsEnum(StatusValvula)
  status_valvula!: StatusValvula;

  @IsBoolean()
  ack!: boolean;

  @IsBoolean()
  falha!: boolean;

  @IsOptional()
  @IsBoolean()
  disponivel?: boolean;

  @IsOptional()
  @IsBoolean()
  aberta?: boolean;
}

export class Esp32StatusPumpDTO {
  @IsOptional()
  @IsInt()
  @Min(1)
  id_bomba?: number;

  @IsString()
  @IsNotEmpty()
  codigo_hardware!: string;

  @IsBoolean()
  ligada!: boolean;

  @IsBoolean()
  disponivel!: boolean;

  @IsOptional()
  @IsBoolean()
  falha?: boolean;
}

export class Esp32StatusDTO {
  @IsOptional()
  @IsString()
  @Equals('HARDWARE_STATUS')
  tipo?: 'HARDWARE_STATUS';

  @IsOptional()
  @IsInt()
  @IsIn(ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS)
  schema_version?: Esp32MqttSchemaVersion;

  @IsBoolean()
  @IsNotEmpty()
  esp32_on!: boolean;

  @IsNotEmpty()
  @IsEnum(statusgeralsistema)
  status_geral: statusgeralsistema;

  @IsOptional()
  @IsString()
  mensagem: string;

  @IsOptional()
  @IsString()
  device_id: string;

  @IsOptional()
  @IsString()
  device?: string;

  @IsOptional()
  @IsString()
  firmware_version?: string;

  @IsOptional()
  @IsBoolean()
  emergencia_ativa?: boolean;

  @IsOptional()
  @IsString()
  erro_atual?: string;

  @IsOptional()
  @IsString()
  bomba_principal?: string;

  @IsOptional()
  @IsString()
  bomba_auxiliar?: string;

  @IsOptional()
  @IsInt()
  sensores_ativos?: number;

  @IsOptional()
  valvulas?: Esp32StatusValveDTO[] | Record<string, unknown>;

  @IsOptional()
  tanques?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  bombas?: Esp32StatusPumpDTO[];

  @IsOptional()
  @IsArray()
  acoplamentos?: Record<string, unknown>[];

  @IsDateString()
  @IsNotEmpty()
  enviado_em!: Date | string;
}
