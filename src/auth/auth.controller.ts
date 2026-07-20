import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthService } from './auth.service';
import { SignInDTO } from './dto/sign-in.dto';
import { FirstAcessDTO } from './dto/first-acess.dto';
import { ForgotPasswordDTO } from './dto/forgot-password.dto';
import { ResetPasswordDTO } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthMessageResponseDTO,
  MeResponseDTO,
  SignInResponseDTO,
} from './dto/auth-response.dto';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { MeResponse } from './types/me-response.type';
import { Throttle } from '@nestjs/throttler';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';

@ApiTags('Auth')
@ApiTooManyRequestsResponse({
  description: 'Limite temporário de requisições excedido.',
})
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signin')
  @Throttle({
    default: { limit: 10, ttl: 60_000, blockDuration: 5 * 60_000 },
  })
  @ApiOperation({ summary: 'Autentica um usuario e emite um token JWT.' })
  @ApiCreatedResponse({ type: SignInResponseDTO })
  @ApiUnauthorizedResponse({ description: 'Credenciais invalidas.' })
  signin(@Body() dto: SignInDTO) {
    return this.authService.signin(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Retorna o usuÃ¡rio autenticado pelo token JWT.',
  })
  @ApiOkResponse({
    type: MeResponseDTO,
    description: 'Usuário autenticado retornado com sucesso.',
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, invÃ¡lido ou usuÃ¡rio nÃ£o encontrado.',
  })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.authService.me(user);
  }

  @Post('first-access')
  @Throttle({
    default: { limit: 5, ttl: 15 * 60_000, blockDuration: 15 * 60_000 },
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Define a senha definitiva do usuario no primeiro acesso.',
  })
  @ApiCreatedResponse({ type: AuthMessageResponseDTO })
  @ApiUnauthorizedResponse({
    description: 'Token ausente/invalido ou primeiro acesso ja concluido.',
  })
  firstAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FirstAcessDTO,
  ) {
    return this.authService.firstAccess(user.id_usuario, dto);
  }

  @Post('forgot-password')
  @Throttle({
    default: { limit: 3, ttl: 15 * 60_000, blockDuration: 15 * 60_000 },
  })
  @ApiOperation({ summary: 'Solicita recuperacao de senha sem enumerar contas.' })
  @ApiCreatedResponse({ type: AuthMessageResponseDTO })
  forgotPassword(@Body() dto: ForgotPasswordDTO) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({
    default: { limit: 5, ttl: 15 * 60_000, blockDuration: 15 * 60_000 },
  })
  @ApiOperation({ summary: 'Redefine a senha usando um token de uso unico.' })
  @ApiCreatedResponse({ type: AuthMessageResponseDTO })
  @ApiUnauthorizedResponse({
    description: 'Token invalido, expirado ou ja utilizado.',
  })
  resetPassword(@Body() dto: ResetPasswordDTO) {
    return this.authService.resetPassword(dto);
  }
}
