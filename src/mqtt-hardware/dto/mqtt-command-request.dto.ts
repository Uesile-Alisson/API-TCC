import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import type { CommandQos } from '../commands/interfaces/command-options.interface';

export class MqttCommandRequestDto {
  @ApiPropertyOptional({
    example: 'interface-operacao-20260715-0001',
    description:
      'Chave idempotente opcional. Repetições com o mesmo valor reutilizam o ACK anterior e não republicam o comando.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  correlation_id?: string;

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

export class MqttEmergencyStopRequestDto extends MqttCommandRequestDto {
  @ApiPropertyOptional({
    example: 42,
    description:
      'Processo alvo. Se omitido, a API resolve o unico processo em partida, execucao, pausa ou parada ainda nao confirmada.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  id_processo?: number;
}
