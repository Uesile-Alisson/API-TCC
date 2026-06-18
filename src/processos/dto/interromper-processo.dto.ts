import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class InterromperProcessoDTO {
  @ApiProperty({
    example: 'Interrupção manual solicitada pelo técnico.',
    description: 'Motivo da interrupção do processo.',
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
    example: 'Processo interrompido para inspeção da mangueira.',
    description: 'Observação opcional sobre a interrupção.',
  })
  @IsOptional()
  @IsString({ message: 'A observacao deve ser um texto.' })
  @MaxLength(500, {
    message: 'A observacao deve ter no máximo 500 caracteres.',
  })
  observacao?: string;
}
