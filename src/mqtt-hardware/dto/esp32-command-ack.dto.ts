import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { MQTT_COMMANDS } from '../commands/interfaces/command-name.interface';

export enum Esp32CommandAckStatus {
  RECEBIDO = 'RECEBIDO',
  EXECUTADO = 'EXECUTADO',
  RECUSADO = 'RECUSADO',
  ERRO = 'ERRO',
}

export class Esp32CommandAckDTO {
  @IsString()
  @IsNotEmpty()
  tipo!: 'ACK';

  @IsInt()
  @IsNotEmpty()
  schema_version!: number;

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
  @IsInt()
  id_processo?: number;

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
