import { IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDTO {
  @IsString()
  @IsNotEmpty()
  login!: string;
}
