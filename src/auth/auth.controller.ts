import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service';
import { SignInDTO } from './dto/sign-in.dto';
import { FirstAcessDTO } from './dto/first-acess.dto';
import { ForgotPasswordDTO } from './dto/forgot-password.dto';
import { ResetPasswordDTO } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

type AuthencatedUser = {
  id_usuario: number;
  login: string;
  nome: string;
  email: string;
  id_nivel_acesso: number;
  nivel_acesso: 'OPERADOR' | 'TECNICO' | 'ADMINISTRADOR';
  primeiro_acesso: boolean;
};

@ApiTags('Auth')
@ApiBearerAuth('access-token')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signin')
  signin(@Body() dto: SignInDTO) {
    return this.authService.signin(dto);
  }

  @Post('first-access')
  @UseGuards(JwtAuthGuard)
  firstAccess(
    @CurrentUser() user: AuthencatedUser,
    @Body() dto: FirstAcessDTO,
  ) {
    return this.authService.firstAccess(user.id_usuario, dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDTO) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDTO) {
    return this.authService.resetPassword(dto);
  }
}
