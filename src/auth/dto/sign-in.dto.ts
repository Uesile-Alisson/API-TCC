import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignInDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @ApiProperty({
    example: 'joao.silva',
    description: 'Login único utilizado para acessar o sistema.',
    maxLength: 60,
  })
  login!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @ApiProperty({
    example: 'uma frase longa e memorável',
    description: 'Senha do usuário.',
    maxLength: 128,
  })
  senha!: string;
}
