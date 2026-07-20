import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, statustanque } from '@prisma/client';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedConfiguracoesResponse } from '../common/paginated-configuracoes-response.interface';
import { buildPagination } from '../common/query.helpers';
import {
  ConfiguracoesTanquesMapper,
  tanqueConfiguracaoSelect,
} from './configuracoes-tanques.mapper';
import { CreateTanqueConfiguracaoDto } from './dto/create-tanque-configuracao.dto';
import { QueryTanquesConfiguracaoDto } from './dto/query-tanques-configuracao.dto';
import { TanqueConfiguracaoResponseDto } from './dto/tanque-configuracao-response.dto';
import { UpdateTanqueConfiguracaoDto } from './dto/update-tanque-configuracao.dto';
import {
  buildTanqueCreateData,
  buildTanqueUpdateData,
  buildTanqueWhere,
  validateTanqueOrderBy,
} from './validators/tanques-configuracao.validators';

@Injectable()
export class ConfiguracoesTanquesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttConfigService: MqttConfigService,
  ) {}

  async findAll(
    query: QueryTanquesConfiguracaoDto,
  ): Promise<PaginatedConfiguracoesResponse<TanqueConfiguracaoResponseDto>> {
    const { page, limit, skip, take } = buildPagination(
      query.page,
      query.limit,
    );
    const where = buildTanqueWhere(query);
    const orderBy = {
      [validateTanqueOrderBy(query.order_by)]: query.order_direction ?? 'asc',
    } satisfies Prisma.tanquesOrderByWithRelationInput;

    const [records, total] = await this.prisma.$transaction([
      this.prisma.tanques.findMany({
        where,
        orderBy,
        skip,
        take,
        select: tanqueConfiguracaoSelect,
      }),
      this.prisma.tanques.count({ where }),
    ]);

    return {
      data: records.map((record) =>
        ConfiguracoesTanquesMapper.toResponse(record),
      ),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id_tanque: number): Promise<TanqueConfiguracaoResponseDto> {
    const tanque = await this.findRecordById(id_tanque);
    return ConfiguracoesTanquesMapper.toResponse(tanque);
  }

  async create(
    dto: CreateTanqueConfiguracaoDto,
  ): Promise<TanqueConfiguracaoResponseDto> {
    return this.mqttConfigService.executeProtectedEquipmentMutation(
      'CREATE_TANK',
      async (tx) => {
        await this.validateNomeAvailable(dto.nome, undefined, tx);

        const created = await tx.tanques.create({
          data: buildTanqueCreateData(dto),
          select: tanqueConfiguracaoSelect,
        });

        return ConfiguracoesTanquesMapper.toResponse(created);
      },
    );
  }

  async update(
    id_tanque: number,
    dto: UpdateTanqueConfiguracaoDto,
  ): Promise<TanqueConfiguracaoResponseDto> {
    return this.mqttConfigService.executeProtectedEquipmentMutation(
      'UPDATE_TANK',
      async (tx) => {
        await this.findRecordById(id_tanque, tx);

        if (dto.nome !== undefined) {
          await this.validateNomeAvailable(dto.nome, id_tanque, tx);
        }

        const updated = await tx.tanques.update({
          where: { id_tanque },
          data: buildTanqueUpdateData(dto),
          select: tanqueConfiguracaoSelect,
        });

        return ConfiguracoesTanquesMapper.toResponse(updated);
      },
    );
  }

  async ativar(id_tanque: number): Promise<TanqueConfiguracaoResponseDto> {
    return this.updateStatus(id_tanque, statustanque.ATIVO, 'ACTIVATE_TANK');
  }

  async desativar(id_tanque: number): Promise<TanqueConfiguracaoResponseDto> {
    return this.updateStatus(
      id_tanque,
      statustanque.INATIVO,
      'DEACTIVATE_TANK',
    );
  }

  private async updateStatus(
    id_tanque: number,
    status_tanque: statustanque,
    action: 'ACTIVATE_TANK' | 'DEACTIVATE_TANK',
  ): Promise<TanqueConfiguracaoResponseDto> {
    return this.mqttConfigService.executeProtectedEquipmentMutation(
      action,
      async (tx) => {
        await this.findRecordById(id_tanque, tx);

        const updated = await tx.tanques.update({
          where: { id_tanque },
          data: {
            status_tanque,
            atualizado_em: new Date(),
          },
          select: tanqueConfiguracaoSelect,
        });

        return ConfiguracoesTanquesMapper.toResponse(updated);
      },
    );
  }

  private async findRecordById(
    id_tanque: number,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const tanque = await client.tanques.findUnique({
      where: { id_tanque },
      select: tanqueConfiguracaoSelect,
    });

    if (!tanque) {
      throw new NotFoundException('Tanque nao encontrado.');
    }

    return tanque;
  }

  private async validateNomeAvailable(
    nome: string,
    currentId?: number,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const existing = await client.tanques.findUnique({
      where: { nome: nome.trim() },
      select: { id_tanque: true },
    });

    if (existing && existing.id_tanque !== currentId) {
      throw new ConflictException('Ja existe tanque com este nome.');
    }
  }
}
