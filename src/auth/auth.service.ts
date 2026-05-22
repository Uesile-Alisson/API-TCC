import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma/prisma.service';
import { SignInDTO } from './dto/sign-in.dto';
import { FisrtAcessDTO } from './dto/first-acess.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-pssword.dto';
import { use } from 'passport';
import { access } from 'fs';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signin(dto: SignInDTO) {
    const user = await this.prisma.usuarios.findUnique({
      where: {
        login: dto.login,
      },
      include: {
        niveisacessos: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Login inválido.');
    }

    const senhavalida = await bcrypt.compare(dto.senha, user.senha_hash);

    if (!senhavalida) {
      throw new UnauthorizedException('Senha inválida.');
    }

    const token = await this.generateAccessToken(user);

    return {
      access_token: token,
      usuario: {
        id_usuario: user.id_usuario,
        nome: user.nome,
        login: user.login,
        email: user.email,
        nivel_acesso: user.niveisacessos,
        primeiro_acesso: user.primeiro_acesso,
      },
    };
  }

  async firstAccess(userId: number, dto: FisrtAcessDTO) {
    if (dto.senhaNova !== dto.confirmarSenha) {
      throw new BadRequestException('As senhas são diferentes.');
    }

    const user = await this.prisma.usuarios.findUnique({
      where: {
        id_usuario: userId,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado.');
    }

    if (!user.primeiro_acesso) {
      throw new UnauthorizedException(
        'Esse usuário já realizou o primeiro acesso.',
      );
    }

    const senhaHash = await bcrypt.hash(dto.senhaNova, 10);

    await this.prisma.usuarios.update({
      where: {
        id_usuario: userId,
      },
      data: {
        senha_hash: senhaHash,
        primeiro_acesso: false,
        atualizado_em: new Date(),
      },
    });

    return {
      message: 'Senha definida com sucesso.',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.usuarios.findUnique({
      where: {
        email: dto.email,
      },
    });

    if (!user) {
      return {
        message: 'Se o e-mail existir, um ink de redefinição será enviado.',
      };
    }

    const resetToken = await this.jwt.signAsync(
      {
        sub: user.id_usuario,
        type: 'password_reset',
      },
      {
        expiresIn: '15m',
      },
    );

    // Aqui virá o envio do e-mail
    // await this.mailService.sendPasswordResetEmail(user.email, resetToken);

    return {
      message: 'Se o e-mail existir, um ink de redefinição será enviado.',
      resetToken,
    };
  }

  private async generateAccessToken(user: {
    id_usuario: number;
    login: string;
    id_nivel_acesso: number;
  }) {
    return this.jwt.signAsync({
      sub: user.id_usuario,
      login: user.login,
      id_nivel_acesso: user.id_nivel_acesso,
    });
  }
}
