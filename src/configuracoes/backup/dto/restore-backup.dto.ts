import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RestoreBackupDto {
  @ApiProperty({
    example: true,
    description: 'Confirmacao explicita obrigatoria para restaurar o backup.',
  })
  @IsBoolean()
  confirmar_restauracao!: boolean;

  @ApiPropertyOptional({
    example: 'Restauracao solicitada pelo administrador.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motivo?: string;
}
