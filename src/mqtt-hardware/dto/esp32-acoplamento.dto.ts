import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS } from '../interfaces/esp32-contracts.interface';
import type { Esp32MqttSchemaVersion } from '../interfaces/esp32-contracts.interface';

export class Esp32AcoplamentoDTO {
  @IsOptional()
  @IsString()
  @Equals('ACOPLAMENTO_STATUS')
  tipo?: 'ACOPLAMENTO_STATUS';

  @IsOptional()
  @IsInt()
  @IsIn(ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS)
  schema_version?: Esp32MqttSchemaVersion;

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsInt()
  id_processo?: number;

  @IsOptional()
  @IsInt()
  id_processo_tanque?: number;

  @IsInt()
  @Min(1)
  id_sensor: number;

  @IsInt()
  @Min(1)
  id_tanque: number;

  @IsBoolean()
  sinal_detectado: boolean;

  @IsOptional()
  @IsString()
  codigo_hardware?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  verificado_em: Date;
}
