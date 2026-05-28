import { severidadealarme, tipoalarme } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class Esp32AlarmDTO {
  @IsOptional()
  @IsInt()
  id_processo!: number;

  @IsOptional()
  @IsInt()
  id_processo_tanque!: number;

  @IsOptional()
  @IsInt()
  id_processo_tanque_sensor!: number;

  @IsEnum(tipoalarme)
  @IsNotEmpty()
  tipo_alarme!: tipoalarme;

  @IsEnum(severidadealarme)
  @IsNotEmpty()
  severidade!: severidadealarme;

  @IsString()
  @IsNotEmpty()
  titulo!: string;

  @IsString()
  @IsNotEmpty()
  descricao!: string;

  @IsNumber()
  @IsOptional()
  valor_detectado?: string;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsNotEmpty()
  @IsDateString()
  ocorrido_em: string;
}
