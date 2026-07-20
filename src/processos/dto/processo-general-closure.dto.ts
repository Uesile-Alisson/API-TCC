import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class IniciarEncerramentoGeralDTO {
  @ApiProperty({
    example: 8,
    description:
      'Versao atual do encerramento do processo para concorrencia otimista.',
  })
  @Type(() => Number)
  @IsInt({ message: 'expected_version deve ser um numero inteiro.' })
  @Min(0, { message: 'expected_version nao pode ser negativo.' })
  expected_version!: number;

  @ApiProperty({
    example:
      'Todos os tanques concluiram isolamento e retencao; finalizar processo.',
  })
  @IsString({ message: 'motivo deve ser um texto.' })
  @MinLength(3, { message: 'motivo deve ter pelo menos 3 caracteres.' })
  @MaxLength(500, { message: 'motivo deve ter no maximo 500 caracteres.' })
  motivo!: string;
}
