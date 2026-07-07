import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class Esp32ReadingDTO {
  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsInt()
  schema_version?: number;

  @IsOptional()
  @IsString()
  modo?: string;

  @IsOptional()
  @IsInt()
  id_sensor?: number;

  @ValidateIf((dto: Esp32ReadingDTO) => dto.modo !== 'DIAGNOSTICO')
  @IsInt()
  @IsNotEmpty()
  id_processo_tanque_sensor?: number;

  @IsOptional()
  @IsString()
  codigo_hardware?: string;

  @IsOptional()
  @IsNumber()
  valor_vacuo?: number;

  @IsOptional()
  @IsNumber()
  valor?: number;

  @IsOptional()
  @IsString()
  unidade_medida?: string;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsOptional()
  @IsDateString()
  leitura_em?: Date;

  @IsOptional()
  @IsDateString()
  timestamp?: Date;
}
