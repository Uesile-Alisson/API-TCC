import { ApiProperty } from '@nestjs/swagger';
import { nivelacesso } from '@prisma/client';
import type { MeResponse } from '../types/me-response.type';

export class AuthAccessLevelResponseDTO {
  @ApiProperty({ example: 2 })
  id_nivel_acesso!: number;

  @ApiProperty({ enum: nivelacesso, enumName: 'NivelAcesso' })
  nome!: nivelacesso;

  @ApiProperty({ example: 'Acesso tecnico ao equipamento.', nullable: true })
  descricao!: string | null;

  @ApiProperty({ example: 2 })
  prioridade!: number;

  @ApiProperty({ example: true })
  ativo!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  criado_em!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  atualizado_em!: Date;
}

export class SignInUserResponseDTO {
  @ApiProperty({ example: 7 })
  id_usuario!: number;

  @ApiProperty({ example: 'Tecnico Teste' })
  nome!: string;

  @ApiProperty({ example: 'tecnico.teste' })
  login!: string;

  @ApiProperty({ example: 'tecnico@teste.com', nullable: true })
  email!: string | null;

  @ApiProperty({ type: AuthAccessLevelResponseDTO })
  nivel_acesso!: AuthAccessLevelResponseDTO;

  @ApiProperty({ example: false })
  primeiro_acesso!: boolean;
}

export class SignInResponseDTO {
  @ApiProperty({ description: 'Token JWT para o esquema Bearer.' })
  access_token!: string;

  @ApiProperty({ type: SignInUserResponseDTO })
  usuario!: SignInUserResponseDTO;
}

export class AuthMessageResponseDTO {
  @ApiProperty({ example: 'Operacao concluida com sucesso.' })
  message!: string;
}

export class MeResponseDTO implements MeResponse {
  @ApiProperty({ example: 7 })
  id_usuario!: number;

  @ApiProperty({ example: 'Tecnico Teste' })
  nome!: string;

  @ApiProperty({ example: 'tecnico.teste' })
  login!: string;

  @ApiProperty({ example: 'tecnico@teste.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: 2 })
  id_nivel_acesso!: number;

  @ApiProperty({ enum: nivelacesso, enumName: 'NivelAcesso' })
  nivel_acesso!: nivelacesso;

  @ApiProperty({ example: false })
  primeiro_acesso!: boolean;
}
