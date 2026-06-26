import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesCurrentUser } from '../common/configuracoes-current-user.interface';
import {
  ConfiguracoesSistemaMapper,
  configuracoesSistemaSelect,
} from './configuracoes-sistema.mapper';
import { ConfiguracoesSistemaResponseDto } from './dto/configuracoes-sistema-response.dto';
import { UpdateConfiguracoesSistemaDto } from './dto/update-configuracoes-sistema.dto';
import { buildConfiguracoesSistemaUpdateData } from './validators/configuracoes-sistema.validators';

@Injectable()
export class ConfiguracoesSistemaService {
  constructor(private readonly prisma: PrismaService) {}

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
    const currentConfig = await this.findCurrentRecord();
    const updatedConfig = await this.prisma.configuracoessistema.update({
      where: {
        id_configuracao_sistema: currentConfig.id_configuracao_sistema,
      },
      data,
      select: configuracoesSistemaSelect,
    });

    return ConfiguracoesSistemaMapper.toResponse(updatedConfig);
  }

  private async findCurrentRecord() {
    const config = await this.prisma.configuracoessistema.findFirst({
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
