import { IsString, IsEmail, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDTO {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  @ApiProperty({
    example: 'João Silva',
    description: 'Nome completo do usuário.',
    maxLength: 120,
  })
  nome!: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  @ApiProperty({
    example: 'joao.silva',
    description: 'Login único utilizado para acessar o sistema.',
    maxLength: 60,
  })
  login!: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(120)
  @ApiProperty({
    example: 'joao.silva@tsea.com',
    description: 'E-mail único do usuário.',
    maxLength: 120,
  })
  email!: string;
}
