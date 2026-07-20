import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  motivoresolucaoalarme,
  statusalarme,
  statussensor,
  statusintegridadesensor,
  tiposensor,
  tipoalarme,
} from '@prisma/client';
import { MqttConfigService } from '../../mqtt-hardware/config/mqtt-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginatedConfiguracoesResponse } from '../common/paginated-configuracoes-response.interface';
import { ConfiguracoesCurrentUser } from '../common/configuracoes-current-user.interface';
import { buildPagination } from '../common/query.helpers';
import {
  ConfiguracoesSensoresMapper,
  sensorConfiguracaoSelect,
} from './configuracoes-sensores.mapper';
import { CreateSensorConfiguracaoDto } from './dto/create-sensor-configuracao.dto';
import { CalibrarSensorDto } from './dto/calibrar-sensor.dto';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationalInterlock: MqttConfigService,
  ) {}

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
    return await this.operationalInterlock.executeProtectedEquipmentMutation(
      'CREATE_SENSOR',
      async (tx) => {
        await this.validateNomeAvailable(dto.nome, undefined, tx);

        const created = await tx.sensores.create({
          data: buildSensorCreateData(dto),
          select: sensorConfiguracaoSelect,
        });

        return ConfiguracoesSensoresMapper.toResponse(created);
      },
    );
  }

  async update(
    id_sensor: number,
    dto: UpdateSensorConfiguracaoDto,
  ): Promise<SensorConfiguracaoResponseDto> {
    if (
      dto.status_sensor === statussensor.ATIVO ||
      dto.fator_calibracao !== undefined
    ) {
      throw new ConflictException(
        'Ativacao e fator de calibracao exigem o fluxo tecnico de calibracao/liberacao.',
      );
    }

    return await this.operationalInterlock.executeProtectedEquipmentMutation(
      'UPDATE_SENSOR',
      async (tx) => {
        const current = await this.findRecordById(id_sensor, tx);
        const minimum =
          dto.limite_minimo_operacional ??
          current.limite_minimo_operacional?.toNumber() ??
          null;
        const maximum =
          dto.limite_maximo_operacional ??
          current.limite_maximo_operacional?.toNumber() ??
          null;
        if (minimum !== null && maximum !== null && minimum >= maximum) {
          throw new BadRequestException(
            'limite_minimo_operacional deve ser menor que limite_maximo_operacional.',
          );
        }

        if (dto.nome !== undefined) {
          await this.validateNomeAvailable(dto.nome, id_sensor, tx);
        }

        const updated = await tx.sensores.update({
          where: { id_sensor },
          data: buildSensorUpdateData(dto),
          select: sensorConfiguracaoSelect,
        });

        return ConfiguracoesSensoresMapper.toResponse(updated);
      },
    );
  }

  async iniciarCalibracao(
    id_sensor: number,
    currentUser: ConfiguracoesCurrentUser,
  ): Promise<SensorConfiguracaoResponseDto> {
    this.validateCurrentUser(currentUser);
    return await this.operationalInterlock.executeProtectedEquipmentMutation(
      'START_SENSOR_CALIBRATION',
      async (tx) => {
        const sensor = await this.findRecordById(id_sensor, tx);

        if (sensor.tipo_sensor !== tiposensor.VACUO) {
          throw new ConflictException(
            'O modo de calibracao numerica e exclusivo para sensores de vacuo.',
          );
        }

        const updated = await tx.sensores.update({
          where: { id_sensor },
          data: {
            status_sensor: statussensor.INATIVO,
            status_integridade: statusintegridadesensor.PENDENTE_CALIBRACAO,
            modo_calibracao_ativo: true,
            calibracao_iniciada_em: new Date(),
            ultimo_valor_bruto: null,
            integridade_ultimo_erro: null,
            id_usuario_calibracao: currentUser.id_usuario,
          },
          select: sensorConfiguracaoSelect,
        });

        return ConfiguracoesSensoresMapper.toResponse(updated);
      },
    );
  }

  async calibrar(
    id_sensor: number,
    dto: CalibrarSensorDto,
    currentUser: ConfiguracoesCurrentUser,
  ): Promise<SensorConfiguracaoResponseDto> {
    this.validateCurrentUser(currentUser);
    return await this.operationalInterlock.executeProtectedEquipmentMutation(
      'FINISH_SENSOR_CALIBRATION',
      async (tx) => {
        const sensor = await this.findRecordById(id_sensor, tx);

        if (!sensor.modo_calibracao_ativo) {
          throw new ConflictException(
            'Inicie o modo de calibracao antes de finalizar a calibracao.',
          );
        }

        const observed =
          dto.valor_observado ?? sensor.ultimo_valor_bruto?.toNumber() ?? null;
        if (observed === null || !Number.isFinite(observed) || observed === 0) {
          throw new BadRequestException(
            'Valor observado valido e diferente de zero e obrigatorio.',
          );
        }

        const offset = dto.offset_calibracao ?? 0;
        const factor = (dto.valor_referencia - offset) / observed;
        if (!Number.isFinite(factor) || factor <= 0) {
          throw new BadRequestException(
            'A referencia e o valor observado resultaram em fator de calibracao invalido.',
          );
        }

        const validUntil = dto.valida_ate ? new Date(dto.valida_ate) : null;
        if (validUntil && validUntil <= new Date()) {
          throw new BadRequestException(
            'calibracao_valida_ate deve ser uma data futura.',
          );
        }

        const now = new Date();
        const updated = await tx.sensores.update({
          where: { id_sensor },
          data: {
            fator_calibracao: new Prisma.Decimal(factor),
            offset_calibracao: new Prisma.Decimal(offset),
            status_sensor: statussensor.INATIVO,
            status_integridade: statusintegridadesensor.VALIDO,
            calibrado_em: now,
            calibracao_valida_ate: validUntil,
            calibracao_referencia: dto.referencia.trim(),
            calibracao_incerteza:
              dto.incerteza === undefined
                ? null
                : new Prisma.Decimal(dto.incerteza),
            calibracao_observacoes: dto.observacoes?.trim() ?? null,
            id_usuario_calibracao: currentUser.id_usuario,
            modo_calibracao_ativo: false,
            integridade_validada_em: now,
            integridade_ultimo_erro: null,
            liberado_em: null,
            id_usuario_liberacao: null,
          },
          select: sensorConfiguracaoSelect,
        });

        return ConfiguracoesSensoresMapper.toResponse(updated);
      },
    );
  }

  async ativar(
    id_sensor: number,
    currentUser: ConfiguracoesCurrentUser,
  ): Promise<SensorConfiguracaoResponseDto> {
    this.validateCurrentUser(currentUser);
    return await this.operationalInterlock.executeProtectedEquipmentMutation(
      'ACTIVATE_SENSOR',
      async (tx) => {
        const sensor = await this.findRecordById(id_sensor, tx);
        const now = new Date();

        if (
          sensor.tipo_sensor === tiposensor.VACUO &&
          (sensor.modo_calibracao_ativo ||
            sensor.status_integridade !== statusintegridadesensor.VALIDO ||
            sensor.calibrado_em === null ||
            (sensor.calibracao_valida_ate !== null &&
              sensor.calibracao_valida_ate <= now))
        ) {
          throw new ConflictException(
            'Sensor de vacuo sem calibracao valida ou ainda sem liberacao tecnica.',
          );
        }

        const released = await tx.sensores.update({
          where: { id_sensor },
          data: {
            status_sensor: statussensor.ATIVO,
            liberado_em: now,
            id_usuario_liberacao: currentUser.id_usuario,
            integridade_validada_em: now,
            integridade_ultimo_erro: null,
          },
          select: sensorConfiguracaoSelect,
        });
        await tx.alarmes.updateMany({
          where: {
            id_processo_tanque_sensor: { not: null },
            processostanquessensores: { id_sensor },
            tipo_alarme: tipoalarme.SENSOR,
            status_alarme: statusalarme.ATIVO,
            excluido_em: null,
          },
          data: {
            status_alarme: statusalarme.NORMALIZADO,
            normalizado_em: now,
            resolvido_em: now,
            ultima_validacao_em: now,
            id_usuario_responsavel: currentUser.id_usuario,
            motivo_resolucao:
              motivoresolucaoalarme.NORMALIZADO_CONFIRMADO_PELO_USUARIO,
          },
        });

        return ConfiguracoesSensoresMapper.toResponse(released);
      },
    );
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
    return await this.operationalInterlock.executeProtectedEquipmentMutation(
      status_sensor === statussensor.ATIVO
        ? 'ACTIVATE_SENSOR'
        : 'DEACTIVATE_SENSOR',
      async (tx) => {
        await this.findRecordById(id_sensor, tx);

        const updated = await tx.sensores.update({
          where: { id_sensor },
          data: { status_sensor },
          select: sensorConfiguracaoSelect,
        });

        return ConfiguracoesSensoresMapper.toResponse(updated);
      },
    );
  }

  private validateCurrentUser(currentUser: ConfiguracoesCurrentUser): void {
    if (
      !Number.isInteger(currentUser?.id_usuario) ||
      currentUser.id_usuario <= 0
    ) {
      throw new BadRequestException('Usuario tecnico invalido.');
    }
  }

  private async findRecordById(
    id_sensor: number,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const sensor = await client.sensores.findFirst({
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
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const existing = await client.sensores.findUnique({
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
