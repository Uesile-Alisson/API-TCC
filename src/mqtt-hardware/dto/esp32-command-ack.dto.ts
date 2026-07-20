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
import { MQTT_COMMANDS } from '../commands/interfaces/command-name.interface';
import { ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS } from '../interfaces/esp32-contracts.interface';
import type { Esp32MqttSchemaVersion } from '../interfaces/esp32-contracts.interface';

export enum Esp32CommandAckStatus {
  RECEBIDO = 'RECEBIDO',
  EXECUTADO = 'EXECUTADO',
  RECUSADO = 'RECUSADO',
  ERRO = 'ERRO',
}

export class Esp32CommandAckDTO {
  @IsString()
  @IsNotEmpty()
  @Equals('ACK')
  tipo!: 'ACK';

  @IsInt()
  @IsNotEmpty()
  @IsIn(ESP32_MQTT_SUPPORTED_SCHEMA_VERSIONS)
  schema_version!: Esp32MqttSchemaVersion;

  @IsString()
  @IsNotEmpty()
  correlation_id!: string;

  @IsEnum(MQTT_COMMANDS)
  comando!: string;

  @IsEnum(Esp32CommandAckStatus)
  status!: Esp32CommandAckStatus;

  @IsOptional()
  @IsString()
  codigo_hardware?: string;

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsInt()
  id_processo?: number;

  @IsOptional()
  @IsInt()
  id_processo_tanque?: number;

  @IsOptional()
  @IsInt()
  id_tanque?: number;

  @IsOptional()
  @IsInt()
  id_bomba?: number;

  @IsOptional()
  @IsInt()
  id_valvula?: number;

  @IsOptional()
  @IsString()
  mensagem?: string;

  @IsOptional()
  @IsString()
  erro?: string;

  @IsDateString()
  @IsNotEmpty()
  recebido_em!: string;
}
