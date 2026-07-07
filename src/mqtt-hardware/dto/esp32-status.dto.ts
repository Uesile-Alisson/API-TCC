import { statusgeralsistema } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
} from 'class-validator';

export class Esp32StatusDTO {
  @IsOptional()
  @IsString()
  tipo?: 'HARDWARE_STATUS';

  @IsOptional()
  @IsInt()
  schema_version?: number;

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
  valvulas?: Record<string, unknown>;

  @IsOptional()
  tanques?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  bombas?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  acoplamentos?: Record<string, unknown>[];

  @IsDateString()
  @IsNotEmpty()
  enviado_em!: Date | string;
}
