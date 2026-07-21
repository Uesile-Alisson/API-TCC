import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  GraficoVacuoQueryDto,
  EventoDetailsResponseDto,
  EventoListResponseDto,
  LeituraChartResponseDto,
  LeituraDashboardResponseDto,
  LeituraDetailsResponseDto,
  LeituraListResponseDto,
  ListEventosQueryDto,
  ListLeiturasQueryDto,
  ProcessoOperationalSummaryResponseDto,
  ProcessoTimelineResponseDto,
  ProcessoTimelineQueryDto,
} from './dto';
import { LeiturasEventosService } from './leituras-eventos.service';

@ApiTags('Leituras/Eventos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leituras-eventos')
export class LeiturasEventosController {
  constructor(
    private readonly leiturasEventosService: LeiturasEventosService,
  ) {}

  @Get('leituras')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista leituras de vacuo.' })
  @ApiOkResponse({ type: LeituraListResponseDto })
  listLeituras(@Query() query: ListLeiturasQueryDto) {
    return this.leiturasEventosService.listLeituras(query);
  }

  @Get('leituras/dashboard')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta dashboard de leituras.' })
  @ApiOkResponse({ type: LeituraDashboardResponseDto })
  getLeiturasDashboard(@Query() query: ListLeiturasQueryDto) {
    return this.leiturasEventosService.getLeiturasDashboard(query);
  }

  @Get('leituras/:id')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta detalhes de uma leitura.' })
  @ApiOkResponse({ type: LeituraDetailsResponseDto })
  findLeituraById(@Param('id', ParseIntPipe) id_leitura_sensor: number) {
    return this.leiturasEventosService.findLeituraById(id_leitura_sensor);
  }

  @Get('eventos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista eventos operacionais.' })
  @ApiOkResponse({ type: EventoListResponseDto })
  listEventos(@Query() query: ListEventosQueryDto) {
    return this.leiturasEventosService.listEventos(query);
  }

  @Get('eventos/:id')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta detalhes de um evento.' })
  @ApiOkResponse({ type: EventoDetailsResponseDto })
  findEventoById(@Param('id', ParseIntPipe) id_evento_processo: number) {
    return this.leiturasEventosService.findEventoById(id_evento_processo);
  }

  @Get('processos/:id_processo/leituras')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista leituras de um processo.' })
  @ApiOkResponse({ type: LeituraListResponseDto })
  listLeiturasByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: ListLeiturasQueryDto,
  ) {
    return this.leiturasEventosService.listLeiturasByProcess(
      id_processo,
      query,
    );
  }

  @Get('processos/:id_processo/eventos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista eventos de um processo.' })
  @ApiOkResponse({ type: EventoListResponseDto })
  listEventosByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: ListEventosQueryDto,
  ) {
    return this.leiturasEventosService.listEventosByProcess(id_processo, query);
  }

  @Get('processos/:id_processo/timeline')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta timeline de um processo.' })
  @ApiOkResponse({ type: ProcessoTimelineResponseDto })
  getProcessTimeline(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: ProcessoTimelineQueryDto,
  ) {
    return this.leiturasEventosService.getProcessTimeline(id_processo, query);
  }

  @Get('processos/:id_processo/grafico-vacuo')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta grafico de vacuo de um processo.' })
  @ApiOkResponse({ type: LeituraChartResponseDto })
  getGraficoVacuoByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: GraficoVacuoQueryDto,
  ) {
    return this.leiturasEventosService.getGraficoVacuoByProcess(
      id_processo,
      query,
    );
  }

  @Get('processos/:id_processo/resumo-operacional')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta resumo operacional de um processo.' })
  @ApiOkResponse({ type: ProcessoOperationalSummaryResponseDto })
  getResumoOperacionalByProcess(
    @Param('id_processo', ParseIntPipe) id_processo: number,
  ) {
    return this.leiturasEventosService.getResumoOperacionalByProcess(
      id_processo,
    );
  }

  @Get('processo-tanque-sensor/:id_processo_tanque_sensor/leituras')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({
    summary: 'Lista leituras de um vinculo processo/tanque/sensor.',
  })
  @ApiOkResponse({ type: LeituraListResponseDto })
  listLeiturasByProcessTanqueSensor(
    @Param('id_processo_tanque_sensor', ParseIntPipe)
    id_processo_tanque_sensor: number,
    @Query() query: ListLeiturasQueryDto,
  ) {
    return this.leiturasEventosService.listLeiturasByProcessTanqueSensor(
      id_processo_tanque_sensor,
      query,
    );
  }

  @Get('processo-tanque-sensor/:id_processo_tanque_sensor/grafico-vacuo')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({
    summary: 'Consulta grafico de vacuo de um vinculo processo/tanque/sensor.',
  })
  @ApiOkResponse({ type: LeituraChartResponseDto })
  getGraficoVacuoByProcessTanqueSensor(
    @Param('id_processo_tanque_sensor', ParseIntPipe)
    id_processo_tanque_sensor: number,
    @Query() query: GraficoVacuoQueryDto,
  ) {
    return this.leiturasEventosService.getGraficoVacuoByProcessTanqueSensor(
      id_processo_tanque_sensor,
      query,
    );
  }
}
