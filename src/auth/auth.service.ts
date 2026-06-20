import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma/prisma.service';
import { SignInDTO } from './dto/sign-in.dto';
import { FirstAcessDTO } from './dto/first-acess.dto';
import { ForgotPasswordDTO } from './dto/forgot-password.dto';
import { ResetPasswordDTO } from './dto/reset-password.dto';
import { MailService } from '@/mail/mail.service';

@Injectable()
export class AuthService {
  private readonly passwordRecoveryMessage =
    'Se os dados informados estiverem corretos, enviaremos as instruções de recuperação de senha.';

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

  async firstAccess(userId: number, dto: FirstAcessDTO) {
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

  async forgotPassword(dto: ForgotPasswordDTO) {
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
        message: this.passwordRecoveryMessage,
      };
    }

    if (user.niveisacessos.nome === 'ADMINISTRADOR') {
      return {
        message: this.passwordRecoveryMessage,
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

    await this.mailService.sendPasswordResetEmail(user.email!, resetToken);

    return {
      message: this.passwordRecoveryMessage,
    };
  }

  async resetPassword(dto: ResetPasswordDTO) {
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
