import { IsNotEmpty, IsString } from 'class-validator';

export class SignInDTO {
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @IsNotEmpty()
  senha!: string;
}
