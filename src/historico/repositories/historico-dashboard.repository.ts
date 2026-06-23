import { Injectable } from '@nestjs/common';
import { Prisma, severidadealarme, statusprocesso } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HISTORICO_PROCESS_STATUS } from '../constants';
import type { HistoricoDashboardQueryDto } from '../dto';

type HistoricoDateField = 'criado_em' | 'iniciado_em' | 'finalizado_em';
type DecimalCompatible = Prisma.Decimal | number | string | null;

const dashboardProcessSelect = {
  id_processo: true,
  nome_processo: true,
  status_processo: true,
  vacuo_alvo: true,
  vacuo_inicial: true,
  vacuo_final: true,
  vacuo_medio: true,
  eficiencia: true,
  tempo_maximo: true,
  tempo_execucao: true,
  iniciado_em: true,
  finalizado_em: true,
  criado_em: true,
  parada_emergencia: true,
  _count: {
    select: {
      alarmes: true,
      eventos: true,
      relatorios: true,
    },
  },
} satisfies Prisma.processosSelect;

const dashboardTankSelect = {
  id_processo_tanque: true,
  id_tanque: true,
  status_tanque_processo: true,
  vacuo_alvo: true,
  vacuo_inicial: true,
  vacuo_final: true,
  vacuo_medio: true,
  eficiencia: true,
  iniciado_em: true,
  finalizado_em: true,
  tanques: {
    select: {
      id_tanque: true,
      nome: true,
    },
  },
  processos: {
    select: {
      id_processo: true,
      status_processo: true,
      tempo_execucao: true,
    },
  },
  _count: {
    select: {
      alarmes: true,
    },
  },
} satisfies Prisma.processostanquesSelect;

const dashboardAlarmSelect = {
  id_alarme: true,
  severidade: true,
  status_alarme: true,
  ocorrido_em: true,
  resolvido_em: true,
} satisfies Prisma.alarmesSelect;

const dashboardEventSelect = {
  id_evento_processo: true,
  severidade_evento: true,
  ocorrido_em: true,
  id_processo: true,
  processos: {
    select: {
      id_processo: true,
      status_processo: true,
    },
  },
} satisfies Prisma.eventosSelect;

const dashboardCriticalAlarmProcessSelect = {
  id_processo: true,
  processostanques: {
    select: {
      id_processo: true,
    },
  },
  processostanquessensores: {
    select: {
      processostanques: {
        select: {
          id_processo: true,
        },
      },
    },
  },
} satisfies Prisma.alarmesSelect;

const dashboardCriticalAlarmTankSelect = {
  id_processo_tanque: true,
  processostanquessensores: {
    select: {
      id_processo_tanque: true,
    },
  },
} satisfies Prisma.alarmesSelect;

type DashboardProcessRecord = Prisma.processosGetPayload<{
  select: typeof dashboardProcessSelect;
}>;

type DashboardTankRecord = Prisma.processostanquesGetPayload<{
  select: typeof dashboardTankSelect;
}>;

type DashboardAlarmRecord = Prisma.alarmesGetPayload<{
  select: typeof dashboardAlarmSelect;
}>;

type DashboardEventRecord = Prisma.eventosGetPayload<{
  select: typeof dashboardEventSelect;
}>;

type DashboardCriticalAlarmProcessRecord = Prisma.alarmesGetPayload<{
  select: typeof dashboardCriticalAlarmProcessSelect;
}>;

type DashboardCriticalAlarmTankRecord = Prisma.alarmesGetPayload<{
  select: typeof dashboardCriticalAlarmTankSelect;
}>;

export interface HistoricoDashboardProcessRepositoryRaw {
  id_processo: number;
  nome_processo: string | null;
  status_processo: statusprocesso;
  vacuo_alvo: DecimalCompatible;
  vacuo_inicial: DecimalCompatible;
  vacuo_final: DecimalCompatible;
  vacuo_medio: DecimalCompatible;
  eficiencia: DecimalCompatible;
  tempo_maximo: number;
  tempo_execucao: number | null;
  iniciado_em: Date | null;
  finalizado_em: Date | null;
  criado_em: Date;
  parada_emergencia: boolean;
  total_alarmes: number;
  total_alarmes_criticos: number;
  total_eventos: number;
  possui_relatorio: boolean;
}

export interface HistoricoDashboardTankRepositoryRaw {
  id_processo_tanque: number;
  id_tanque: number;
  nome_tanque: string;
  status_tanque_processo: string;
  vacuo_alvo: DecimalCompatible;
  vacuo_inicial: DecimalCompatible;
  vacuo_final: DecimalCompatible;
  vacuo_medio: DecimalCompatible;
  eficiencia: DecimalCompatible;
  tempo_execucao: number | null;
  total_alarmes: number;
  total_alarmes_criticos: number;
}

export type HistoricoDashboardAlarmRepositoryRaw = DashboardAlarmRecord;

export interface HistoricoDashboardEventRepositoryRaw {
  id_evento_processo: number;
  severidade_evento: DashboardEventRecord['severidade_evento'];
  ocorrido_em: Date;
}

export interface HistoricoDashboardRepositoryDataset {
  processos: HistoricoDashboardProcessRepositoryRaw[];
  tanques: HistoricoDashboardTankRepositoryRaw[];
  alarmes: HistoricoDashboardAlarmRepositoryRaw[];
  eventos: HistoricoDashboardEventRepositoryRaw[];
}

@Injectable()
export class HistoricoDashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findProcessesForDashboard(
    query: HistoricoDashboardQueryDto,
  ): Promise<HistoricoDashboardProcessRepositoryRaw[]> {
    const processes = await this.prisma.processos.findMany({
      where: this.buildDashboardProcessWhere(query),
      orderBy: {
        finalizado_em: 'desc',
      },
      select: dashboardProcessSelect,
    });

    return this.mapDashboardProcesses(processes);
  }

  async findTanksForDashboard(
    query: HistoricoDashboardQueryDto,
  ): Promise<HistoricoDashboardTankRepositoryRaw[]> {
    const tanks = await this.prisma.processostanques.findMany({
      where: this.buildDashboardTankWhere(query),
      orderBy: {
        id_processo_tanque: 'asc',
      },
      select: dashboardTankSelect,
    });

    return this.mapDashboardTanks(tanks);
  }

  async findAlarmsForDashboard(
    query: HistoricoDashboardQueryDto,
  ): Promise<HistoricoDashboardAlarmRepositoryRaw[]> {
    return this.prisma.alarmes.findMany({
      where: this.buildDashboardAlarmWhere(query),
      orderBy: {
        ocorrido_em: 'desc',
      },
      select: dashboardAlarmSelect,
    });
  }

  async findEventsForDashboard(
    query: HistoricoDashboardQueryDto,
  ): Promise<HistoricoDashboardEventRepositoryRaw[]> {
    const events = await this.prisma.eventos.findMany({
      where: this.buildDashboardEventWhere(query),
      orderBy: {
        ocorrido_em: 'desc',
      },
      select: dashboardEventSelect,
    });

    return events.map((event) => ({
      id_evento_processo: event.id_evento_processo,
      severidade_evento: event.severidade_evento,
      ocorrido_em: event.ocorrido_em,
    }));
  }

  async getDashboardDataset(
    query: HistoricoDashboardQueryDto,
  ): Promise<HistoricoDashboardRepositoryDataset> {
    const [processos, tanques, alarmes, eventos] = await Promise.all([
      this.findProcessesForDashboard(query),
      this.findTanksForDashboard(query),
      this.findAlarmsForDashboard(query),
      this.findEventsForDashboard(query),
    ]);

    return {
      processos,
      tanques,
      alarmes,
      eventos,
    };
  }

  private buildDashboardProcessWhere(
    query: HistoricoDashboardQueryDto,
  ): Prisma.processosWhereInput {
    const where: Prisma.processosWhereInput = {
      status_processo: this.getHistoricalStatusFilter(query.status_processo),
    };

    this.applyProcessDateFilter(where, query);

    if (query.id_tanque !== undefined) {
      where.processostanques = {
        some: {
          id_tanque: query.id_tanque,
        },
      };
    }

    return where;
  }

  private buildDashboardTankWhere(
    query: HistoricoDashboardQueryDto,
  ): Prisma.processostanquesWhereInput {
    const where: Prisma.processostanquesWhereInput = {
      processos: this.buildRelatedHistoricalProcessWhere(query),
    };

    if (query.id_tanque !== undefined) {
      where.id_tanque = query.id_tanque;
    }

    return where;
  }

  private buildDashboardAlarmWhere(
    query: HistoricoDashboardQueryDto,
  ): Prisma.alarmesWhereInput {
    const where: Prisma.alarmesWhereInput = {
      excluido_em: null,
      OR: [
        {
          processos: this.buildDashboardAlarmProcessWhere(query),
        },
        {
          processostanques: this.buildDashboardAlarmTankWhere(query),
        },
        {
          processostanquessensores: {
            processostanques: this.buildDashboardAlarmTankWhere(query),
          },
        },
      ],
    };
    const dateFilter = this.buildDateFilter(query.data_inicio, query.data_fim);

    if (dateFilter) {
      where.ocorrido_em = dateFilter;
    }

    return where;
  }

  private buildDashboardEventWhere(
    query: HistoricoDashboardQueryDto,
  ): Prisma.eventosWhereInput {
    const where: Prisma.eventosWhereInput = {
      processos: this.buildRelatedHistoricalProcessStatusWhere(query),
    };
    const dateFilter = this.buildDateFilter(query.data_inicio, query.data_fim);

    if (dateFilter) {
      where.ocorrido_em = dateFilter;
    }

    if (query.id_tanque !== undefined) {
      where.processostanquessensores = {
        processostanques: {
          id_tanque: query.id_tanque,
        },
      };
    }

    return where;
  }

  private buildRelatedHistoricalProcessWhere(
    query: HistoricoDashboardQueryDto,
  ): Prisma.processosWhereInput {
    const where: Prisma.processosWhereInput = {
      status_processo: this.getHistoricalStatusFilter(query.status_processo),
    };

    this.applyProcessDateFilter(where, query);

    return where;
  }

  private buildDashboardAlarmProcessWhere(
    query: HistoricoDashboardQueryDto,
  ): Prisma.processosWhereInput {
    const where = this.buildRelatedHistoricalProcessStatusWhere(query);

    if (query.id_tanque !== undefined) {
      where.processostanques = {
        some: {
          id_tanque: query.id_tanque,
        },
      };
    }

    return where;
  }

  private buildDashboardAlarmTankWhere(
    query: HistoricoDashboardQueryDto,
  ): Prisma.processostanquesWhereInput {
    const where: Prisma.processostanquesWhereInput = {
      processos: this.buildRelatedHistoricalProcessStatusWhere(query),
    };

    if (query.id_tanque !== undefined) {
      where.id_tanque = query.id_tanque;
    }

    return where;
  }

  private buildRelatedHistoricalProcessStatusWhere(
    query: HistoricoDashboardQueryDto,
  ): Prisma.processosWhereInput {
    return {
      status_processo: this.getHistoricalStatusFilter(query.status_processo),
    };
  }

  private buildDateFilter(
    dataInicio?: Date,
    dataFim?: Date,
  ): Prisma.DateTimeFilter | undefined {
    if (!dataInicio && !dataFim) {
      return undefined;
    }

    const filter: Prisma.DateTimeFilter = {};

    if (dataInicio) {
      filter.gte = dataInicio;
    }

    if (dataFim) {
      filter.lte = dataFim;
    }

    return filter;
  }

  private getHistoricalStatusFilter(
    status?: statusprocesso,
  ): statusprocesso | Prisma.EnumstatusprocessoFilter {
    return status ?? { in: [...HISTORICO_PROCESS_STATUS] };
  }

  private applyProcessDateFilter(
    where: Prisma.processosWhereInput,
    query: HistoricoDashboardQueryDto,
  ): void {
    const dateFilter = this.buildDateFilter(query.data_inicio, query.data_fim);

    if (!dateFilter) {
      return;
    }

    switch (this.resolveDateField(query.campo_data)) {
      case 'criado_em':
        where.criado_em = dateFilter;
        break;
      case 'iniciado_em':
        where.iniciado_em = dateFilter;
        break;
      case 'finalizado_em':
        where.finalizado_em = dateFilter;
        break;
    }
  }

  private resolveDateField(value?: HistoricoDateField): HistoricoDateField {
    return value ?? 'finalizado_em';
  }

  private async mapDashboardProcesses(
    records: DashboardProcessRecord[],
  ): Promise<HistoricoDashboardProcessRepositoryRaw[]> {
    const criticalCounts = await this.countCriticalAlarmsByProcessIds(
      records.map((record) => record.id_processo),
    );

    return records.map((record) => ({
      id_processo: record.id_processo,
      nome_processo: record.nome_processo,
      status_processo: record.status_processo,
      vacuo_alvo: record.vacuo_alvo,
      vacuo_inicial: record.vacuo_inicial,
      vacuo_final: record.vacuo_final,
      vacuo_medio: record.vacuo_medio,
      eficiencia: record.eficiencia,
      tempo_maximo: record.tempo_maximo,
      tempo_execucao: record.tempo_execucao,
      iniciado_em: record.iniciado_em,
      finalizado_em: record.finalizado_em,
      criado_em: record.criado_em,
      parada_emergencia: record.parada_emergencia,
      total_alarmes: record._count.alarmes,
      total_alarmes_criticos: criticalCounts.get(record.id_processo) ?? 0,
      total_eventos: record._count.eventos,
      possui_relatorio: record._count.relatorios > 0,
    }));
  }

  private async mapDashboardTanks(
    records: DashboardTankRecord[],
  ): Promise<HistoricoDashboardTankRepositoryRaw[]> {
    const criticalCounts = await this.countCriticalAlarmsByProcessTankIds(
      records.map((record) => record.id_processo_tanque),
    );

    return records.map((record) => ({
      id_processo_tanque: record.id_processo_tanque,
      id_tanque: record.id_tanque,
      nome_tanque: record.tanques.nome,
      status_tanque_processo: record.status_tanque_processo,
      vacuo_alvo: record.vacuo_alvo,
      vacuo_inicial: record.vacuo_inicial,
      vacuo_final: record.vacuo_final,
      vacuo_medio: record.vacuo_medio,
      eficiencia: record.eficiencia,
      tempo_execucao: record.processos.tempo_execucao,
      total_alarmes: record._count.alarmes,
      total_alarmes_criticos:
        criticalCounts.get(record.id_processo_tanque) ?? 0,
    }));
  }

  private async countCriticalAlarmsByProcessIds(
    processIds: number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();

    if (processIds.length === 0) {
      return counts;
    }

    const alarms = await this.prisma.alarmes.findMany({
      where: {
        severidade: severidadealarme.CRITICO,
        excluido_em: null,
        OR: [
          {
            id_processo: {
              in: processIds,
            },
          },
          {
            processostanques: {
              id_processo: {
                in: processIds,
              },
            },
          },
          {
            processostanquessensores: {
              processostanques: {
                id_processo: {
                  in: processIds,
                },
              },
            },
          },
        ],
      },
      select: dashboardCriticalAlarmProcessSelect,
    });

    alarms.forEach((alarm) => {
      const processId = this.getProcessIdFromCriticalAlarm(alarm);

      if (processId !== null) {
        counts.set(processId, (counts.get(processId) ?? 0) + 1);
      }
    });

    return counts;
  }

  private async countCriticalAlarmsByProcessTankIds(
    processTankIds: number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();

    if (processTankIds.length === 0) {
      return counts;
    }

    const alarms = await this.prisma.alarmes.findMany({
      where: {
        severidade: severidadealarme.CRITICO,
        excluido_em: null,
        OR: [
          {
            id_processo_tanque: {
              in: processTankIds,
            },
          },
          {
            processostanquessensores: {
              id_processo_tanque: {
                in: processTankIds,
              },
            },
          },
        ],
      },
      select: dashboardCriticalAlarmTankSelect,
    });

    alarms.forEach((alarm) => {
      const tankId = this.getProcessTankIdFromCriticalAlarm(alarm);

      if (tankId !== null) {
        counts.set(tankId, (counts.get(tankId) ?? 0) + 1);
      }
    });

    return counts;
  }

  private getProcessIdFromCriticalAlarm(
    alarm: DashboardCriticalAlarmProcessRecord,
  ): number | null {
    return (
      alarm.id_processo ??
      alarm.processostanques?.id_processo ??
      alarm.processostanquessensores?.processostanques.id_processo ??
      null
    );
  }

  private getProcessTankIdFromCriticalAlarm(
    alarm: DashboardCriticalAlarmTankRecord,
  ): number | null {
    return (
      alarm.id_processo_tanque ??
      alarm.processostanquessensores?.id_processo_tanque ??
      null
    );
  }
}
