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
import { ConfiguracoesSensoresService } from './configuracoes-sensores.service';
import { CreateSensorConfiguracaoDto } from './dto/create-sensor-configuracao.dto';
import { QuerySensoresConfiguracaoDto } from './dto/query-sensores-configuracao.dto';
import { SensorConfiguracaoResponseDto } from './dto/sensor-configuracao-response.dto';
import { SensorProcessoOptionResponseDto } from './dto/sensor-processo-option-response.dto';
import { UpdateSensorConfiguracaoDto } from './dto/update-sensor-configuracao.dto';

@ApiTags('Configuracoes - Sensores')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuracoes')
export class ConfiguracoesSensoresController {
  constructor(
    private readonly configuracoesSensoresService: ConfiguracoesSensoresService,
  ) {}

  @Get('sensores')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista sensores configurados.' })
  @ApiOkResponse({ type: SensorConfiguracaoResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'Filtros invalidos.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  findAll(@Query() query: QuerySensoresConfiguracaoDto) {
    return this.configuracoesSensoresService.findAll(query);
  }

  @Get('sensores/:id_sensor')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta um sensor configurado.' })
  @ApiOkResponse({ type: SensorConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Sensor nao encontrado.' })
  findOne(@Param('id_sensor', ParseIntPipe) id_sensor: number) {
    return this.configuracoesSensoresService.findOne(id_sensor);
  }

  @Post('sensores')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Cria um sensor configurado.' })
  @ApiCreatedResponse({ type: SensorConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'Payload invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiConflictResponse({ description: 'Sensor duplicado.' })
  create(@Body() dto: CreateSensorConfiguracaoDto) {
    return this.configuracoesSensoresService.create(dto);
  }

  @Patch('sensores/:id_sensor')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Atualiza um sensor configurado.' })
  @ApiOkResponse({ type: SensorConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'Payload ou ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Sensor nao encontrado.' })
  @ApiConflictResponse({ description: 'Sensor duplicado.' })
  update(
    @Param('id_sensor', ParseIntPipe) id_sensor: number,
    @Body() dto: UpdateSensorConfiguracaoDto,
  ) {
    return this.configuracoesSensoresService.update(id_sensor, dto);
  }

  @Patch('sensores/:id_sensor/ativar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Ativa um sensor configurado.' })
  @ApiOkResponse({ type: SensorConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Sensor nao encontrado.' })
  ativar(@Param('id_sensor', ParseIntPipe) id_sensor: number) {
    return this.configuracoesSensoresService.ativar(id_sensor);
  }

  @Patch('sensores/:id_sensor/desativar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Desativa um sensor configurado.' })
  @ApiOkResponse({ type: SensorConfiguracaoResponseDto })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Sensor nao encontrado.' })
  desativar(@Param('id_sensor', ParseIntPipe) id_sensor: number) {
    return this.configuracoesSensoresService.desativar(id_sensor);
  }

  @Get('tanques/:id_tanque/sensores')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({
    summary: 'Lista opcoes reais de sensores para configurar um processo.',
  })
  @ApiOkResponse({ type: SensorProcessoOptionResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'Filtros ou ID invalidos.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Tanque nao encontrado.' })
  findSensoresByTanque(
    @Param('id_tanque', ParseIntPipe) id_tanque: number,
    @Query() query: QuerySensoresConfiguracaoDto,
  ) {
    return this.configuracoesSensoresService.findSensoresByTanque(
      id_tanque,
      query,
    );
  }
}
