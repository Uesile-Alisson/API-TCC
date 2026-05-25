import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDTO {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message:
      'A senha deve conter pelo menos uma letra maiúscula, um número e um caractere especial.',
  })
  @ApiProperty({
    example: 'Admin@123',
    description: 'Senha do usuário.',
    maxLength: 255,
  })
  senhaNova!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'Admin@123',
    description: 'Senha do usuário.',
    maxLength: 255,
  })
  confirmarSenha!: string;
}
