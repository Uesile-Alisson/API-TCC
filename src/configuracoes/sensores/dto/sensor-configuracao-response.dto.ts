import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { protocolosensor, statussensor, tiposensor } from '@prisma/client';

export class SensorConfiguracaoResponseDto {
  @ApiProperty({ example: 1 })
  id_sensor!: number;

  @ApiProperty({ example: 'Sensor Vacuo 01' })
  nome!: string;

  @ApiProperty({ example: 'MPX5700' })
  modelo!: string;

  @ApiProperty({ enum: protocolosensor })
  protocolo!: protocolosensor;

  @ApiProperty({ example: 'kPa' })
  unidade_medida!: string;

  @ApiPropertyOptional({ example: 0.01, nullable: true })
  precisao!: number | null;

  @ApiProperty({ enum: statussensor })
  status_sensor!: statussensor;

  @ApiProperty({ enum: tiposensor })
  tipo_sensor!: tiposensor;

  @ApiPropertyOptional({ example: 1, nullable: true })
  fator_calibracao!: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: Date;
}
