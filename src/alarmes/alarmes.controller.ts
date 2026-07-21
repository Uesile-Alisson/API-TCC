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
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AlarmesService } from './alarmes.service';
import {
  AcknowledgeAlarmeDto,
  AcknowledgeAlarmeResponseDto,
  AlarmeDashboardResponseDto,
  AlarmeDetailsResponseDto,
  AlarmeListResponseDto,
  ListAlarmesQueryDto,
  ResolveAlarmeResponseDto,
  ResolveAlarmeDto,
} from './dto';

type AuthenticatedAlarmesUser = {
  id_usuario?: number;
  id?: number;
  sub?: number;
  login?: string;
  nivel_acesso?: string;
  id_nivel_acesso?: number;
};

@ApiTags('Alarmes')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alarmes')
export class AlarmesController {
  constructor(private readonly alarmesService: AlarmesService) {}

  @Get()
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes.' })
  @ApiOkResponse({ type: AlarmeListResponseDto })
  list(@Query() query: ListAlarmesQueryDto) {
    return this.alarmesService.list(query);
  }

  @Get('dashboard')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta dashboard de alarmes.' })
  @ApiOkResponse({ type: AlarmeDashboardResponseDto })
  getDashboard(@Query() query: ListAlarmesQueryDto) {
    return this.alarmesService.getDashboard(query);
  }

  @Get('ativos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes ativos.' })
  @ApiOkResponse({ type: AlarmeListResponseDto })
  findActive(@Query() query: ListAlarmesQueryDto) {
    return this.alarmesService.findActive(query);
  }

  @Get('criticos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes criticos.' })
  @ApiOkResponse({ type: AlarmeListResponseDto })
  findCritical(@Query() query: ListAlarmesQueryDto) {
    return this.alarmesService.findCritical(query);
  }

  @Get('processo/:id_processo')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes de um processo.' })
  @ApiOkResponse({ type: AlarmeListResponseDto })
  findByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: ListAlarmesQueryDto,
  ) {
    return this.alarmesService.findByProcess(id_processo, query);
  }

  @Get('processo/:id_processo/ativos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes ativos de um processo.' })
  @ApiOkResponse({ type: AlarmeListResponseDto })
  findActiveByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: ListAlarmesQueryDto,
  ) {
    return this.alarmesService.findActiveByProcess(id_processo, query);
  }

  @Get('processo/:id_processo/criticos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes criticos de um processo.' })
  @ApiOkResponse({ type: AlarmeListResponseDto })
  findCriticalByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: ListAlarmesQueryDto,
  ) {
    return this.alarmesService.findCriticalByProcess(id_processo, query);
  }

  @Get(':id')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta detalhes de um alarme.' })
  @ApiOkResponse({ type: AlarmeDetailsResponseDto })
  findById(@Param('id', ParseIntPipe) id_alarme: number) {
    return this.alarmesService.findDetailsById(id_alarme);
  }

  @Patch(':id/resolver')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Resolve um alarme.' })
  @ApiOkResponse({ type: ResolveAlarmeResponseDto })
  resolve(
    @Param('id', ParseIntPipe) id_alarme: number,
    @Body() dto: ResolveAlarmeDto,
    @CurrentUser() currentUser: AuthenticatedAlarmesUser,
  ) {
    return this.alarmesService.resolve(id_alarme, dto, currentUser);
  }

  @Post(':id/resolver')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Resolve um alarme.' })
  @ApiCreatedResponse({ type: ResolveAlarmeResponseDto })
  resolvePost(
    @Param('id', ParseIntPipe) id_alarme: number,
    @Body() dto: ResolveAlarmeDto,
    @CurrentUser() currentUser: AuthenticatedAlarmesUser,
  ) {
    return this.alarmesService.resolve(id_alarme, dto, currentUser);
  }

  @Post(':id/reconhecer')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Reconhece ciencia operacional de um alarme.' })
  @ApiCreatedResponse({ type: AcknowledgeAlarmeResponseDto })
  acknowledge(
    @Param('id', ParseIntPipe) id_alarme: number,
    @Body() dto: AcknowledgeAlarmeDto,
    @CurrentUser() currentUser: AuthenticatedAlarmesUser,
  ) {
    return this.alarmesService.acknowledge(id_alarme, dto, currentUser);
  }
}
