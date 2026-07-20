import {
  Equals,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS } from '../interfaces/esp32-contracts.interface';
import type { Esp32MqttSchemaVersion } from '../interfaces/esp32-contracts.interface';

export class Esp32ReadingDTO {
  @IsOptional()
  @IsString()
  @Equals('SENSOR_READING')
  tipo?: 'SENSOR_READING';

  @IsOptional()
  @IsInt()
  @IsIn(ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS)
  schema_version?: Esp32MqttSchemaVersion;

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsString()
  modo?: string;

  @IsOptional()
  @IsInt()
  id_sensor?: number;

  @IsOptional()
  @IsInt()
  id_processo?: number;

  @IsOptional()
  @IsInt()
  id_processo_tanque?: number;

  @IsOptional()
  @IsInt()
  id_tanque?: number;

  @ValidateIf((dto: Esp32ReadingDTO) => dto.modo !== 'DIAGNOSTICO')
  @IsInt()
  @IsNotEmpty()
  id_processo_tanque_sensor?: number;

  @IsOptional()
  @IsString()
  codigo_hardware?: string;

  @IsOptional()
  @IsNumber()
  valor_vacuo?: number;

  @IsOptional()
  @IsNumber()
  valor?: number;

  @IsOptional()
  @IsString()
  unidade_medida?: string;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsOptional()
  @IsDateString()
  leitura_em?: Date | string;

  @IsOptional()
  @IsDateString()
  timestamp?: Date | string;
}
