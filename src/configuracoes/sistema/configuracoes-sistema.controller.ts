import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { ConfiguracoesSistemaService } from './configuracoes-sistema.service';
import { ConfiguracoesSistemaResponseDto } from './dto/configuracoes-sistema-response.dto';
import { UpdateConfiguracoesSistemaDto } from './dto/update-configuracoes-sistema.dto';

@ApiTags('Configuracoes do Sistema')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuracoes/sistema')
export class ConfiguracoesSistemaController {
  constructor(
    private readonly configuracoesSistemaService: ConfiguracoesSistemaService,
  ) {}

  @Get()
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta a configuracao atual do sistema.' })
  @ApiOkResponse({ type: ConfiguracoesSistemaResponseDto })
  @ApiBadRequestResponse({ description: 'Requisicao invalida.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({
    description: 'Configuracao do sistema nao cadastrada.',
  })
  findCurrent(): Promise<ConfiguracoesSistemaResponseDto> {
    return this.configuracoesSistemaService.findCurrent();
  }

  @Patch()
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Atualiza a configuracao atual do sistema.' })
  @ApiOkResponse({ type: ConfiguracoesSistemaResponseDto })
  @ApiBadRequestResponse({ description: 'Payload invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({
    description: 'Configuracao do sistema nao cadastrada.',
  })
  updateCurrent(
    @Body() dto: UpdateConfiguracoesSistemaDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<ConfiguracoesSistemaResponseDto> {
    return this.configuracoesSistemaService.updateCurrent(dto, {
      id_usuario: currentUser.id_usuario,
    });
  }
}
