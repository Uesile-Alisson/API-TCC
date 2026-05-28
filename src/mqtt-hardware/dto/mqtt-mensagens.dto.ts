import { direcaomqtt, origemmqtt } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class MqttMensagensDTO {
  @IsString()
  @IsNotEmpty()
  topico: string;

  @IsObject()
  @IsNotEmpty()
  payload: Record<string, unknown>;

  @IsIn([0, 1, 2])
  @IsNotEmpty()
  qos: number;

  @IsBoolean()
  @IsNotEmpty()
  retain: boolean;

  @IsEnum(direcaomqtt)
  @IsNotEmpty()
  direcao: direcaomqtt;

  @IsEnum(origemmqtt)
  @IsNotEmpty()
  origem: origemmqtt;

  @IsOptional()
  @IsDateString()
  enviado_em: string;

  @IsOptional()
  @IsDateString()
  recebido_em: string;
}
