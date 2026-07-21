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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { BackupService } from './backup.service';
import { BackupQueryDto } from './dto/backup-query.dto';
import { CreateBackupDto } from './dto/create-backup.dto';
import { RestoreBackupDto } from './dto/restore-backup.dto';
import {
  BackupDetailsResponseDto,
  BackupListResponseDto,
  BackupRestoreResponseDto,
} from './dto/backup-response.dto';

@ApiTags('Configuracoes - Backup')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRADOR')
@Throttle({
  default: { limit: 30, ttl: 60_000, blockDuration: 60_000 },
})
@Controller('configuracoes/backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post()
  @Throttle({
    default: {
      limit: 5,
      ttl: 10 * 60_000,
      blockDuration: 10 * 60_000,
    },
  })
  @ApiOperation({ summary: 'Gera um backup logico em PostgreSQL JSON.' })
  @ApiCreatedResponse({
    description: 'Backup gerado com sucesso.',
    type: BackupDetailsResponseDto,
  })
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
  @ApiOkResponse({
    description: 'Backups listados com sucesso.',
    type: BackupListResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Filtros invalidos.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  findAll(@Query() query: BackupQueryDto) {
    return this.backupService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta um backup pelo ID.' })
  @ApiOkResponse({
    description: 'Backup encontrado.',
    type: BackupDetailsResponseDto,
  })
  @ApiBadRequestResponse({ description: 'ID invalido.' })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Backup nao encontrado.' })
  findOne(@Param('id', ParseIntPipe) id_backup: number) {
    return this.backupService.findOne(id_backup);
  }

  @Post(':id/restaurar')
  @Throttle({
    default: {
      limit: 2,
      ttl: 10 * 60_000,
      blockDuration: 10 * 60_000,
    },
  })
  @ApiOperation({ summary: 'Restaura um backup logico.' })
  @ApiOkResponse({
    description: 'Backup restaurado com sucesso.',
    type: BackupRestoreResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Confirmacao de restauracao invalida.',
  })
  @ApiUnauthorizedResponse({ description: 'Token ausente ou invalido.' })
  @ApiForbiddenResponse({ description: 'Perfil sem permissao.' })
  @ApiNotFoundResponse({ description: 'Backup nao encontrado.' })
  @ApiConflictResponse({
    description:
      'Restauracao bloqueada (EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE / EQUIPMENT_CONFIG_BLOCKED_BY_MQTT_EXCLUSIVE_OPERATION).',
  })
  restore(
    @Param('id', ParseIntPipe) id_backup: number,
    @Body() dto: RestoreBackupDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.backupService.restore(id_backup, dto, currentUser);
  }
}
