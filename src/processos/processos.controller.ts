import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { nivelacesso } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateProcessoDTO,
  FinalizarProcessoDTO,
  InterromperProcessoDTO,
  ListProcessosQueryDTO,
  ParadaEmergenciaProcessoDTO,
  UpdateProcessoConfigDTO,
} from './dto';
import { CurrentUserPayload } from './interfaces';
import { ProcessosService } from './processos.service';

type AuthenticatedProcessUser = {
  sub?: number;
  id_usuario?: number;
  login?: string;
  id_nivel_acesso?: number;
  nivel_acesso?: nivelacesso | { nome: nivelacesso };
};

@ApiTags('Processos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('processos')
export class ProcessosController {
  constructor(private readonly processosService: ProcessosService) {}

  @Post()
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Cria um novo processo de vácuo.' })
  create(
    @Body() dto: CreateProcessoDTO,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.create(dto, this.toCurrentUserPayload(user));
  }

  @Get()
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista processos de vácuo.' })
  list(@Query() query: ListProcessosQueryDTO) {
    return this.processosService.list(query);
  }

  @Get('ativo')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta o processo ativo atual.' })
  findActive() {
    return this.processosService.findActive();
  }

  @Get(':id')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta detalhes de um processo.' })
  findById(@Param('id', ParseIntPipe) id_processo: number) {
    return this.processosService.findById(id_processo);
  }

  @Get(':id/dashboard')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta dashboard de um processo.' })
  getDashboard(@Param('id', ParseIntPipe) id_processo: number) {
    return this.processosService.getDashboard(id_processo);
  }

  @Get(':id/prechecagem')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta pre-checagem operacional do processo.' })
  consultarPrechecagem(
    @Param('id', ParseIntPipe) id_processo: number,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.consultarPrechecagem(
      id_processo,
      this.toCurrentUserPayload(user),
    );
  }

  @Post(':id/prechecagem/executar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Executa pre-checagem operacional do processo.' })
  executarPrechecagem(
    @Param('id', ParseIntPipe) id_processo: number,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.executarPrechecagem(
      id_processo,
      this.toCurrentUserPayload(user),
    );
  }

  @Post(':id/tanques/:id_tanque/acoplamento/validar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Valida acoplamento de um tanque do processo.' })
  validarAcoplamentoTanque(
    @Param('id', ParseIntPipe) id_processo: number,
    @Param('id_tanque', ParseIntPipe) id_tanque: number,
  ) {
    return this.processosService.validarAcoplamentoTanque(
      id_processo,
      id_tanque,
    );
  }

  @Post(':id/sensores/:id_sensor/validar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Valida sensor de um processo.' })
  validarSensor(
    @Param('id', ParseIntPipe) id_processo: number,
    @Param('id_sensor', ParseIntPipe) id_sensor: number,
  ) {
    return this.processosService.validarSensor(id_processo, id_sensor);
  }

  @Get(':id/valvulas')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista valvulas vinculadas ao processo.' })
  listarValvulas(@Param('id', ParseIntPipe) id_processo: number) {
    return this.processosService.listarValvulas(id_processo);
  }

  @Post(':id/valvulas/:id_valvula/validar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Valida uma valvula do processo.' })
  validarValvula(
    @Param('id', ParseIntPipe) id_processo: number,
    @Param('id_valvula', ParseIntPipe) id_valvula: number,
  ) {
    return this.processosService.validarValvula(id_processo, id_valvula);
  }

  @Post(':id/valvulas/:id_valvula/abrir')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Abre uma valvula do processo.' })
  abrirValvula(
    @Param('id', ParseIntPipe) id_processo: number,
    @Param('id_valvula', ParseIntPipe) id_valvula: number,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.abrirValvula(
      id_processo,
      id_valvula,
      this.toCurrentUserPayload(user),
    );
  }

  @Post(':id/valvulas/:id_valvula/fechar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Fecha uma valvula do processo.' })
  fecharValvula(
    @Param('id', ParseIntPipe) id_processo: number,
    @Param('id_valvula', ParseIntPipe) id_valvula: number,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.fecharValvula(
      id_processo,
      id_valvula,
      this.toCurrentUserPayload(user),
    );
  }

  @Patch(':id/config')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Atualiza configuração de um processo.' })
  updateConfig(
    @Param('id', ParseIntPipe) id_processo: number,
    @Body() dto: UpdateProcessoConfigDTO,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.updateConfig(
      id_processo,
      dto,
      this.toCurrentUserPayload(user),
    );
  }

  @Post(':id/iniciar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Inicia um processo configurado.' })
  start(
    @Param('id', ParseIntPipe) id_processo: number,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.start(
      id_processo,
      this.toCurrentUserPayload(user),
    );
  }

  @Post(':id/pausar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Pausa um processo em execução.' })
  pause(
    @Param('id', ParseIntPipe) id_processo: number,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.pause(
      id_processo,
      this.toCurrentUserPayload(user),
    );
  }

  @Post(':id/retomar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Retoma um processo pausado.' })
  resume(
    @Param('id', ParseIntPipe) id_processo: number,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.resume(
      id_processo,
      this.toCurrentUserPayload(user),
    );
  }

  @Post(':id/finalizar')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Finaliza um processo em execução.' })
  finish(
    @Param('id', ParseIntPipe) id_processo: number,
    @Body() dto: FinalizarProcessoDTO,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.finish(
      id_processo,
      dto,
      this.toCurrentUserPayload(user),
    );
  }

  @Post(':id/interromper')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Interrompe um processo de forma controlada.' })
  interrupt(
    @Param('id', ParseIntPipe) id_processo: number,
    @Body() dto: InterromperProcessoDTO,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.interrupt(
      id_processo,
      dto,
      this.toCurrentUserPayload(user),
    );
  }

  @Post(':id/parada-emergencia')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Executa parada de emergência do processo.' })
  emergencyStop(
    @Param('id', ParseIntPipe) id_processo: number,
    @Body() dto: ParadaEmergenciaProcessoDTO,
    @CurrentUser() user: AuthenticatedProcessUser,
  ) {
    return this.processosService.emergencyStop(
      id_processo,
      dto,
      this.toCurrentUserPayload(user),
    );
  }

  private toCurrentUserPayload(
    user: AuthenticatedProcessUser,
  ): CurrentUserPayload {
    const userId = user.sub ?? user.id_usuario;

    if (!userId) {
      throw new UnauthorizedException(
        'Usuário autenticado sem identificador válido no token.',
      );
    }

    return {
      sub: userId,
      login: user.login ?? '',
      id_nivel_acesso: user.id_nivel_acesso ?? 0,
      nivel_acesso: this.resolveNivelAcesso(user),
    };
  }

  private resolveNivelAcesso(user: AuthenticatedProcessUser): nivelacesso {
    if (!user.nivel_acesso) {
      throw new UnauthorizedException(
        'Usuário autenticado sem nível de acesso válido no token.',
      );
    }

    return typeof user.nivel_acesso === 'string'
      ? user.nivel_acesso
      : user.nivel_acesso.nome;
  }
}
