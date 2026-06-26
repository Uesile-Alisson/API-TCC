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
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ConfiguracoesTanquesService } from './configuracoes-tanques.service';
import { CreateTanqueConfiguracaoDto } from './dto/create-tanque-configuracao.dto';
import { QueryTanquesConfiguracaoDto } from './dto/query-tanques-configuracao.dto';
import { TanqueConfiguracaoResponseDto } from './dto/tanque-configuracao-response.dto';
import { UpdateTanqueConfiguracaoDto } from './dto/update-tanque-configuracao.dto';

@ApiTags('Configuracoes - Tanques')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuracoes/tanques')
export class ConfiguracoesTanquesController {
  constructor(
    private readonly configuracoesTanquesService: ConfiguracoesTanquesService,
  ) {}

  @Get()
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista tanques configurados.' })
  @ApiOkResponse({ type: TanqueConfiguracaoResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'Filtros invalidos.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  findAll(@Query() query: QueryTanquesConfiguracaoDto) {
    return this.configuracoesTanquesService.findAll(query);
  }

  @Get(':id_tanque')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta um tanque configurado.' })
  @ApiOkResponse({ type: TanqueConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado.' })
  findOne(@Param('id_tanque', ParseIntPipe) id_tanque: number) {
    return this.configuracoesTanquesService.findOne(id_tanque);
  }

  @Post()
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Cria um tanque configurado.' })
  @ApiCreatedResponse({ type: TanqueConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'Payload invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiConflictResponse({ description: 'Tanque duplicado.' })
  create(@Body() dto: CreateTanqueConfiguracaoDto) {
    return this.configuracoesTanquesService.create(dto);
  }

  @Patch(':id_tanque')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Atualiza um tanque configurado.' })
  @ApiOkResponse({ type: TanqueConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'Payload ou ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado.' })
  @ApiConflictResponse({ description: 'Tanque duplicado.' })
  update(
    @Param('id_tanque', ParseIntPipe) id_tanque: number,
    @Body() dto: UpdateTanqueConfiguracaoDto,
  ) {
    return this.configuracoesTanquesService.update(id_tanque, dto);
  }

  @Patch(':id_tanque/ativar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Ativa um tanque configurado.' })
  @ApiOkResponse({ type: TanqueConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado.' })
  ativar(@Param('id_tanque', ParseIntPipe) id_tanque: number) {
    return this.configuracoesTanquesService.ativar(id_tanque);
  }

  @Patch(':id_tanque/desativar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Desativa um tanque configurado.' })
  @ApiOkResponse({ type: TanqueConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado.' })
  desativar(@Param('id_tanque', ParseIntPipe) id_tanque: number) {
    return this.configuracoesTanquesService.desativar(id_tanque);
  }
}
