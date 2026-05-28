import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { HardwareCommand } from '../enums/hardware-commands.enum';

export class MqttCommandDTO {
  @IsNotEmpty()
  @IsEnum(HardwareCommand)
  comando!: HardwareCommand;

  @IsOptional()
  @IsInt()
  id_tanque?: number;

  @IsOptional()
  @IsInt()
  id_bomba?: number;

  @IsOptional()
  @IsInt()
  id_processo?: number;

  @IsNotEmpty()
  @IsString()
  origem!: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
