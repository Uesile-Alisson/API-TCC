import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HistoricoController } from '../historico.controller';
import { HistoricoService } from '../historico.service';

type AsyncMock<T = unknown> = jest.Mock<(...args: unknown[]) => Promise<T>>;

type ServiceMock = {
  listHistoricalProcesses: AsyncMock;
  getHistoricalDashboard: AsyncMock;
  findHistoricalProcessById: AsyncMock;
  getHistoricalProcessTanks: AsyncMock;
  getHistoricalProcessAlarms: AsyncMock;
  getHistoricalProcessEvents: AsyncMock;
  getHistoricalProcessReports: AsyncMock;
  getHistoricalVacuumChart: AsyncMock;
  getHistoricalProcessDashboard: AsyncMock;
  getHistoricalTankComparison: AsyncMock;
  generateReportFromHistorico: jest.Mock<() => never>;
};

describe('HistoricoController', () => {
  let controller: HistoricoController;
  let service: ServiceMock;

  beforeEach(() => {
    service = {
      listHistoricalProcesses: jest.fn(),
      getHistoricalDashboard: jest.fn(),
      findHistoricalProcessById: jest.fn(),
      getHistoricalProcessTanks: jest.fn(),
      getHistoricalProcessAlarms: jest.fn(),
      getHistoricalProcessEvents: jest.fn(),
      getHistoricalProcessReports: jest.fn(),
      getHistoricalVacuumChart: jest.fn(),
      getHistoricalProcessDashboard: jest.fn(),
      getHistoricalTankComparison: jest.fn(),
      generateReportFromHistorico: jest.fn<() => never>(),
    };
    controller = new HistoricoController(
      service as unknown as HistoricoService,
    );
  });

  it('listHistoricalProcesses delega para o service com usuario adaptado', async () => {
    const query = { page: 1 };
    const response = { data: [], meta: { total: 0 } };
    service.listHistoricalProcesses.mockResolvedValue(response);

    await expect(
      controller.listHistoricalProcesses(query, currentUser()),
    ).resolves.toBe(response);

    expect(service.listHistoricalProcesses).toHaveBeenCalledWith(
      query,
      expect.objectContaining({
        id_usuario: 7,
        nivel_acesso: 'TECNICO',
      }),
    );
  });

  it('getHistoricalDashboard delega para o service', async () => {
    const query = { agrupamento: 'DIA' as const };
    const response = { kpis: { total_processos: 0 } };
    service.getHistoricalDashboard.mockResolvedValue(response);

    await expect(
      controller.getHistoricalDashboard(query, currentUser()),
    ).resolves.toBe(response);

    expect(service.getHistoricalDashboard).toHaveBeenCalledWith(
      query,
      expect.objectContaining({ nivel_acesso: 'TECNICO' }),
    );
  });

  it('findHistoricalProcessById delega para o service', async () => {
    const response = { processo: { id_processo: 10 } };
    service.findHistoricalProcessById.mockResolvedValue(response);

    await expect(
      controller.findHistoricalProcessById(10, currentUser()),
    ).resolves.toBe(response);

    expect(service.findHistoricalProcessById).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ id_usuario: 7 }),
    );
  });

  it('getHistoricalProcessTanks delega para o service', async () => {
    const response = [{ id_tanque: 2 }];
    service.getHistoricalProcessTanks.mockResolvedValue(response);

    await expect(
      controller.getHistoricalProcessTanks(10, currentUser()),
    ).resolves.toBe(response);

    expect(service.getHistoricalProcessTanks).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ id_usuario: 7 }),
    );
  });

  it('getHistoricalProcessAlarms delega id, query e usuario', async () => {
    const query = { page: 1 };
    const response = { data: [], meta: { total: 0 } };
    service.getHistoricalProcessAlarms.mockResolvedValue(response);

    await expect(
      controller.getHistoricalProcessAlarms(10, query, currentUser()),
    ).resolves.toBe(response);

    expect(service.getHistoricalProcessAlarms).toHaveBeenCalledWith(
      10,
      query,
      expect.objectContaining({ id_usuario: 7 }),
    );
  });

  it('getHistoricalProcessEvents delega id, query e usuario', async () => {
    const query = { limit: 5 };
    const response = { data: [], meta: { total: 0 } };
    service.getHistoricalProcessEvents.mockResolvedValue(response);

    await expect(
      controller.getHistoricalProcessEvents(10, query, currentUser()),
    ).resolves.toBe(response);

    expect(service.getHistoricalProcessEvents).toHaveBeenCalledWith(
      10,
      query,
      expect.objectContaining({ id_usuario: 7 }),
    );
  });

  it('getHistoricalProcessReports delega e nao chama geracao de relatorio', async () => {
    const response = [{ id_relatorio: 1 }];
    service.getHistoricalProcessReports.mockResolvedValue(response);

    await expect(
      controller.getHistoricalProcessReports(10, currentUser()),
    ).resolves.toBe(response);

    expect(service.getHistoricalProcessReports).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ id_usuario: 7 }),
    );
    expect(service.generateReportFromHistorico).not.toHaveBeenCalled();
  });

  it('getHistoricalVacuumChart delega id, query e usuario', async () => {
    const query = { limite_pontos: 50 };
    const response = { id_processo: 10, data: [] };
    service.getHistoricalVacuumChart.mockResolvedValue(response);

    await expect(
      controller.getHistoricalVacuumChart(10, query, currentUser()),
    ).resolves.toBe(response);

    expect(service.getHistoricalVacuumChart).toHaveBeenCalledWith(
      10,
      query,
      expect.objectContaining({ id_usuario: 7 }),
    );
  });

  it('getHistoricalProcessDashboard delega para o service', async () => {
    const response = { kpis: { total_processos: 1 } };
    service.getHistoricalProcessDashboard.mockResolvedValue(response);

    await expect(
      controller.getHistoricalProcessDashboard(10, currentUser()),
    ).resolves.toBe(response);

    expect(service.getHistoricalProcessDashboard).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ id_usuario: 7 }),
    );
  });

  it('getHistoricalTankComparison delega para o service', async () => {
    const response = { data: [] };
    service.getHistoricalTankComparison.mockResolvedValue(response);

    await expect(
      controller.getHistoricalTankComparison(10, currentUser()),
    ).resolves.toBe(response);

    expect(service.getHistoricalTankComparison).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ id_usuario: 7 }),
    );
  });
});

function currentUser() {
  return {
    id_usuario: 7,
    nivel_acesso: { nome: 'TECNICO' },
  } as unknown as Parameters<HistoricoController['listHistoricalProcesses']>[1];
}
