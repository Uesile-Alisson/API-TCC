import { severidadealarme, tipoalarme, origemalarme } from '@prisma/client';
import {
  Equals,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS } from '../interfaces/esp32-contracts.interface';
import type { Esp32MqttSchemaVersion } from '../interfaces/esp32-contracts.interface';

export class Esp32AlarmDTO {
  @IsOptional()
  @IsString()
  @Equals('ALARME_HARDWARE')
  tipo?: 'ALARME_HARDWARE';

  @IsOptional()
  @IsInt()
  @IsIn(ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS)
  schema_version?: Esp32MqttSchemaVersion;

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsString()
  codigo_hardware?: string;

  @IsOptional()
  @IsInt()
  id_sensor?: number;

  @IsOptional()
  @IsInt()
  id_tanque?: number;

  @IsOptional()
  @IsInt()
  id_processo!: number;

  @IsOptional()
  @IsInt()
  id_processo_tanque!: number;

  @IsOptional()
  @IsInt()
  id_processo_tanque_sensor!: number;

  @IsEnum(tipoalarme)
  @IsNotEmpty()
  tipo_alarme!: tipoalarme;

  @IsOptional()
  @IsEnum(origemalarme)
  origem_alarme?: origemalarme;

  @IsEnum(severidadealarme)
  @IsNotEmpty()
  severidade!: severidadealarme;

  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @IsString()
  @IsNotEmpty()
  descricao!: string;

  @IsNumber()
  @IsOptional()
  valor_detectado?: number;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsNotEmpty()
  @IsDateString()
  ocorrido_em: string;
}
