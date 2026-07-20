import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, statusbomba } from '@prisma/client';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfiguracoesCurrentUser } from '../common/configuracoes-current-user.interface';
import { PaginatedConfiguracoesResponse } from '../common/paginated-configuracoes-response.interface';
import { buildPagination } from '../common/query.helpers';
import {
  bombaConfiguracaoSelect,
  ConfiguracoesBombasMapper,
} from './configuracoes-bombas.mapper';
import { BombaConfiguracaoResponseDto } from './dto/bomba-configuracao-response.dto';
import { CreateBombaConfiguracaoDto } from './dto/create-bomba-configuracao.dto';
import { QueryBombasConfiguracaoDto } from './dto/query-bombas-configuracao.dto';
import { UpdateBombaConfiguracaoDto } from './dto/update-bomba-configuracao.dto';
import {
  buildBombaCreateData,
  buildBombaUpdateData,
  buildBombaWhere,
  validateBombaOrderBy,
} from './validators/bombas-configuracao.validators';

@Injectable()
export class ConfiguracoesBombasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttConfigService: MqttConfigService,
  ) {}

  async findAll(
    query: QueryBombasConfiguracaoDto,
  ): Promise<PaginatedConfiguracoesResponse<BombaConfiguracaoResponseDto>> {
    const { page, limit, skip, take } = buildPagination(
      query.page,
      query.limit,
    );
    const where = buildBombaWhere(query);
    const orderBy = {
      [validateBombaOrderBy(query.order_by)]: query.order_direction ?? 'asc',
    } satisfies Prisma.bombasOrderByWithRelationInput;

    const [records, total] = await this.prisma.$transaction([
      this.prisma.bombas.findMany({
        where,
        orderBy,
        skip,
        take,
        select: bombaConfiguracaoSelect,
      }),
      this.prisma.bombas.count({ where }),
    ]);

    return {
      data: records.map((record) =>
        ConfiguracoesBombasMapper.toResponse(record),
      ),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id_bomba: number): Promise<BombaConfiguracaoResponseDto> {
    const bomba = await this.findRecordById(id_bomba);
    return ConfiguracoesBombasMapper.toResponse(bomba);
  }

  async create(
    dto: CreateBombaConfiguracaoDto,
    currentUser: ConfiguracoesCurrentUser,
  ): Promise<BombaConfiguracaoResponseDto> {
    this.validateCurrentUser(currentUser);
    return this.mqttConfigService.executeProtectedEquipmentMutation(
      'CREATE_PUMP',
      async (tx) => {
        await this.validateNomeAvailable(dto.nome, undefined, tx);
        const id_configuracao_sistema =
          await this.findCurrentSystemConfigId(tx);

        const created = await tx.bombas.create({
          data: buildBombaCreateData(dto, id_configuracao_sistema, currentUser),
          select: bombaConfiguracaoSelect,
        });

        return ConfiguracoesBombasMapper.toResponse(created);
      },
    );
  }

  async update(
    id_bomba: number,
    dto: UpdateBombaConfiguracaoDto,
    currentUser: ConfiguracoesCurrentUser,
  ): Promise<BombaConfiguracaoResponseDto> {
    this.validateCurrentUser(currentUser);
    return this.mqttConfigService.executeProtectedEquipmentMutation(
      'UPDATE_PUMP',
      async (tx) => {
        await this.findRecordById(id_bomba, tx);

        if (dto.nome !== undefined) {
          await this.validateNomeAvailable(dto.nome, id_bomba, tx);
        }

        const updated = await tx.bombas.update({
          where: { id_bomba },
          data: buildBombaUpdateData(dto, currentUser),
          select: bombaConfiguracaoSelect,
        });

        return ConfiguracoesBombasMapper.toResponse(updated);
      },
    );
  }

  async ativar(
    id_bomba: number,
    currentUser: ConfiguracoesCurrentUser,
  ): Promise<BombaConfiguracaoResponseDto> {
    return this.updateStatus(
      id_bomba,
      statusbomba.ATIVA,
      'ACTIVATE_PUMP',
      currentUser,
    );
  }

  async desativar(
    id_bomba: number,
    currentUser: ConfiguracoesCurrentUser,
  ): Promise<BombaConfiguracaoResponseDto> {
    return this.updateStatus(
      id_bomba,
      statusbomba.INATIVA,
      'DEACTIVATE_PUMP',
      currentUser,
    );
  }

  private async updateStatus(
    id_bomba: number,
    status_padrao: statusbomba,
    action: 'ACTIVATE_PUMP' | 'DEACTIVATE_PUMP',
    currentUser: ConfiguracoesCurrentUser,
  ): Promise<BombaConfiguracaoResponseDto> {
    this.validateCurrentUser(currentUser);
    return this.mqttConfigService.executeProtectedEquipmentMutation(
      action,
      async (tx) => {
        await this.findRecordById(id_bomba, tx);

        const updated = await tx.bombas.update({
          where: { id_bomba },
          data: {
            status_padrao,
            id_usuario_alteracao: currentUser.id_usuario,
            atualizado_em: new Date(),
          },
          select: bombaConfiguracaoSelect,
        });

        return ConfiguracoesBombasMapper.toResponse(updated);
      },
    );
  }

  private async findRecordById(
    id_bomba: number,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const bomba = await client.bombas.findUnique({
      where: { id_bomba },
      select: bombaConfiguracaoSelect,
    });

    if (!bomba) {
      throw new NotFoundException('Bomba nao encontrada.');
    }

    return bomba;
  }

  private async findCurrentSystemConfigId(
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number> {
    const config = await client.configuracoessistema.findFirst({
      orderBy: {
        id_configuracao_sistema: 'asc',
      },
      select: {
        id_configuracao_sistema: true,
      },
    });

    if (!config) {
      throw new NotFoundException('Configuracao do sistema nao cadastrada.');
    }

    return config.id_configuracao_sistema;
  }

  private async validateNomeAvailable(
    nome: string,
    currentId?: number,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const existing = await client.bombas.findUnique({
      where: { nome: nome.trim() },
      select: { id_bomba: true },
    });

    if (existing && existing.id_bomba !== currentId) {
      throw new ConflictException('Ja existe bomba com este nome.');
    }
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
