import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { nivelacesso } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  GenerateAlarmReportDto,
  GenerateProcessReportDto,
  ListRelatoriosQueryDto,
} from './dto';
import type {
  RelatorioGenerationResult,
  RelatorioListResponse,
  RelatorioResponse,
  ReportDownloadResult,
  ReportPreviewResult,
  SingleRelatorioGenerationResult,
} from './interfaces';
import {
  type AuthenticatedRelatoriosUser,
  RelatoriosService,
} from './relatorios.service';

interface CurrentRelatoriosUserPayload {
  sub?: number;
  id_usuario?: number;
  nome?: string | null;
  nivel_acesso?: string | { nome?: string | null } | null;
}

type FileResponseResult = ReportPreviewResult | ReportDownloadResult;

const RELATORIOS_ACCESS_LEVELS = [
  nivelacesso.OPERADOR,
  nivelacesso.TECNICO,
  nivelacesso.ADMINISTRADOR,
] as const;

function isNivelAcesso(value: unknown): value is nivelacesso {
  return RELATORIOS_ACCESS_LEVELS.some((role) => role === value);
}

@ApiTags('Relatórios')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('relatorios')
export class RelatoriosController {
  constructor(private readonly relatoriosService: RelatoriosService) {}

  @Get()
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Lista relatórios gerados.' })
  listRelatorios(
    @Query() query: ListRelatoriosQueryDto,
    @CurrentUser() user: CurrentRelatoriosUserPayload,
  ): Promise<RelatorioListResponse> {
    return this.relatoriosService.listRelatorios(
      query,
      this.toAuthenticatedRelatoriosUser(user),
    );
  }

  @Post('processos/:id_processo')
  @HttpCode(HttpStatus.CREATED)
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Gera relatório operacional de processo.' })
  generateProcessReports(
    @Param('id_processo', ParseIntPipe) id_processo: number,
    @Body() dto: GenerateProcessReportDto,
    @CurrentUser() user: CurrentRelatoriosUserPayload,
  ): Promise<RelatorioGenerationResult> {
    return this.relatoriosService.generateProcessReports(
      id_processo,
      dto,
      this.toAuthenticatedRelatoriosUser(user),
    );
  }

  @Post('alarmes/:id_alarme')
  @HttpCode(HttpStatus.CREATED)
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Gera relatório técnico de alarme.' })
  generateAlarmReport(
    @Param('id_alarme', ParseIntPipe) id_alarme: number,
    @Body() dto: GenerateAlarmReportDto,
    @CurrentUser() user: CurrentRelatoriosUserPayload,
  ): Promise<SingleRelatorioGenerationResult> {
    return this.relatoriosService.generateAlarmReport(
      id_alarme,
      dto,
      this.toAuthenticatedRelatoriosUser(user),
    );
  }

  @Get(':id_relatorio/preview')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Abre preview PDF de um relatório.' })
  async previewRelatorio(
    @Param('id_relatorio', ParseIntPipe) id_relatorio: number,
    @CurrentUser() user: CurrentRelatoriosUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.relatoriosService.previewRelatorio(
      id_relatorio,
      this.toAuthenticatedRelatoriosUser(user),
    );

    this.setFileResponseHeaders(res, result);

    return new StreamableFile(result.stream);
  }

  @Get(':id_relatorio/download')
  @Roles('TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Baixa arquivo de relatório.' })
  async downloadRelatorio(
    @Param('id_relatorio', ParseIntPipe) id_relatorio: number,
    @CurrentUser() user: CurrentRelatoriosUserPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.relatoriosService.downloadRelatorio(
      id_relatorio,
      this.toAuthenticatedRelatoriosUser(user),
    );

    this.setFileResponseHeaders(res, result);

    return new StreamableFile(result.stream);
  }

  @Get(':id_relatorio')
  @Roles('OPERADOR', 'TECNICO', 'ADMINISTRADOR')
  @ApiOperation({ summary: 'Consulta detalhes de um relatório.' })
  getRelatorioById(
    @Param('id_relatorio', ParseIntPipe) id_relatorio: number,
    @CurrentUser() user: CurrentRelatoriosUserPayload,
  ): Promise<RelatorioResponse> {
    return this.relatoriosService.getRelatorioById(
      id_relatorio,
      this.toAuthenticatedRelatoriosUser(user),
    );
  }

  private toAuthenticatedRelatoriosUser(
    user: CurrentRelatoriosUserPayload,
  ): AuthenticatedRelatoriosUser {
    const userId = user.id_usuario ?? user.sub;

    if (!userId) {
      throw new UnauthorizedException(
        'Usuário autenticado sem identificador válido no token.',
      );
    }

    return {
      id_usuario: userId,
      nome: user.nome ?? null,
      nivel_acesso: this.resolveNivelAcesso(user),
    };
  }

  private resolveNivelAcesso(user: CurrentRelatoriosUserPayload): nivelacesso {
    const role =
      typeof user.nivel_acesso === 'object' && user.nivel_acesso !== null
        ? user.nivel_acesso.nome
        : user.nivel_acesso;

    if (isNivelAcesso(role)) {
      return role;
    }

    throw new UnauthorizedException(
      'Usuário autenticado sem nível de acesso válido no token.',
    );
  }

  private setFileResponseHeaders(
    res: Response,
    result: FileResponseResult,
  ): void {
    res.setHeader('Content-Type', result.content_type);
    res.setHeader(
      'Content-Disposition',
      `${result.disposition}; filename="${result.filename}"`,
    );

    if (result.content_length !== null && result.content_length !== undefined) {
      res.setHeader('Content-Length', String(result.content_length));
    }
  }
}
