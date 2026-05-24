import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

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
  senhaNova!: string;

  @IsString()
  @IsNotEmpty()
  confirmarSenha!: string;
}
