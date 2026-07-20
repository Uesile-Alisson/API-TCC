import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategys/jwt.strategy';
import { MailModule } from '@/mail/mail.module';
import { SignOptions } from 'jsonwebtoken';
import { SocketAuthService } from './socket-auth.service';
import { PasswordHasherService } from './password-hasher.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn =
          configService.getOrThrow<SignOptions['expiresIn']>('JWT_EXPIRES_IN');

        return {
          secret: configService.getOrThrow<string>('JWT_SECRET'),
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    SocketAuthService,
    PasswordHasherService,
  ],
  exports: [AuthService, JwtModule, SocketAuthService, PasswordHasherService],
})
export class AuthModule {}
