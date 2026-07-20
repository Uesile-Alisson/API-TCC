import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @ApiProperty({
    example: 'joao.silva',
    description: 'Login único utilizado para acessar o sistema.',
    maxLength: 60,
  })
  login!: string;
}
