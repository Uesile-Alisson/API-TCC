import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { nivelacesso } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthenticatedUser } from '@/auth/types/authenticated-user.type';
import { PasswordHasherService } from '@/auth/password-hasher.service';
import { SocketAuthService } from '@/auth/socket-auth.service';
import { CreateUserDTO } from './dto/create-user.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import { UpdateUserRolesDTO } from './dto/update-user.roles';

type UserWithAccessLevel = Awaited<ReturnType<UserService['findUser']>>;
type UserMutation = 'PROFILE' | 'ROLE' | 'DELETE';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly socketAuth: SocketAuthService,
  ) {}

  async create(dto: CreateUserDTO) {
    await this.validateLoginAlreadyExists(dto.login);
    await this.validateEmailAlreadyExists(dto.email);
    await this.validateAccessLevelExists(dto.id_nivel_acesso);

    const temporaryPassword = this.generateTemporaryPassword();
    const senhaHash = await this.passwordHasher.hash(temporaryPassword);

    const user = await this.prisma.usuarios.create({
      data: {
        nome: dto.nome,
        login: dto.login,
        email: dto.email,
        senha_hash: senhaHash,
        id_nivel_acesso: dto.id_nivel_acesso,
        primeiro_acesso: true,
      },
      select: this.defaultUserSelect(),
    });

    return {
      message: 'Usuário criado com sucesso.',
      temporaryPassword,
      user,
    };
  }

  async updateUser(
    id_usuario: number,
    dto: UpdateUserDTO,
    currentUser: AuthenticatedUser,
  ) {
    const targetUser = await this.findUser(id_usuario);
    this.ensureCanModifyTargetUser(currentUser, targetUser, 'PROFILE');
    this.assertProfileUpdateHasChanges(dto);

    if (dto.login) {
      await this.validateLoginAlreadyExists(dto.login, id_usuario);
    }

    if (dto.email) {
      await this.validateEmailAlreadyExists(dto.email, id_usuario);
    }

    const updatedUser = await this.prisma.usuarios.update({
      where: { id_usuario },
      data: {
        ...dto,
        versao_token_autenticacao: { increment: 1 },
        atualizado_em: new Date(),
      },
      select: this.defaultUserSelect(),
    });

    this.socketAuth.disconnectUser(id_usuario);
    return updatedUser;
  }

  async updateUserRole(
    id_usuario: number,
    dto: UpdateUserRolesDTO,
    currentUser: AuthenticatedUser,
  ) {
    const targetUser = await this.findUser(id_usuario);
    this.ensureCanModifyTargetUser(currentUser, targetUser, 'ROLE');

    if (targetUser.niveisacessos.id_nivel_acesso === dto.id_nivel_acesso) {
      return targetUser;
    }

    await this.validateAccessLevelExists(dto.id_nivel_acesso);

    const updatedUser = await this.prisma.usuarios.update({
      where: { id_usuario },
      data: {
        id_nivel_acesso: dto.id_nivel_acesso,
        versao_token_autenticacao: { increment: 1 },
        atualizado_em: new Date(),
      },
      select: this.defaultUserSelect(),
    });

    this.socketAuth.disconnectUser(id_usuario);
    return updatedUser;
  }

  async removeUser(id_usuario: number, currentUser: AuthenticatedUser) {
    const targetUser = await this.findUser(id_usuario);
    this.ensureCanModifyTargetUser(currentUser, targetUser, 'DELETE');

    await this.prisma.usuarios.delete({
      where: { id_usuario },
    });
    this.socketAuth.disconnectUser(id_usuario);

    return {
      message: 'Usuário excluído com sucesso.',
    };
  }

  async listUsers() {
    return await this.prisma.usuarios.findMany({
      select: this.defaultUserSelect(),
      orderBy: {
        nome: 'asc',
      },
    });
  }

  async findUser(id_usuario: number) {
    const user = await this.prisma.usuarios.findUnique({
      where: { id_usuario },
      select: this.defaultUserSelect(),
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  async findByLogin(login: string) {
    return await this.prisma.usuarios.findUnique({
      where: { login },
    });
  }

  private async validateLoginAlreadyExists(
    login: string,
    currentUserId?: number,
  ) {
    const user = await this.prisma.usuarios.findUnique({
      where: { login },
    });

    if (user && user.id_usuario !== currentUserId) {
      throw new ConflictException('Este login já está em uso.');
    }
  }

  private async validateEmailAlreadyExists(
    email: string,
    currentUserId?: number,
  ) {
    const user = await this.prisma.usuarios.findUnique({
      where: { email },
    });

    if (user && user.id_usuario !== currentUserId) {
      throw new ConflictException('Este e-mail já está em uso.');
    }
  }

  private async validateAccessLevelExists(id_nivel_acesso: number) {
    const acessoLevel = await this.prisma.niveisacessos.findUnique({
      where: { id_nivel_acesso },
    });

    if (!acessoLevel) {
      throw new NotFoundException('Nível de acesso não encontrado.');
    }
  }

  private generateTemporaryPassword(): string {
    return randomBytes(18).toString('base64url');
  }

  private ensureCanModifyTargetUser(
    currentUser: AuthenticatedUser,
    targetUser: UserWithAccessLevel,
    mutation: UserMutation,
  ): void {
    const currentUserRole = currentUser.nivel_acesso.nome;
    const targetUserRole = targetUser.niveisacessos.nome;
    const isAnotherUser = currentUser.id_usuario !== targetUser.id_usuario;

    if (!isAnotherUser && mutation === 'ROLE') {
      throw new ForbiddenException(
        'Nao e permitido alterar o proprio nivel de acesso.',
      );
    }

    if (!isAnotherUser && mutation === 'DELETE') {
      throw new ForbiddenException(
        'Nao e permitido excluir o proprio usuario administrador.',
      );
    }

    if (
      currentUserRole === nivelacesso.ADMINISTRADOR &&
      targetUserRole === nivelacesso.ADMINISTRADOR &&
      isAnotherUser
    ) {
      throw new ForbiddenException(
        'Não é permitido modificar outro usuário administrador.',
      );
    }
  }

  private assertProfileUpdateHasChanges(dto: UpdateUserDTO): void {
    if (
      dto.nome === undefined &&
      dto.login === undefined &&
      dto.email === undefined
    ) {
      throw new BadRequestException(
        'Informe ao menos um campo para atualizar o usuario.',
      );
    }
  }

  private defaultUserSelect() {
    return {
      id_usuario: true,
      nome: true,
      login: true,
      email: true,
      primeiro_acesso: true,
      ultimo_acesso: true,
      criado_em: true,
      atualizado_em: true,
      niveisacessos: {
        select: {
          id_nivel_acesso: true,
          nome: true,
          descricao: true,
          prioridade: true,
        },
      },
    };
  }
}
