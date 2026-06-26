import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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

  @ApiPropertyOptional({
    example: 'nova-senha-segura',
    minLength: 6,
    description:
      'Obrigatoria para restaurar backups MQTT ou COMPLETO. Nunca e retornada no snapshot.',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  nova_senha_mqtt?: string;
}
