import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class Esp32ReadingDTO {
  @IsInt()
  @IsNotEmpty()
  id_processo_tanque_sensor: number;

  @IsOptional()
  @IsString()
  codigo_hardware?: string;

  @IsNumber()
  @IsNotEmpty()
  valor_vacuo: number;

  @IsString()
  @IsNotEmpty()
  unidade_medida: string;

  @IsDateString()
  @IsNotEmpty()
  leitura_em: Date;
}
