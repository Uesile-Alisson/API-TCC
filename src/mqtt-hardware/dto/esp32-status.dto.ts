import { statusgeralsistema } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsEnum,
} from 'class-validator';

export class Esp32StatusDTO {
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
  bomba_principal?: string;

  @IsOptional()
  @IsString()
  bomba_auxiliar?: string;

  @IsOptional()
  @IsInt()
  sensores_ativos?: number;

  @IsOptional()
  @IsObject()
  valvulas?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  tanques?: Record<string, unknown>;

  @IsDateString()
  @IsNotEmpty()
  enviado_em!: Date | string;
}
