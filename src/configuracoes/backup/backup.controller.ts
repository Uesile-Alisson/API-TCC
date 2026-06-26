import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import { BackupService } from './backup.service';
import { BackupQueryDto } from './dto/backup-query.dto';
import { CreateBackupDto } from './dto/create-backup.dto';
import { RestoreBackupDto } from './dto/restore-backup.dto';

@ApiTags('Configuracoes - Backup')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
@Controller('configuracoes/backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post()
  @ApiOperation({ summary: 'Gera um backup logico em PostgreSQL JSON.' })
  @ApiCreatedResponse({ description: 'Backup gerado com sucesso.' })
  @ApiBadRequestResponse({ description: 'Payload invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  create(
    @Body() dto: CreateBackupDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.backupService.create(dto, currentUser);
  }

  @Get()
  @ApiOperation({ summary: 'Lista backups gerados.' })
  @ApiOkResponse({ description: 'Backups listados com sucesso.' })
  @ApiBadRequestResponse({ description: 'Filtros invalidos.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  findAll(@Query() query: BackupQueryDto) {
    return this.backupService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um backup pelo ID.' })
  @ApiOkResponse({ description: 'Backup encontrado.' })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Backup nao encontrado.' })
  findOne(@Param('id', ParseIntPipe) id_backup: number) {
    return this.backupService.findOne(id_backup);
  }

  @Post(':id/restaurar')
  @ApiOperation({ summary: 'Restaura um backup logico.' })
  @ApiOkResponse({ description: 'Backup restaurado com sucesso.' })
  @ApiBadRequestResponse({ description: 'Confirmacao ou senha MQTT invalida.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Backup nao encontrado.' })
  restore(
    @Param('id', ParseIntPipe) id_backup: number,
    @Body() dto: RestoreBackupDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.backupService.restore(id_backup, dto, currentUser);
  }
}
