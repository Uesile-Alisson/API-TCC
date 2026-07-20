import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SignInDTO } from './dto/sign-in.dto';
import { FirstAcessDTO } from './dto/first-acess.dto';
import { ForgotPasswordDTO } from './dto/forgot-password.dto';
import { ResetPasswordDTO } from './dto/reset-password.dto';
import { MailService } from '../mail/mail.service';
import { PasswordHasherService } from './password-hasher.service';
import { SocketAuthService } from './socket-auth.service';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { MeResponse } from './types/me-response.type';

const INVALID_CREDENTIALS_MESSAGE = 'Credenciais inválidas.';
const INVALID_RESET_TOKEN_MESSAGE = 'Token inválido, expirado ou já utilizado.';
const LOGIN_MINIMUM_RESPONSE_TIME_MS = 500;
const RECOVERY_MINIMUM_RESPONSE_TIME_MS = 300;
const LOGIN_FAILURES_BEFORE_DELAY = 5;
const MAXIMUM_LOGIN_DELAY_MS = 15 * 60 * 1000;
const RESET_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const MINIMUM_PASSWORD_LENGTH = 15;
const MAXIMUM_PASSWORD_LENGTH = 128;

// Hash de uma senha fictícia, usado somente para igualar o custo do caminho em
// que o login não existe. Ele não corresponde a nenhuma credencial do sistema.
const DUMMY_PASSWORD_HASH =
  '$2b$12$kvCsN680GtW8I7g0MV0tde85QIFEOhWgLkv8kW3xxr3s06g5I8y0C';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly passwordRecoveryMessage =
    'Se os dados informados estiverem corretos, enviaremos as instruções de recuperação de senha.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mailService: MailService,
    private readonly passwordHasher: PasswordHasherService,
    private readonly socketAuth: SocketAuthService,
  ) {}

  async signin(dto: SignInDTO) {
    const startedAt = Date.now();
    const user = await this.prisma.usuarios.findUnique({
      where: {
        login: dto.login,
      },
      include: {
        niveisacessos: true,
      },
    });

    const verification = await this.passwordHasher.verify(
      dto.senha,
      user?.senha_hash ?? DUMMY_PASSWORD_HASH,
    );
    const now = new Date();
    const isTemporarilyBlocked = Boolean(
      user?.login_bloqueado_ate && user.login_bloqueado_ate > now,
    );

    if (!user || !verification.valid || isTemporarilyBlocked) {
      if (user && !verification.valid && !isTemporarilyBlocked) {
        await this.recordFailedLogin(user.id_usuario);
      }

      await this.ensureMinimumDuration(
        startedAt,
        LOGIN_MINIMUM_RESPONSE_TIME_MS,
      );
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const upgradedPasswordHash = verification.needsUpgrade
      ? await this.passwordHasher.hash(dto.senha)
      : undefined;

    await this.prisma.usuarios.update({
      where: { id_usuario: user.id_usuario },
      data: {
        tentativas_login_falhas: 0,
        login_bloqueado_ate: null,
        ultimo_acesso: now,
        atualizado_em: now,
        ...(upgradedPasswordHash ? { senha_hash: upgradedPasswordHash } : {}),
      },
    });
    const token = await this.generateAccessToken(user);
    await this.ensureMinimumDuration(startedAt, LOGIN_MINIMUM_RESPONSE_TIME_MS);

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
    const normalizedPassword = this.validateNewPassword(
      dto.senhaNova,
      dto.confirmarSenha,
    );
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

    const senhaHash = await this.passwordHasher.hash(normalizedPassword);

    await this.prisma.usuarios.update({
      where: {
        id_usuario: userId,
      },
      data: {
        senha_hash: senhaHash,
        primeiro_acesso: false,
        versao_token_autenticacao: { increment: 1 },
        tentativas_login_falhas: 0,
        login_bloqueado_ate: null,
        token_redefinicao_senha_hash: null,
        token_redefinicao_senha_expira_em: null,
        atualizado_em: new Date(),
      },
    });
    this.socketAuth.disconnectUser(userId);

    return {
      message: 'Senha definida com sucesso. Faça login novamente.',
    };
  }

  async forgotPassword(dto: ForgotPasswordDTO) {
    const startedAt = Date.now();
    const user = await this.prisma.usuarios.findUnique({
      where: {
        login: dto.login,
      },
      include: {
        niveisacessos: true,
      },
    });

    if (!user || !user.email || user.niveisacessos.nome === 'ADMINISTRADOR') {
      return this.finishPasswordRecoveryRequest(startedAt);
    }

    const now = Date.now();
    const resetToken = randomBytes(32).toString('base64url');
    const resetTokenHash = this.hashResetToken(resetToken);
    const expiresAt = new Date(now + RESET_TOKEN_LIFETIME_MS);
    const cooldownBoundary = new Date(
      now + RESET_TOKEN_LIFETIME_MS - RESET_REQUEST_COOLDOWN_MS,
    );
    const stored = await this.prisma.usuarios.updateMany({
      where: {
        id_usuario: user.id_usuario,
        OR: [
          { token_redefinicao_senha_expira_em: null },
          {
            token_redefinicao_senha_expira_em: {
              lte: cooldownBoundary,
            },
          },
        ],
      },
      data: {
        token_redefinicao_senha_hash: resetTokenHash,
        token_redefinicao_senha_expira_em: expiresAt,
        atualizado_em: new Date(now),
      },
    });

    if (stored.count === 1) {
      void this.sendPasswordResetEmailSafely(
        user.id_usuario,
        user.email,
        resetToken,
        resetTokenHash,
      );
    }

    return this.finishPasswordRecoveryRequest(startedAt);
  }

  async resetPassword(dto: ResetPasswordDTO) {
    const normalizedPassword = this.validateNewPassword(
      dto.senhaNova,
      dto.confirmarSenha,
    );
    const senhaHash = await this.passwordHasher.hash(normalizedPassword);
    const resetTokenHash = this.hashResetToken(dto.token);
    const updatedUsers = await this.prisma.usuarios.updateManyAndReturn({
      where: {
        token_redefinicao_senha_hash: resetTokenHash,
        token_redefinicao_senha_expira_em: {
          gt: new Date(),
        },
      },
      data: {
        senha_hash: senhaHash,
        primeiro_acesso: false,
        versao_token_autenticacao: { increment: 1 },
        tentativas_login_falhas: 0,
        login_bloqueado_ate: null,
        token_redefinicao_senha_hash: null,
        token_redefinicao_senha_expira_em: null,
        atualizado_em: new Date(),
      },
      select: {
        id_usuario: true,
      },
    });

    if (updatedUsers.length !== 1) {
      throw new UnauthorizedException(INVALID_RESET_TOKEN_MESSAGE);
    }

    this.socketAuth.disconnectUser(updatedUsers[0].id_usuario);

    return {
      message: 'Senha redefinida com sucesso. Faça login novamente.',
    };
  }

  async me(user: AuthenticatedUser): Promise<MeResponse> {
    const usuario = await this.prisma.usuarios.findUnique({
      where: {
        id_usuario: user.id_usuario,
      },
      select: {
        id_usuario: true,
        nome: true,
        login: true,
        email: true,
        id_nivel_acesso: true,
        primeiro_acesso: true,
        niveisacessos: {
          select: {
            nome: true,
          },
        },
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuário autenticado não encontrado.');
    }

    return {
      id_usuario: usuario.id_usuario,
      nome: usuario.nome,
      login: usuario.login,
      email: usuario.email,
      id_nivel_acesso: usuario.id_nivel_acesso,
      nivel_acesso: usuario.niveisacessos.nome,
      primeiro_acesso: usuario.primeiro_acesso,
    };
  }

  private validateNewPassword(password: string, confirmation: string): string {
    if (password !== confirmation) {
      throw new BadRequestException('As senhas são diferentes.');
    }

    const normalizedPassword = this.passwordHasher.normalize(password);
    const codePointLength = Array.from(normalizedPassword).length;
    if (
      codePointLength < MINIMUM_PASSWORD_LENGTH ||
      codePointLength > MAXIMUM_PASSWORD_LENGTH
    ) {
      throw new BadRequestException(
        `A senha deve ter entre ${MINIMUM_PASSWORD_LENGTH} e ${MAXIMUM_PASSWORD_LENGTH} caracteres.`,
      );
    }

    return normalizedPassword;
  }

  private async recordFailedLogin(userId: number): Promise<void> {
    const updated = await this.prisma.usuarios.update({
      where: { id_usuario: userId },
      data: {
        tentativas_login_falhas: { increment: 1 },
        atualizado_em: new Date(),
      },
      select: {
        tentativas_login_falhas: true,
      },
    });
    const failedAttempts = updated.tentativas_login_falhas;
    if (failedAttempts < LOGIN_FAILURES_BEFORE_DELAY) {
      return;
    }

    const exponent = Math.min(failedAttempts - LOGIN_FAILURES_BEFORE_DELAY, 10);
    const delayMs = Math.min(30_000 * 2 ** exponent, MAXIMUM_LOGIN_DELAY_MS);
    await this.prisma.usuarios.update({
      where: { id_usuario: userId },
      data: {
        login_bloqueado_ate: new Date(Date.now() + delayMs),
        atualizado_em: new Date(),
      },
    });
  }

  private async finishPasswordRecoveryRequest(startedAt: number) {
    await this.ensureMinimumDuration(
      startedAt,
      RECOVERY_MINIMUM_RESPONSE_TIME_MS,
    );
    return { message: this.passwordRecoveryMessage };
  }

  private async sendPasswordResetEmailSafely(
    userId: number,
    email: string,
    resetToken: string,
    resetTokenHash: string,
  ): Promise<void> {
    try {
      await this.mailService.sendPasswordResetEmail(email, resetToken);
    } catch {
      this.logger.warn(
        `Falha ao enviar e-mail de recuperação para o usuário ${userId}.`,
      );

      try {
        await this.prisma.usuarios.updateMany({
          where: {
            id_usuario: userId,
            token_redefinicao_senha_hash: resetTokenHash,
          },
          data: {
            token_redefinicao_senha_hash: null,
            token_redefinicao_senha_expira_em: null,
            atualizado_em: new Date(),
          },
        });
      } catch {
        this.logger.error(
          `Falha ao invalidar token não entregue do usuário ${userId}.`,
        );
      }
    }
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private async ensureMinimumDuration(
    startedAt: number,
    minimumDurationMs: number,
  ): Promise<void> {
    const remaining = minimumDurationMs - (Date.now() - startedAt);
    if (remaining <= 0) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }

  private async generateAccessToken(user: {
    id_usuario: number;
    login: string;
    id_nivel_acesso: number;
    versao_token_autenticacao: number;
  }) {
    return this.jwt.signAsync({
      sub: user.id_usuario,
      login: user.login,
      id_nivel_acesso: user.id_nivel_acesso,
      token_version: user.versao_token_autenticacao,
    });
  }
}
