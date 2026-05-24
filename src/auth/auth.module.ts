import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controler';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategys/jwt.strategy';
import { MailModule } from '@/mail/mail.module';
import { SignOptions } from 'jsonwebtoken';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
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
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
