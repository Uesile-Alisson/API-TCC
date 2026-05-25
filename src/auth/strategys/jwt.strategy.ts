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
    const user = await this.prisma.usuarios.findUnique({
      where: {
        id_usuario: payload.sub,
      },
      include: {
        niveisacessos: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não autorizado.');
    }

    return {
      id_usuario: user.id_usuario,
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
