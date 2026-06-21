import { BadRequestException, Injectable } from '@nestjs/common';
import { ALARME_MESSAGES } from './constants';
import { ListAlarmesQueryDto, ResolveAlarmeDto } from './dto';
import type {
  AlarmeDashboard,
  AlarmeDetails,
  AlarmeListResponse,
  AlarmeResponse,
  ResolveAlarmeResult,
} from './interfaces';
import { AlarmeLogService } from './logs';
import { AlarmeMapper } from './mappers';
import { AlarmesRepository } from './repositories';
import { AlarmesSocketGateway } from './socket';
import { AlarmeStateValidator } from './validators';

interface AlarmesCurrentUser {
  id_usuario?: number;
  id?: number;
  sub?: number;
  login?: string;
  nivel_acesso?: string;
  id_nivel_acesso?: number;
}

@Injectable()
export class AlarmesService {
  constructor(
    private readonly alarmesRepository: AlarmesRepository,
    private readonly alarmeMapper: AlarmeMapper,
    private readonly alarmeStateValidator: AlarmeStateValidator,
    private readonly alarmeLogService: AlarmeLogService,
    private readonly alarmesSocketGateway: AlarmesSocketGateway,
  ) {}

  async list(query: ListAlarmesQueryDto = {}): Promise<AlarmeListResponse> {
    this.validateDateRange(query);

    const { data, total, page, limit } =
      await this.alarmesRepository.listAndCount(query);

    return this.alarmeMapper.toListResponse(data, total, page, limit);
  }

  async getDashboard(
    query: ListAlarmesQueryDto = {},
  ): Promise<AlarmeDashboard> {
    this.validateDateRange(query);

    const rawDashboard = await this.alarmesRepository.getDashboard(query);

    return this.alarmeMapper.toDashboard(rawDashboard);
  }

  async findActive(
    query: ListAlarmesQueryDto = {},
  ): Promise<AlarmeListResponse> {
    this.validateDateRange(query);

    const { data, total, page, limit } =
      await this.alarmesRepository.listAndCount({
        ...query,
        apenas_ativos: true,
      });

    return this.alarmeMapper.toListResponse(data, total, page, limit);
  }

  async findCritical(
    query: ListAlarmesQueryDto = {},
  ): Promise<AlarmeListResponse> {
    this.validateDateRange(query);

    const { data, total, page, limit } =
      await this.alarmesRepository.listAndCount({
        ...query,
        apenas_criticos: true,
      });

    return this.alarmeMapper.toListResponse(data, total, page, limit);
  }

  async findByProcess(
    id_processo: number,
    query: ListAlarmesQueryDto = {},
  ): Promise<AlarmeListResponse> {
    this.validateDateRange(query);

    const { data, total, page, limit } =
      await this.alarmesRepository.listAndCount({
        ...query,
        id_processo,
      });

    return this.alarmeMapper.toListResponse(data, total, page, limit);
  }

  async findActiveByProcess(
    id_processo: number,
    query: ListAlarmesQueryDto = {},
  ): Promise<AlarmeListResponse> {
    this.validateDateRange(query);

    const { data, total, page, limit } =
      await this.alarmesRepository.listAndCount({
        ...query,
        id_processo,
        apenas_ativos: true,
      });

    return this.alarmeMapper.toListResponse(data, total, page, limit);
  }

  async findCriticalByProcess(
    id_processo: number,
    query: ListAlarmesQueryDto = {},
  ): Promise<AlarmeListResponse> {
    this.validateDateRange(query);

    const { data, total, page, limit } =
      await this.alarmesRepository.listAndCount({
        ...query,
        id_processo,
        apenas_criticos: true,
      });

    return this.alarmeMapper.toListResponse(data, total, page, limit);
  }

  async findById(id_alarme: number): Promise<AlarmeResponse> {
    const alarme = await this.alarmesRepository.findById(id_alarme);

    this.alarmeStateValidator.validateExists(alarme);

    return this.alarmeMapper.toResponse(alarme);
  }

  async findDetailsById(id_alarme: number): Promise<AlarmeDetails> {
    const alarme = await this.alarmesRepository.findDetailsById(id_alarme);

    this.alarmeStateValidator.validateExists(alarme);

    return this.alarmeMapper.toDetails(alarme);
  }

  async resolve(
    id_alarme: number,
    dto: ResolveAlarmeDto,
    currentUser: AlarmesCurrentUser,
  ): Promise<ResolveAlarmeResult> {
    const id_usuario_responsavel = this.getCurrentUserId(currentUser);
    const alarme = await this.alarmesRepository.findById(id_alarme);

    this.alarmeStateValidator.validateCanResolve(alarme);

    const resolvedAt = new Date();
    const resolvedAlarme = await this.alarmesRepository.resolve(id_alarme, {
      id_usuario_responsavel,
      resolvido_em: resolvedAt,
    });

    this.alarmeStateValidator.validateExists(resolvedAlarme);

    const observacao = this.sanitizeResolveObservation(dto);

    await this.alarmeLogService.logResolved({
      id_alarme: resolvedAlarme.id_alarme,
      id_usuario: id_usuario_responsavel,
      id_processo: resolvedAlarme.id_processo,
      titulo: resolvedAlarme.titulo,
      severidade: String(resolvedAlarme.severidade),
      observacao,
      resolvido_em: resolvedAlarme.resolvido_em ?? resolvedAt,
    });

    const result = this.alarmeMapper.toResolveResult(
      resolvedAlarme,
      id_usuario_responsavel,
    );

    this.alarmesSocketGateway.emitAlarmResolved(result);

    const dashboard = this.alarmeMapper.toDashboard(
      await this.alarmesRepository.getDashboard({}),
    );

    this.alarmesSocketGateway.emitDashboardUpdated(dashboard);

    return result;
  }

  private validateDateRange(query: ListAlarmesQueryDto): void {
    if (
      query.ocorrido_de &&
      query.ocorrido_ate &&
      query.ocorrido_de > query.ocorrido_ate
    ) {
      throw new BadRequestException(ALARME_MESSAGES.INVALID_DATE_RANGE);
    }
  }

  private getCurrentUserId(currentUser: AlarmesCurrentUser): number {
    const userId = [
      currentUser.id_usuario,
      currentUser.id,
      currentUser.sub,
    ].find((value): value is number => {
      return typeof value === 'number' && Number.isInteger(value) && value > 0;
    });

    if (!userId) {
      throw new BadRequestException(
        'Usuario autenticado invalido para resolver alarme.',
      );
    }

    return userId;
  }

  private sanitizeResolveObservation(dto: ResolveAlarmeDto): string | null {
    const observacao = dto.observacao?.trim();

    return observacao ? observacao : null;
  }
}
