import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { CommandQos } from '../commands/interfaces/command-options.interface';

export class MqttCommandRequestDto {
  @ApiPropertyOptional({
    example: 'Solicitado manualmente pela interface do sistema.',
    description: 'Motivo operacional para registrar no payload do comando.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  motivo?: string;

  @ApiPropertyOptional({
    example: 1,
    enum: [0, 1, 2],
    description: 'QoS MQTT do comando. Se omitido, o service usa o padrão.',
  })
  @IsOptional()
  @IsIn([0, 1, 2])
  qos?: CommandQos;
}
