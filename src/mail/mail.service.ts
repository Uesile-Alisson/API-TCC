import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class MailService {
  private readonly transportar: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const config: SMTPTransport.Options = {
      host: this.configService.getOrThrow<string>('MAIL_HOST'),
      port: Number(this.configService.getOrThrow<string>('MAIL_PORT')),
      secure: false,
      auth: {
        user: this.configService.getOrThrow<string>('MAIL_USER'),
        pass: this.configService.getOrThrow<string>('MAIL_PASS'),
      },
    };

    this.transportar = nodemailer.createTransport(config);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetPasswordUrl = this.configService.getOrThrow<string>(
      'FRONTEND_RESET_PASSWORD_URL',
    );

    const resetLink = `${resetPasswordUrl}?token=${token}`;

    await this.transportar.sendMail({
      from: this.configService.getOrThrow<string>('MAIL_FROM'),
      to: email,
      subject: 'Redefinição senha - TSEA',
      html: `
        <h2>Redefinição de senha</h2>

        <p>Recebemos uma solicitação para redefinir sua senha no sistema de vácuo TSEA.</p>

        <p>Clique no link abaixo para criar uma nova senha:</p>

        <a href="${resetLink}">Redefinir senha</a>

        <p>Este link expira em 15 minutos.</p>

        <p>Se você não solicitou essa ação, ignore este e-mail.</p>
        `,
    });
  }
}
