import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '@/prisma/prisma.service';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (
      !Number.isInteger(payload.sub) ||
      payload.sub <= 0 ||
      typeof payload.login !== 'string' ||
      payload.login.length === 0 ||
      !Number.isInteger(payload.id_nivel_acesso) ||
      payload.id_nivel_acesso <= 0 ||
      !Number.isInteger(payload.token_version) ||
      payload.token_version < 0
    ) {
      throw new UnauthorizedException('Token de acesso inválido.');
    }

    const user = await this.prisma.usuarios.findUnique({
      where: {
        id_usuario: payload.sub,
      },
      select: {
        id_usuario: true,
        id_nivel_acesso: true,
        login: true,
        nome: true,
        email: true,
        primeiro_acesso: true,
        versao_token_autenticacao: true,
        niveisacessos: {
          select: {
            nome: true,
          },
        },
      },
    });

    if (!user || payload.token_version !== user.versao_token_autenticacao) {
      throw new UnauthorizedException('Usuário não autorizado.');
    }

    return {
      id_usuario: user.id_usuario,
      id_nivel_acesso: user.id_nivel_acesso,
      login: user.login,
      nome: user.nome,
      email: user.email,
      nivel_acesso: {
        nome: user.niveisacessos.nome,
      },
      primeiro_acesso: user.primeiro_acesso,
    };
  }
}
