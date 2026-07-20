import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FirstAcessDTO {
  @IsString()
  @IsNotEmpty()
  @Length(15, 128)
  @ApiProperty({
    example: 'uma frase longa e memorável',
    description: 'Nova senha, sem regra obrigatória de composição.',
    minLength: 15,
    maxLength: 128,
  })
  senhaNova!: string;

  @IsString()
  @IsNotEmpty()
  @Length(15, 128)
  @ApiProperty({
    example: 'uma frase longa e memorável',
    description: 'Confirmação da nova senha.',
    minLength: 15,
    maxLength: 128,
  })
  confirmarSenha!: string;
}
