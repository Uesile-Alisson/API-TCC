import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignInDTO {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'joao.silva',
    description: 'Login único utilizado para acessar o sistema.',
    maxLength: 60,
  })
  login!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    example: 'Admin@123',
    description: 'Senha do usuário.',
  })
  senha!: string;
}
