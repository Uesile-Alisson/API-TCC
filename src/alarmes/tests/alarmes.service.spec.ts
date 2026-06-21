import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import { AlarmesService } from '../alarmes.service';
import { AlarmeLogService } from '../logs';
import { AlarmeMapper } from '../mappers';
import { AlarmesRepository } from '../repositories';
import { AlarmesSocketGateway } from '../socket';
import { AlarmeStateValidator } from '../validators';

type AsyncMock<T = unknown> = Mock<(...args: unknown[]) => Promise<T>>;
type SyncMock<T = unknown> = Mock<(...args: unknown[]) => T>;

const asyncMock = <T = unknown>(): AsyncMock<T> =>
  jest.fn<(...args: unknown[]) => Promise<T>>();

const syncMock = <T = unknown>(): SyncMock<T> =>
  jest.fn<(...args: unknown[]) => T>();

type RepositoryMock = {
  listAndCount: AsyncMock;
  getDashboard: AsyncMock;
  findById: AsyncMock;
  findDetailsById: AsyncMock;
  resolve: AsyncMock;
};

type MapperMock = {
  toListResponse: SyncMock;
  toDashboard: SyncMock;
  toResponse: SyncMock;
  toDetails: SyncMock;
  toResolveResult: SyncMock;
};

type ValidatorMock = {
  validateExists: SyncMock;
  validateCanResolve: SyncMock;
};

type LogServiceMock = {
  logResolved: AsyncMock;
};

type SocketGatewayMock = {
  emitAlarmResolved: SyncMock;
  emitDashboardUpdated: SyncMock;
};

describe('AlarmesService', () => {
  let service: AlarmesService;
  let repository: RepositoryMock;
  let mapper: MapperMock;
  let validator: ValidatorMock;
  let logService: LogServiceMock;
  let socketGateway: SocketGatewayMock;

  beforeEach(() => {
    repository = {
      listAndCount: asyncMock(),
      getDashboard: asyncMock(),
      findById: asyncMock(),
      findDetailsById: asyncMock(),
      resolve: asyncMock(),
    };
    mapper = {
      toListResponse: syncMock(),
      toDashboard: syncMock(),
      toResponse: syncMock(),
      toDetails: syncMock(),
      toResolveResult: syncMock(),
    };
    validator = {
      validateExists: syncMock(),
      validateCanResolve: syncMock(),
    };
    logService = {
      logResolved: asyncMock().mockResolvedValue({
        created: true,
        id_log_operacional: 1,
      }),
    };
    socketGateway = {
      emitAlarmResolved: syncMock(),
      emitDashboardUpdated: syncMock(),
    };

    service = new AlarmesService(
      repository as unknown as AlarmesRepository,
      mapper as unknown as AlarmeMapper,
      validator as unknown as AlarmeStateValidator,
      logService as unknown as AlarmeLogService,
      socketGateway as unknown as AlarmesSocketGateway,
    );
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('list chama repository.listAndCount e mapper.toListResponse', async () => {
    const query = { page: 1, limit: 10 };
    const rawAlarme = makeRawAlarme();
    const response = { data: [{ id_alarme: 10 }], meta: { total: 1 } };
    repository.listAndCount.mockResolvedValue({
      data: [rawAlarme],
      total: 1,
      page: 1,
      limit: 10,
    });
    mapper.toListResponse.mockReturnValue(response);

    await expect(service.list(query)).resolves.toBe(response);

    expect(repository.listAndCount).toHaveBeenCalledWith(query);
    expect(mapper.toListResponse).toHaveBeenCalledWith([rawAlarme], 1, 1, 10);
  });

  it('list bloqueia periodo invalido antes de chamar repository', async () => {
    const query = {
      ocorrido_de: new Date('2026-02-01T00:00:00Z'),
      ocorrido_ate: new Date('2026-01-01T00:00:00Z'),
    };

    await expect(service.list(query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.listAndCount).not.toHaveBeenCalled();
  });

  it('getDashboard chama repository.getDashboard e mapper.toDashboard', async () => {
    const query = { severidade: severidadealarme.CRITICO };
    const rawDashboard = makeRawDashboard();
    const dashboard = { total: 1, generated_at: new Date() };
    repository.getDashboard.mockResolvedValue(rawDashboard);
    mapper.toDashboard.mockReturnValue(dashboard);

    await expect(service.getDashboard(query)).resolves.toBe(dashboard);

    expect(repository.getDashboard).toHaveBeenCalledWith(query);
    expect(mapper.toDashboard).toHaveBeenCalledWith(rawDashboard);
  });

  it('findActive aplica apenas_ativos e mapeia lista', async () => {
    const query = { page: 2 };
    const rawAlarme = makeRawAlarme();
    repository.listAndCount.mockResolvedValue({
      data: [rawAlarme],
      total: 1,
      page: 2,
      limit: 20,
    });

    await service.findActive(query);

    expect(repository.listAndCount).toHaveBeenCalledWith({
      ...query,
      apenas_ativos: true,
    });
    expect(mapper.toListResponse).toHaveBeenCalledWith([rawAlarme], 1, 2, 20);
  });

  it('findCritical aplica apenas_criticos e mapeia lista', async () => {
    const query = { page: 2 };
    const rawAlarme = makeRawAlarme();
    repository.listAndCount.mockResolvedValue({
      data: [rawAlarme],
      total: 1,
      page: 2,
      limit: 20,
    });

    await service.findCritical(query);

    expect(repository.listAndCount).toHaveBeenCalledWith({
      ...query,
      apenas_criticos: true,
    });
    expect(mapper.toListResponse).toHaveBeenCalledWith([rawAlarme], 1, 2, 20);
  });

  it('findByProcess aplica id_processo e mapeia lista', async () => {
    const query = { limit: 5 };
    const rawAlarme = makeRawAlarme();
    repository.listAndCount.mockResolvedValue({
      data: [rawAlarme],
      total: 1,
      page: 1,
      limit: 5,
    });

    await service.findByProcess(99, query);

    expect(repository.listAndCount).toHaveBeenCalledWith({
      ...query,
      id_processo: 99,
    });
    expect(mapper.toListResponse).toHaveBeenCalledWith([rawAlarme], 1, 1, 5);
  });

  it('findActiveByProcess aplica id_processo e apenas_ativos', async () => {
    const query = { limit: 5 };
    repository.listAndCount.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 5,
    });

    await service.findActiveByProcess(99, query);

    expect(repository.listAndCount).toHaveBeenCalledWith({
      ...query,
      id_processo: 99,
      apenas_ativos: true,
    });
  });

  it('findCriticalByProcess aplica id_processo e apenas_criticos', async () => {
    const query = { limit: 5 };
    repository.listAndCount.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 5,
    });

    await service.findCriticalByProcess(99, query);

    expect(repository.listAndCount).toHaveBeenCalledWith({
      ...query,
      id_processo: 99,
      apenas_criticos: true,
    });
  });

  it('findById valida existencia, mapeia e retorna response', async () => {
    const rawAlarme = makeRawAlarme();
    const response = { id_alarme: 10 };
    repository.findById.mockResolvedValue(rawAlarme);
    mapper.toResponse.mockReturnValue(response);

    await expect(service.findById(10)).resolves.toBe(response);

    expect(repository.findById).toHaveBeenCalledWith(10);
    expect(validator.validateExists).toHaveBeenCalledWith(rawAlarme);
    expect(mapper.toResponse).toHaveBeenCalledWith(rawAlarme);
  });

  it('findDetailsById valida existencia, mapeia e retorna details', async () => {
    const rawAlarme = makeRawAlarme();
    const details = { id_alarme: 10, processo: null };
    repository.findDetailsById.mockResolvedValue(rawAlarme);
    mapper.toDetails.mockReturnValue(details);

    await expect(service.findDetailsById(10)).resolves.toBe(details);

    expect(repository.findDetailsById).toHaveBeenCalledWith(10);
    expect(validator.validateExists).toHaveBeenCalledWith(rawAlarme);
    expect(mapper.toDetails).toHaveBeenCalledWith(rawAlarme);
  });

  it('resolve executa fluxo completo de resolucao', async () => {
    const rawAlarme = makeRawAlarme();
    const resolvedAt = new Date('2026-06-21T10:00:00Z');
    const resolvedAlarme = makeRawAlarme({
      status_alarme: statusalarme.RESOLVIDO,
      resolvido_em: resolvedAt,
    });
    const resolveResult = {
      success: true,
      id_alarme: 10,
      action: 'RESOLVED',
      status_alarme: 'RESOLVIDO',
    };
    const dashboard = { total: 1, generated_at: new Date() };
    repository.findById.mockResolvedValue(rawAlarme);
    repository.resolve.mockResolvedValue(resolvedAlarme);
    repository.getDashboard.mockResolvedValue(makeRawDashboard());
    mapper.toResolveResult.mockReturnValue(resolveResult);
    mapper.toDashboard.mockReturnValue(dashboard);

    await expect(
      service.resolve(
        10,
        { observacao: ' Verificado em campo ' },
        { id_usuario: 7, login: 'tecnico' },
      ),
    ).resolves.toBe(resolveResult);

    expect(repository.findById).toHaveBeenCalledWith(10);
    expect(validator.validateCanResolve).toHaveBeenCalledWith(rawAlarme);
    expect(repository.resolve).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        id_usuario_responsavel: 7,
        resolvido_em: expect.any(Date),
      }),
    );
    expect(validator.validateExists).toHaveBeenCalledWith(resolvedAlarme);
    expect(logService.logResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        id_alarme: 10,
        id_usuario: 7,
        id_processo: 20,
        titulo: 'Falha de pressao',
        severidade: severidadealarme.CRITICO,
        observacao: 'Verificado em campo',
        resolvido_em: resolvedAt,
      }),
    );
    expect(mapper.toResolveResult).toHaveBeenCalledWith(resolvedAlarme, 7);
    expect(socketGateway.emitAlarmResolved).toHaveBeenCalledWith(resolveResult);
    expect(repository.getDashboard).toHaveBeenCalledWith({});
    expect(mapper.toDashboard).toHaveBeenCalledWith(makeRawDashboard());
    expect(socketGateway.emitDashboardUpdated).toHaveBeenCalledWith(dashboard);
  });

  it('resolve propaga conflito quando validator bloqueia alarme resolvido', async () => {
    const rawAlarme = makeRawAlarme({
      status_alarme: statusalarme.RESOLVIDO,
      resolvido_em: new Date('2026-06-21T10:00:00Z'),
    });
    repository.findById.mockResolvedValue(rawAlarme);
    validator.validateCanResolve.mockImplementation(() => {
      throw new ConflictException('Alarme ja resolvido.');
    });

    await expect(
      service.resolve(10, {}, { id_usuario: 7 }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(repository.resolve).not.toHaveBeenCalled();
    expect(logService.logResolved).not.toHaveBeenCalled();
    expect(socketGateway.emitAlarmResolved).not.toHaveBeenCalled();
    expect(socketGateway.emitDashboardUpdated).not.toHaveBeenCalled();
  });

  it('resolve bloqueia usuario sem identificador valido', async () => {
    await expect(
      service.resolve(10, {}, { login: 'sem-id' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.resolve).not.toHaveBeenCalled();
  });

  it('resolve registra observacao nula quando texto vem vazio', async () => {
    arrangeResolve();

    await service.resolve(10, { observacao: '   ' }, { id_usuario: 7 });

    expect(logService.logResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        observacao: null,
      }),
    );
  });

  it('resolve registra observacao preenchida com trim', async () => {
    arrangeResolve();

    await service.resolve(
      10,
      { observacao: ' Verificado em campo ' },
      { id_usuario: 7 },
    );

    expect(logService.logResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        observacao: 'Verificado em campo',
      }),
    );
  });

  function arrangeResolve(): void {
    const resolvedAlarme = makeRawAlarme({
      status_alarme: statusalarme.RESOLVIDO,
      resolvido_em: new Date('2026-06-21T10:00:00Z'),
    });
    repository.findById.mockResolvedValue(makeRawAlarme());
    repository.resolve.mockResolvedValue(resolvedAlarme);
    repository.getDashboard.mockResolvedValue(makeRawDashboard());
    mapper.toResolveResult.mockReturnValue({
      success: true,
      id_alarme: 10,
      action: 'RESOLVED',
      status_alarme: 'RESOLVIDO',
    });
    mapper.toDashboard.mockReturnValue({ total: 1 });
  }
});

function makeRawAlarme(overrides: Record<string, unknown> = {}) {
  return {
    id_alarme: 10,
    id_mqtt_mensagem: 30,
    id_usuario_responsavel: null,
    titulo: 'Falha de pressao',
    descricao: 'Pressao fora do esperado.',
    tipo_alarme: tipoalarme.PROCESSO,
    severidade: severidadealarme.CRITICO,
    status_alarme: statusalarme.ATIVO,
    origem_alarme: origemalarme.BACKEND,
    valor_detectado: '-80',
    unidade: 'kPa',
    ocorrido_em: new Date('2026-06-21T09:00:00Z'),
    resolvido_em: null,
    excluido_em: null,
    id_processo: 20,
    id_processo_tanque: 21,
    id_processo_tanque_sensor: 22,
    ...overrides,
  };
}

function makeRawDashboard() {
  return {
    total: 1,
    ativos: 1,
    resolvidos: 0,
    criticos: 1,
    medios: 0,
    infos: 0,
    por_severidade: [{ severidade: severidadealarme.CRITICO, total: 1 }],
    por_status: [{ status_alarme: statusalarme.ATIVO, total: 1 }],
    por_tipo: [{ tipo_alarme: tipoalarme.PROCESSO, total: 1 }],
    por_origem: [{ origem_alarme: origemalarme.BACKEND, total: 1 }],
    ultimos_criticos: [makeRawAlarme()],
    ultimos_ativos: [makeRawAlarme()],
  };
}
