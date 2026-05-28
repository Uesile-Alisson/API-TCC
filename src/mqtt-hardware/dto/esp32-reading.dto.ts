import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
} from 'class-validator';

export class Esp32ReadingDTO {
  @IsInt()
  @IsNotEmpty()
  id_tanque: number;

  @IsInt()
  @IsNotEmpty()
  id_sensor: number;

  @IsInt()
  @IsNotEmpty()
  id_processo: number;

  @IsNumber()
  @IsNotEmpty()
  valor_vacuo: number;

  @IsString()
  @IsNotEmpty()
  unidade_medida: string;

  @IsDateString()
  @IsNotEmpty()
  leitura_em: string;
}
