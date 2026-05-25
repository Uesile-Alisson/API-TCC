import { IsNotEmpty, Min, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserRolesDTO {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  @ApiProperty({
    example: 2,
    description:
      'ID do nível de acesso do usuário. Exemplo: 1 = OPERADOR, 2 = TECNICO, 3 = ADMINISTRADOR.',
    minimum: 1,
  })
  id_nivel_acesso!: number;
}
