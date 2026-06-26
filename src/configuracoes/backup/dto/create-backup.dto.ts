import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { origembackup, tipobackup } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBackupDto {
  @ApiProperty({
    enum: tipobackup,
    example: tipobackup.COMPLETO,
    description: 'Tipo de snapshot que sera gerado.',
  })
  @IsEnum(tipobackup, { message: 'tipo_backup informado e invalido.' })
  tipo_backup!: tipobackup;

  @ApiPropertyOptional({
    enum: origembackup,
    example: origembackup.MANUAL,
    description: 'Origem operacional do backup.',
  })
  @IsOptional()
  @IsEnum(origembackup, { message: 'origem_backup informada e invalida.' })
  origem_backup?: origembackup;

  @ApiPropertyOptional({
    example: 'Backup antes de ajuste tecnico.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacao?: string;
}
