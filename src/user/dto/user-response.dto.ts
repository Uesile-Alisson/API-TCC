import { ApiProperty } from '@nestjs/swagger';
import { nivelacesso } from '@prisma/client';

export class UserAccessLevelResponseDTO {
  @ApiProperty({ example: 2 })
  id_nivel_acesso!: number;

  @ApiProperty({ enum: nivelacesso, enumName: 'NivelAcesso' })
  nome!: nivelacesso;

  @ApiProperty({ example: 'Acesso tecnico ao equipamento.', nullable: true })
  descricao!: string | null;

  @ApiProperty({ example: 2 })
  prioridade!: number;
}

export class UserResponseDTO {
  @ApiProperty({ example: 7 })
  id_usuario!: number;

  @ApiProperty({ example: 'Tecnico Teste' })
  nome!: string;

  @ApiProperty({ example: 'tecnico.teste' })
  login!: string;

  @ApiProperty({ example: 'tecnico@teste.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: false })
  primeiro_acesso!: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  ultimo_acesso!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  atualizado_em!: Date | null;

  @ApiProperty({ type: UserAccessLevelResponseDTO })
  niveisacessos!: UserAccessLevelResponseDTO;
}

export class CreateUserResponseDTO {
  @ApiProperty({ example: 'Usuario criado com sucesso.' })
  message!: string;

  @ApiProperty({
    description: 'Senha temporaria exibida somente nesta resposta.',
    minLength: 24,
    maxLength: 24,
  })
  temporaryPassword!: string;

  @ApiProperty({ type: UserResponseDTO })
  user!: UserResponseDTO;
}

export class UserMessageResponseDTO {
  @ApiProperty({ example: 'Usuario excluido com sucesso.' })
  message!: string;
}
