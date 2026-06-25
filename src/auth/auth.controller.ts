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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import type { MeResponse } from './types/me-response.type';

@ApiTags('Auth')
@ApiBearerAuth('access-token')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signin')
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
    description: 'UsuÃ¡rio autenticado retornado com sucesso.',
    schema: {
      example: {
        id_usuario: 1,
        nome: 'UsuÃ¡rio Teste',
        login: 'usuario.teste',
        email: 'usuario@teste.com',
        id_nivel_acesso: 2,
        nivel_acesso: 'TECNICO',
        primeiro_acesso: false,
      },
      required: [
        'id_usuario',
        'nome',
        'login',
        'email',
        'id_nivel_acesso',
        'nivel_acesso',
        'primeiro_acesso',
      ],
      properties: {
        id_usuario: { type: 'number', example: 1 },
        nome: { type: 'string', example: 'UsuÃ¡rio Teste' },
        login: { type: 'string', example: 'usuario.teste' },
        email: {
          type: 'string',
          nullable: true,
          example: 'usuario@teste.com',
        },
        id_nivel_acesso: { type: 'number', example: 2 },
        nivel_acesso: {
          type: 'string',
          enum: ['OPERADOR', 'TECNICO', 'ADMINISTRADOR'],
          example: 'TECNICO',
        },
        primeiro_acesso: { type: 'boolean', example: false },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, invÃ¡lido ou usuÃ¡rio nÃ£o encontrado.',
  })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.authService.me(user);
  }

  @Post('first-access')
  @UseGuards(JwtAuthGuard)
  firstAccess(
    @CurrentUser() user: AuthenticatedUser,
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
