import { IsDateString, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { StatusHeartbeat } from '../enums/esp32-heartbeat.enum';

export class Esp32HeartbeatDTO {
  @IsString()
  @IsNotEmpty()
  device_is!: string;

  @IsString()
  @IsNotEmpty()
  @IsEnum(StatusHeartbeat)
  status!: StatusHeartbeat;

  @IsDateString()
  @IsNotEmpty()
  enviado_em!: string;
}
