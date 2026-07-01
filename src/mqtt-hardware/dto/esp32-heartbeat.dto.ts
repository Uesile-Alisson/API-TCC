import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { StatusHeartbeat } from '../enums/esp32-heartbeat.enum';

export class Esp32HeartbeatDTO {
  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsString()
  device_is?: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(StatusHeartbeat)
  status!: StatusHeartbeat;

  @IsDateString()
  @IsNotEmpty()
  enviado_em!: string;
}
