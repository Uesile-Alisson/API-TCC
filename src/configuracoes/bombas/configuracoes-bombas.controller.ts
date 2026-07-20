import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { ConfiguracoesBombasService } from './configuracoes-bombas.service';
import {
  BombaConfiguracaoResponseDto,
  BombasConfiguracaoListResponseDto,
} from './dto/bomba-configuracao-response.dto';
import { CreateBombaConfiguracaoDto } from './dto/create-bomba-configuracao.dto';
import { QueryBombasConfiguracaoDto } from './dto/query-bombas-configuracao.dto';
import { UpdateBombaConfiguracaoDto } from './dto/update-bomba-configuracao.dto';

@ApiTags('Configuracoes - Bombas')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuracoes/bombas')
export class ConfiguracoesBombasController {
  constructor(
    private readonly configuracoesBombasService: ConfiguracoesBombasService,
  ) {}

  @Get()
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista bombas configuradas.' })
  @ApiOkResponse({ type: BombasConfiguracaoListResponseDto })
  @ApiBadRequestResponse({ description: 'Filtros invalidos.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  findAll(@Query() query: QueryBombasConfiguracaoDto) {
    return this.configuracoesBombasService.findAll(query);
  }

  @Get(':id_bomba')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta uma bomba configurada.' })
  @ApiOkResponse({ type: BombaConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Bomba nao encontrada.' })
  findOne(@Param('id_bomba', ParseIntPipe) id_bomba: number) {
    return this.configuracoesBombasService.findOne(id_bomba);
  }

  @Post()
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Cria uma bomba configurada.' })
  @ApiCreatedResponse({ type: BombaConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'Payload invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiConflictResponse({
    description:
      'Bomba duplicada ou alteracao bloqueada (EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE / EQUIPMENT_CONFIG_BLOCKED_BY_MQTT_EXCLUSIVE_OPERATION).',
  })
  create(
    @Body() dto: CreateBombaConfiguracaoDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.configuracoesBombasService.create(dto, {
      id_usuario: currentUser.id_usuario,
    });
  }

  @Patch(':id_bomba')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Atualiza uma bomba configurada.' })
  @ApiOkResponse({ type: BombaConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'Payload ou ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Bomba nao encontrada.' })
  @ApiConflictResponse({
    description:
      'Bomba duplicada ou alteracao bloqueada (EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE / EQUIPMENT_CONFIG_BLOCKED_BY_MQTT_EXCLUSIVE_OPERATION).',
  })
  update(
    @Param('id_bomba', ParseIntPipe) id_bomba: number,
    @Body() dto: UpdateBombaConfiguracaoDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.configuracoesBombasService.update(id_bomba, dto, {
      id_usuario: currentUser.id_usuario,
    });
  }

  @Patch(':id_bomba/ativar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Ativa uma bomba configurada.' })
  @ApiOkResponse({ type: BombaConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Bomba nao encontrada.' })
  @ApiConflictResponse({
    description:
      'Alteracao bloqueada (EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE / EQUIPMENT_CONFIG_BLOCKED_BY_MQTT_EXCLUSIVE_OPERATION).',
  })
  ativar(
    @Param('id_bomba', ParseIntPipe) id_bomba: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.configuracoesBombasService.ativar(id_bomba, {
      id_usuario: currentUser.id_usuario,
    });
  }

  @Patch(':id_bomba/desativar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Desativa uma bomba configurada.' })
  @ApiOkResponse({ type: BombaConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Bomba nao encontrada.' })
  @ApiConflictResponse({
    description:
      'Alteracao bloqueada (EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE / EQUIPMENT_CONFIG_BLOCKED_BY_MQTT_EXCLUSIVE_OPERATION).',
  })
  desativar(
    @Param('id_bomba', ParseIntPipe) id_bomba: number,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.configuracoesBombasService.desativar(id_bomba, {
      id_usuario: currentUser.id_usuario,
    });
  }
}
