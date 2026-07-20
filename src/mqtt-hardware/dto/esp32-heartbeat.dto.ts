import {
  Equals,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { StatusHeartbeat } from '../enums/esp32-heartbeat.enum';
import { ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS } from '../interfaces/esp32-contracts.interface';
import type { Esp32MqttSchemaVersion } from '../interfaces/esp32-contracts.interface';

export class Esp32HeartbeatDTO {
  @IsOptional()
  @IsString()
  @Equals('HEARTBEAT')
  tipo?: 'HEARTBEAT';

  @IsOptional()
  @IsInt()
  @IsIn(ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS)
  schema_version?: Esp32MqttSchemaVersion;

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsString()
  device?: string;

  @IsOptional()
  @IsString()
  device_is?: string;

  @IsOptional()
  @IsString()
  firmware_version?: string;

  @IsOptional()
  @IsInt()
  uptime_ms?: number;

  @IsOptional()
  @IsInt()
  id_processo?: number;

  @IsString()
  @IsNotEmpty()
  @IsEnum(StatusHeartbeat)
  status!: StatusHeartbeat;

  @IsDateString()
  @IsNotEmpty()
  enviado_em!: string;
}
