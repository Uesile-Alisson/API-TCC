import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { statussensor, tiposensor } from '@prisma/client';

export class SensorProcessoOptionResponseDto {
  @ApiProperty({ example: 1 })
  id_sensor!: number;

  @ApiProperty({ example: 5 })
  id_tanque!: number;

  @ApiProperty({ example: 'Sensor Vacuo 01 - MPX5700' })
  label!: string;

  @ApiProperty({ example: 'Sensor Vacuo 01' })
  nome!: string;

  @ApiProperty({ example: 'MPX5700' })
  modelo!: string;

  @ApiProperty({ enum: tiposensor })
  tipo_sensor!: tiposensor;

  @ApiProperty({ enum: statussensor })
  status_sensor!: statussensor;

  @ApiPropertyOptional({ example: 'kPa' })
  unidade_medida!: string;
}
