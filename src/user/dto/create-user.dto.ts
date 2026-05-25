import {
  IsNotEmpty,
  IsString,
  IsEmail,
  MaxLength,
  Min,
  IsInt,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDTO {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  @ApiProperty({
    example: 'João Silva',
    description: 'Nome completo do usuário.',
    maxLength: 120,
  })
  nome!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  @ApiProperty({
    example: 'joao.silva',
    description: 'Login único utilizado para acessar o sistema.',
    maxLength: 60,
  })
  login!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(120)
  @ApiProperty({
    example: 'joao.silva@tsea.com',
    description: 'E-mail único do usuário.',
    maxLength: 120,
  })
  email!: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @ApiProperty({
    example: 2,
    description:
      'ID do nível de acesso do usuário. Exemplo: 1 = OPERADOR, 2 = TECNICO, 3 = ADMINISTRADOR.',
    minimum: 1,
  })
  id_nivel_acesso!: number;
}
