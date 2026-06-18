import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ParadaEmergenciaProcessoDTO {
  @ApiProperty({
    example: 'Mangueira desacoplada durante o processo.',
    description:
      'Motivo da parada de emergência. Pode vir de ação manual ou de regra automática do sistema.',
  })
  @IsString({ message: 'O motivo deve ser um texto.' })
  @MinLength(3, {
    message: 'O motivo deve ter pelo menos 3 caracteres.',
  })
  @MaxLength(500, {
    message: 'O motivo deve ter no máximo 500 caracteres.',
  })
  motivo: string;

  @ApiPropertyOptional({
    example:
      'Parada acionada automaticamente após leitura crítica do acoplamento.',
    description: 'Detalhes adicionais da parada de emergência.',
  })
  @IsOptional()
  @IsString({ message: 'Os detalhes devem ser um texto.' })
  @MaxLength(500, {
    message: 'Os detalhes devem ter no máximo 500 caracteres.',
  })
  detalhes?: string;
}
