import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, statussensor } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedConfiguracoesResponse } from '../common/paginated-configuracoes-response.interface';
import { buildPagination } from '../common/query.helpers';
import {
  ConfiguracoesSensoresMapper,
  sensorConfiguracaoSelect,
} from './configuracoes-sensores.mapper';
import { CreateSensorConfiguracaoDto } from './dto/create-sensor-configuracao.dto';
import { QuerySensoresConfiguracaoDto } from './dto/query-sensores-configuracao.dto';
import { SensorConfiguracaoResponseDto } from './dto/sensor-configuracao-response.dto';
import { SensorProcessoOptionResponseDto } from './dto/sensor-processo-option-response.dto';
import { UpdateSensorConfiguracaoDto } from './dto/update-sensor-configuracao.dto';
import {
  buildSensorCreateData,
  buildSensorUpdateData,
  buildSensorWhere,
  buildSensoresPorTanqueWhere,
  validateSensorOrderBy,
} from './validators/sensores-configuracao.validators';

@Injectable()
export class ConfiguracoesSensoresService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: QuerySensoresConfiguracaoDto,
  ): Promise<PaginatedConfiguracoesResponse<SensorConfiguracaoResponseDto>> {
    const { page, limit, skip, take } = buildPagination(
      query.page,
      query.limit,
    );
    const where = buildSensorWhere(query);
    const orderBy = {
      [validateSensorOrderBy(query.order_by)]: query.order_direction ?? 'asc',
    } satisfies Prisma.sensoresOrderByWithRelationInput;

    const [records, total] = await this.prisma.$transaction([
      this.prisma.sensores.findMany({
        where,
        orderBy,
        skip,
        take,
        select: sensorConfiguracaoSelect,
      }),
      this.prisma.sensores.count({ where }),
    ]);

    return {
      data: records.map((record) =>
        ConfiguracoesSensoresMapper.toResponse(record),
      ),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id_sensor: number): Promise<SensorConfiguracaoResponseDto> {
    const sensor = await this.findRecordById(id_sensor);
    return ConfiguracoesSensoresMapper.toResponse(sensor);
  }

  async create(
    dto: CreateSensorConfiguracaoDto,
  ): Promise<SensorConfiguracaoResponseDto> {
    await this.validateNomeAvailable(dto.nome);

    const created = await this.prisma.sensores.create({
      data: buildSensorCreateData(dto),
      select: sensorConfiguracaoSelect,
    });

    return ConfiguracoesSensoresMapper.toResponse(created);
  }

  async update(
    id_sensor: number,
    dto: UpdateSensorConfiguracaoDto,
  ): Promise<SensorConfiguracaoResponseDto> {
    await this.findRecordById(id_sensor);

    if (dto.nome !== undefined) {
      await this.validateNomeAvailable(dto.nome, id_sensor);
    }

    const updated = await this.prisma.sensores.update({
      where: { id_sensor },
      data: buildSensorUpdateData(dto),
      select: sensorConfiguracaoSelect,
    });

    return ConfiguracoesSensoresMapper.toResponse(updated);
  }

  async ativar(id_sensor: number): Promise<SensorConfiguracaoResponseDto> {
    return this.updateStatus(id_sensor, statussensor.ATIVO);
  }

  async desativar(id_sensor: number): Promise<SensorConfiguracaoResponseDto> {
    return this.updateStatus(id_sensor, statussensor.INATIVO);
  }

  async findSensoresByTanque(
    id_tanque: number,
    query: QuerySensoresConfiguracaoDto,
  ): Promise<{ data: SensorProcessoOptionResponseDto[]; total: number }> {
    await this.validateTanqueExists(id_tanque);

    const records = await this.prisma.sensores.findMany({
      where: buildSensoresPorTanqueWhere(query),
      orderBy: {
        [validateSensorOrderBy(query.order_by)]: query.order_direction ?? 'asc',
      },
      select: sensorConfiguracaoSelect,
    });

    return {
      data: records.map((record) =>
        ConfiguracoesSensoresMapper.toProcessoOption(record, id_tanque),
      ),
      total: records.length,
    };
  }

  private async updateStatus(
    id_sensor: number,
    status_sensor: statussensor,
  ): Promise<SensorConfiguracaoResponseDto> {
    await this.findRecordById(id_sensor);

    const updated = await this.prisma.sensores.update({
      where: { id_sensor },
      data: { status_sensor },
      select: sensorConfiguracaoSelect,
    });

    return ConfiguracoesSensoresMapper.toResponse(updated);
  }

  private async findRecordById(id_sensor: number) {
    const sensor = await this.prisma.sensores.findFirst({
      where: {
        id_sensor,
        excluido_em: null,
      },
      select: sensorConfiguracaoSelect,
    });

    if (!sensor) {
      throw new NotFoundException('Sensor nao encontrado.');
    }

    return sensor;
  }

  private async validateNomeAvailable(
    nome: string,
    currentId?: number,
  ): Promise<void> {
    const existing = await this.prisma.sensores.findUnique({
      where: { nome: nome.trim() },
      select: { id_sensor: true },
    });

    if (existing && existing.id_sensor !== currentId) {
      throw new ConflictException('Ja existe sensor com este nome.');
    }
  }

  private async validateTanqueExists(id_tanque: number): Promise<void> {
    const tanque = await this.prisma.tanques.findUnique({
      where: { id_tanque },
      select: { id_tanque: true },
    });

    if (!tanque) {
      throw new NotFoundException('Tanque nao encontrado.');
    }
  }
}
