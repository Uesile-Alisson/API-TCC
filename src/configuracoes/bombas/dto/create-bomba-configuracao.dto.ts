import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { statusbomba, tipobomba } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBombaConfiguracaoDto {
  @ApiProperty({ example: 'Bomba Principal', maxLength: 80 })
  @IsString({ message: 'nome deve ser texto.' })
  @MaxLength(80, { message: 'nome deve ter no maximo 80 caracteres.' })
  nome!: string;

  @ApiProperty({ enum: tipobomba, example: tipobomba.PRINCIPAL })
  @IsEnum(tipobomba, { message: 'tipo_bomba deve ser valido.' })
  tipo_bomba!: tipobomba;

  @ApiProperty({ enum: statusbomba, example: statusbomba.ATIVA })
  @IsEnum(statusbomba, { message: 'status_padrao deve ser valido.' })
  status_padrao!: statusbomba;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'entrada_por_pressao deve ser booleano.' })
  entrada_por_pressao?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean({ message: 'entrada_por_tempo deve ser booleano.' })
  entrada_por_tempo?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean({ message: 'encerramento_automatico deve ser booleano.' })
  encerramento_automatico?: boolean;
}
