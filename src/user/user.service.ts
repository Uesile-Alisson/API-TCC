import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { nivelacesso } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import type { AuthenticatedUser } from '@/auth/types/authenticated-user.type';
import { CreateUserDTO } from './dto/create-user.dto';
import { UpdateUserDTO } from './dto/update-user.dto';
import { UpdateUserRolesDTO } from './dto/update-user.roles';

type UserWithAccessLevel = Awaited<ReturnType<UserService['findUser']>>;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDTO) {
    await this.validateLoginAlreadyExists(dto.login);
    await this.validateEmailAlreadyExists(dto.email);
    await this.validateAccessLevelExists(dto.id_nivel_acesso);

    const temporaryPassword = this.generateTemporaryPassword();
    const senhaHash = await bcrypt.hash(temporaryPassword, 10);

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
    this.ensureCanModifyTargetUser(currentUser, targetUser);

    if (dto.login) {
      await this.validateLoginAlreadyExists(dto.login, id_usuario);
    }

    if (dto.email) {
      await this.validateEmailAlreadyExists(dto.email, id_usuario);
    }

    return this.prisma.usuarios.update({
      where: { id_usuario },
      data: dto,
      select: this.defaultUserSelect(),
    });
  }

  async updateUserRole(
    id_usuario: number,
    dto: UpdateUserRolesDTO,
    currentUser: AuthenticatedUser,
  ) {
    const targetUser = await this.findUser(id_usuario);
    this.ensureCanModifyTargetUser(currentUser, targetUser);

    await this.validateAccessLevelExists(dto.id_nivel_acesso);

    return this.prisma.usuarios.update({
      where: { id_usuario },
      data: {
        id_nivel_acesso: dto.id_nivel_acesso,
      },
      select: this.defaultUserSelect(),
    });
  }

  async removeUser(id_usuario: number, currentUser: AuthenticatedUser) {
    const targetUser = await this.findUser(id_usuario);
    this.ensureCanModifyTargetUser(currentUser, targetUser);

    await this.prisma.usuarios.delete({
      where: { id_usuario },
    });

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
    const random = Math.random().toString(36).slice(-6);
    return `TSEA@${random}1`;
  }

  private ensureCanModifyTargetUser(
    currentUser: AuthenticatedUser,
    targetUser: UserWithAccessLevel,
  ): void {
    const currentUserRole = currentUser.nivel_acesso.nome;
    const targetUserRole = targetUser.niveisacessos.nome;
    const isAnotherUser = currentUser.id_usuario !== targetUser.id_usuario;

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
