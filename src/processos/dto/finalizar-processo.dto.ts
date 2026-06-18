import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FinalizarProcessoDTO {
  @ApiPropertyOptional({
    example: 'Processo finalizado após atingir o vácuo alvo.',
    description: 'Observação opcional sobre a finalização do processo.',
  })
  @IsOptional()
  @IsString({ message: 'A observacao deve ser um texto.' })
  @MaxLength(500, {
    message: 'A observacao deve ter no máximo 500 caracteres.',
  })
  observacao?: string;
}
