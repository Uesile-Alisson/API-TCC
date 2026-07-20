import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import {
  ReadingContextCacheService,
  SystemConfigCacheService,
} from '../../mqtt-hardware/events/cache';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesCurrentUser } from '../common/configuracoes-current-user.interface';
import {
  ConfiguracoesSistemaMapper,
  configuracoesSistemaSelect,
} from './configuracoes-sistema.mapper';
import { ConfiguracoesSistemaResponseDto } from './dto/configuracoes-sistema-response.dto';
import { UpdateConfiguracoesSistemaDto } from './dto/update-configuracoes-sistema.dto';
import {
  buildConfiguracoesSistemaUpdateData,
  validateConfiguracaoEncerramento,
} from './validators/configuracoes-sistema.validators';

@Injectable()
export class ConfiguracoesSistemaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationalInterlock: MqttConfigService,
    private readonly systemConfigCache: SystemConfigCacheService,
    private readonly readingContextCache: ReadingContextCacheService,
  ) {}

  async findCurrent(): Promise<ConfiguracoesSistemaResponseDto> {
    const config = await this.findCurrentRecord();
    return ConfiguracoesSistemaMapper.toResponse(config);
  }

  async updateCurrent(
    dto: UpdateConfiguracoesSistemaDto,
    currentUser: ConfiguracoesCurrentUser,
  ): Promise<ConfiguracoesSistemaResponseDto> {
    this.validateCurrentUser(currentUser);

    const data = buildConfiguracoesSistemaUpdateData(dto, currentUser);
    const updated =
      await this.operationalInterlock.executeProtectedEquipmentMutation(
        'UPDATE_SYSTEM_CONFIGURATION',
        async (tx) => {
          const currentConfig = await this.findCurrentRecord(tx);
          validateConfiguracaoEncerramento(dto, currentConfig);
          const updatedConfig = await tx.configuracoessistema.update({
            where: {
              id_configuracao_sistema: currentConfig.id_configuracao_sistema,
            },
            data,
            select: configuracoesSistemaSelect,
          });

          return ConfiguracoesSistemaMapper.toResponse(updatedConfig);
        },
      );

    this.systemConfigCache.invalidate();
    this.readingContextCache.invalidate();
    return updated;
  }

  private async findCurrentRecord(
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const config = await client.configuracoessistema.findFirst({
      orderBy: {
        id_configuracao_sistema: 'asc',
      },
      select: configuracoesSistemaSelect,
    });

    if (!config) {
      throw new NotFoundException('Configuracao do sistema nao cadastrada.');
    }

    return config;
  }

  private validateCurrentUser(currentUser: ConfiguracoesCurrentUser): void {
    if (
      !Number.isInteger(currentUser.id_usuario) ||
      currentUser.id_usuario <= 0
    ) {
      throw new UnauthorizedException(
        'Usuario autenticado sem identificador valido.',
      );
    }
  }
}
