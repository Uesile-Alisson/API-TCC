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
  id_processo_tanque_sensor: number;

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
