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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AlarmesService } from './alarmes.service';
import {
  AcknowledgeAlarmeDto,
  ListAlarmesQueryDto,
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
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('alarmes')
export class AlarmesController {
  constructor(private readonly alarmesService: AlarmesService) {}

  @Get()
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes.' })
  list(@Query() query: ListAlarmesQueryDto) {
    return this.alarmesService.list(query);
  }

  @Get('dashboard')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta dashboard de alarmes.' })
  getDashboard(@Query() query: ListAlarmesQueryDto) {
    return this.alarmesService.getDashboard(query);
  }

  @Get('ativos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes ativos.' })
  findActive(@Query() query: ListAlarmesQueryDto) {
    return this.alarmesService.findActive(query);
  }

  @Get('criticos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes criticos.' })
  findCritical(@Query() query: ListAlarmesQueryDto) {
    return this.alarmesService.findCritical(query);
  }

  @Get('processo/:id_processo')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes de um processo.' })
  findByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: ListAlarmesQueryDto,
  ) {
    return this.alarmesService.findByProcess(id_processo, query);
  }

  @Get('processo/:id_processo/ativos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes ativos de um processo.' })
  findActiveByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: ListAlarmesQueryDto,
  ) {
    return this.alarmesService.findActiveByProcess(id_processo, query);
  }

  @Get('processo/:id_processo/criticos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes criticos de um processo.' })
  findCriticalByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: ListAlarmesQueryDto,
  ) {
    return this.alarmesService.findCriticalByProcess(id_processo, query);
  }

  @Get(':id')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta detalhes de um alarme.' })
  findById(@Param('id', ParseIntPipe) id_alarme: number) {
    return this.alarmesService.findDetailsById(id_alarme);
  }

  @Patch(':id/resolver')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Resolve um alarme.' })
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
  acknowledge(
    @Param('id', ParseIntPipe) id_alarme: number,
    @Body() dto: AcknowledgeAlarmeDto,
    @CurrentUser() currentUser: AuthenticatedAlarmesUser,
  ) {
    return this.alarmesService.acknowledge(id_alarme, dto, currentUser);
  }
}
