import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class AcknowledgeAlarmeDto {
  @ApiPropertyOptional({
    example: 'Operador ciente da ocorrência.',
    description: 'Observacao opcional para registro do reconhecimento.',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString({ message: 'A observacao deve ser um texto.' })
  @MaxLength(500, {
    message: 'A observacao deve ter no maximo 500 caracteres.',
  })
  observacao?: string;
}
