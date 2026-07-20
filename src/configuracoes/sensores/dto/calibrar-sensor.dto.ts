import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CalibrarSensorDto {
  @ApiProperty({
    example: -50,
    description: 'Valor rastreavel aplicado como referencia na calibracao.',
  })
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  valor_referencia!: number;

  @ApiPropertyOptional({
    example: -49.8,
    description:
      'Valor bruto observado. Quando omitido, usa a ultima leitura diagnostica do sensor.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  valor_observado?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  offset_calibracao?: number;

  @ApiProperty({ example: 'Padrao de referencia LAB-2026-014' })
  @IsString()
  @MaxLength(500)
  referencia!: string;

  @ApiPropertyOptional({ example: 0.05, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 4 })
  @Min(0)
  incerteza?: number;

  @ApiPropertyOptional({
    example: '2027-07-16T00:00:00.000Z',
    description:
      'Validade definida pelo plano metrologico; nao existe intervalo universal.',
  })
  @IsOptional()
  @IsDateString()
  valida_ate?: string;

  @ApiPropertyOptional({ example: 'Calibracao de um ponto em bancada.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacoes?: string;
}
