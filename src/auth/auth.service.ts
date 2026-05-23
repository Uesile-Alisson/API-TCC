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
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '@/mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailService: MailService,
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
        login: dto.login,
      },
      include: {
        niveisacessos: true,
      },
    });

    if (!user) {
      return {
        message: 'Se o e-mail existir, um ink de redefinição será enviado.',
      };
    }

    if (user.niveisacessos.nome === 'ADMINISTRADOR') {
      throw new UnauthorizedException('Usuário não tem permissão.');
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

    await this.mailService.sendPasswordResetEmail(user.email!, resetToken);

    return {
      message: 'Se o e-mail existir, um ink de redefinição será enviado.',
      resetToken,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    if (dto.senhaNova !== dto.confirmarSenha) {
      throw new BadRequestException('As senhas são diferentes.');
    }

    let payload: {
      sub: number;
      type: string;
    };

    try {
      payload = await this.jwt.verifyAsync(dto.token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    if (payload.type !== 'password_reset') {
      throw new UnauthorizedException('Yokrn inválido.');
    }

    const senhaHash = await bcrypt.hash(dto.senhaNova, 10);

    await this.prisma.usuarios.update({
      where: {
        id_usuario: payload.sub,
      },
      data: {
        senha_hash: senhaHash,
        primeiro_acesso: false,
        atualizado_em: new Date(),
      },
    });

    return {
      message: 'Senha redenifina com sucesso.',
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
