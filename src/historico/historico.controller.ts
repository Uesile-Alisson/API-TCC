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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  HistoricoDashboardQueryDto,
  HistoricoGraficoVacuoQueryDto,
  HistoricoProcessoAlarmesQueryDto,
  HistoricoProcessoEventosQueryDto,
  HistoricoAlarmeListResponseDto,
  HistoricoDashboardResponseDto,
  HistoricoEventoListResponseDto,
  HistoricoProcessoDetailsResponseDto,
  HistoricoProcessoListResponseDto,
  HistoricoRelatorioSummaryDto,
  HistoricoTanqueComparisonResponseDto,
  HistoricoTanqueSummaryDto,
  HistoricoVacuoChartResponseDto,
  ListHistoricoProcessosQueryDto,
} from './dto';
import type {
  HistoricoAlarmeSummary,
  HistoricoDashboardResponse,
  HistoricoEventoSummary,
  HistoricoProcessoDetails,
  HistoricoProcessoListResponse,
  HistoricoRelatorioSummary,
  HistoricoTanqueComparisonResponse,
  HistoricoTanqueSummary,
  HistoricoVacuoChartResponse,
  PaginationMeta,
} from './interfaces';
import {
  HistoricoService,
  type HistoricoCurrentUser,
} from './historico.service';

type AuthenticatedHistoricoUser = {
  id_usuario?: number;
  sub?: number;
  nivel_acesso?: string | { nome?: string };
  role?: string;
  perfil?: string;
};

type HistoricoPaginatedControllerResponse<T> = {
  data: T[];
  meta: PaginationMeta;
};

@ApiTags('Histórico')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('historico')
export class HistoricoController {
  constructor(private readonly historicoService: HistoricoService) {}

  @Get('processos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista processos históricos.' })
  @ApiOkResponse({ type: HistoricoProcessoListResponseDto })
  listHistoricalProcesses(
    @Query() query: ListHistoricoProcessosQueryDto,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoProcessoListResponse> {
    return this.historicoService.listHistoricalProcesses(
      query,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  @Get('dashboard')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta dashboard histórico.' })
  @ApiOkResponse({ type: HistoricoDashboardResponseDto })
  getHistoricalDashboard(
    @Query() query: HistoricoDashboardQueryDto,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoDashboardResponse> {
    return this.historicoService.getHistoricalDashboard(
      query,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  @Get('processos/:id_processo')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta detalhes de um processo histórico.' })
  @ApiOkResponse({ type: HistoricoProcessoDetailsResponseDto })
  findHistoricalProcessById(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoProcessoDetails> {
    return this.historicoService.findHistoricalProcessById(
      id_processo,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  @Get('processos/:id_processo/tanques')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista tanques de um processo histórico.' })
  @ApiOkResponse({ type: HistoricoTanqueSummaryDto, isArray: true })
  getHistoricalProcessTanks(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoTanqueSummary[]> {
    return this.historicoService.getHistoricalProcessTanks(
      id_processo,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  @Get('processos/:id_processo/alarmes')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista alarmes de um processo histórico.' })
  @ApiOkResponse({ type: HistoricoAlarmeListResponseDto })
  getHistoricalProcessAlarms(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: HistoricoProcessoAlarmesQueryDto,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoPaginatedControllerResponse<HistoricoAlarmeSummary>> {
    return this.historicoService.getHistoricalProcessAlarms(
      id_processo,
      query,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  @Get('processos/:id_processo/eventos')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista eventos de um processo histórico.' })
  @ApiOkResponse({ type: HistoricoEventoListResponseDto })
  getHistoricalProcessEvents(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: HistoricoProcessoEventosQueryDto,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoPaginatedControllerResponse<HistoricoEventoSummary>> {
    return this.historicoService.getHistoricalProcessEvents(
      id_processo,
      query,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  @Get('processos/:id_processo/relatorios')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({
    summary: 'Lista metadados de relatórios de um processo histórico.',
  })
  @ApiOkResponse({ type: HistoricoRelatorioSummaryDto, isArray: true })
  getHistoricalProcessReports(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoRelatorioSummary[]> {
    return this.historicoService.getHistoricalProcessReports(
      id_processo,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  @Get('processos/:id_processo/grafico-vacuo')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({
    summary: 'Consulta gráfico histórico de vácuo de um processo.',
  })
  @ApiOkResponse({ type: HistoricoVacuoChartResponseDto })
  getHistoricalVacuumChart(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Query() query: HistoricoGraficoVacuoQueryDto,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoVacuoChartResponse> {
    return this.historicoService.getHistoricalVacuumChart(
      id_processo,
      query,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  @Get('processos/:id_processo/dashboard')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({
    summary: 'Consulta dashboard histórico de um processo específico.',
  })
  @ApiOkResponse({ type: HistoricoDashboardResponseDto })
  getHistoricalProcessDashboard(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoDashboardResponse> {
    return this.historicoService.getHistoricalProcessDashboard(
      id_processo,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  @Get('processos/:id_processo/comparativo-tanques')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({
    summary: 'Consulta comparativo histórico de tanques de um processo.',
  })
  @ApiOkResponse({ type: HistoricoTanqueComparisonResponseDto })
  getHistoricalTankComparison(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @CurrentUser() currentUser: AuthenticatedHistoricoUser,
  ): Promise<HistoricoTanqueComparisonResponse> {
    return this.historicoService.getHistoricalTankComparison(
      id_processo,
      this.toHistoricoCurrentUser(currentUser),
    );
  }

  private toHistoricoCurrentUser(
    currentUser: AuthenticatedHistoricoUser,
  ): HistoricoCurrentUser {
    return {
      id_usuario: currentUser.id_usuario ?? currentUser.sub,
      nivel_acesso: this.getRoleName(currentUser),
      role: currentUser.role,
      perfil: currentUser.perfil,
    };
  }

  private getRoleName(
    currentUser: AuthenticatedHistoricoUser,
  ): string | undefined {
    const role = currentUser.nivel_acesso;

    return typeof role === 'string' ? role : role?.nome;
  }
}
