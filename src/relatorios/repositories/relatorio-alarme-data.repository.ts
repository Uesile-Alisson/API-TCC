import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const ALARM_RELATED_WINDOW_MINUTES = 10;

const alarmForReportSelect = {
  id_alarme: true,
  id_processo: true,
  id_processo_tanque: true,
  id_processo_tanque_sensor: true,
  id_usuario_responsavel: true,
  id_mqtt_mensagem: true,
  titulo: true,
  descricao: true,
  tipo_alarme: true,
  severidade: true,
  status_alarme: true,
  origem_alarme: true,
  valor_detectado: true,
  unidade: true,
  ocorrido_em: true,
  resolvido_em: true,
  excluido_em: true,
  processos: {
    select: {
      id_processo: true,
      nome_processo: true,
      status_processo: true,
      iniciado_em: true,
      finalizado_em: true,
    },
  },
  processostanques: {
    select: {
      id_processo_tanque: true,
      id_processo: true,
      id_tanque: true,
      status_tanque_processo: true,
      tanques: {
        select: {
          nome: true,
        },
      },
    },
  },
  processostanquessensores: {
    select: {
      id_processo_tanque_sensor: true,
      id_sensor: true,
      tipo_sensor_processo: true,
      sensores: {
        select: {
          id_sensor: true,
          nome: true,
          modelo: true,
          unidade_medida: true,
        },
      },
    },
  },
  usuarios: {
    select: {
      id_usuario: true,
      nome: true,
    },
  },
} satisfies Prisma.alarmesSelect;

const alarmContextSelect = {
  id_alarme: true,
  id_processo: true,
  id_processo_tanque: true,
  id_processo_tanque_sensor: true,
  ocorrido_em: true,
} satisfies Prisma.alarmesSelect;

const readingsRelatedToAlarmSelect = {
  id_leitura_sensor: true,
  id_processo_tanque_sensor: true,
  tipo_leitura: true,
  valor: true,
  valor_vacuo: true,
  unidade_medida: true,
  leitura_em: true,
  recebido_em: true,
  processostanquessensores: {
    select: {
      id_processo_tanque_sensor: true,
      id_sensor: true,
      tipo_sensor_processo: true,
      sensores: {
        select: {
          id_sensor: true,
          nome: true,
          modelo: true,
        },
      },
      processostanques: {
        select: {
          id_processo_tanque: true,
          id_tanque: true,
          tanques: {
            select: {
              nome: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.leiturasensoresSelect;

const eventsRelatedToAlarmSelect = {
  id_evento_processo: true,
  id_processo: true,
  id_processo_tanque_sensor: true,
  tipo_evento: true,
  origem_evento: true,
  severidade_evento: true,
  ocorrido_em: true,
} satisfies Prisma.eventosSelect;

export type AlarmForReportRecord = Prisma.alarmesGetPayload<{
  select: typeof alarmForReportSelect;
}>;

type AlarmContextRecord = Prisma.alarmesGetPayload<{
  select: typeof alarmContextSelect;
}>;

export type ReadingsRelatedToAlarmRecord = Prisma.leiturasensoresGetPayload<{
  select: typeof readingsRelatedToAlarmSelect;
}>;

export type EventsRelatedToAlarmRecord = Prisma.eventosGetPayload<{
  select: typeof eventsRelatedToAlarmSelect;
}>;

export interface CompleteAlarmReportSource {
  alarme: AlarmForReportRecord;
  leituras: ReadingsRelatedToAlarmRecord[];
  eventos: EventsRelatedToAlarmRecord[];
}

@Injectable()
export class RelatorioAlarmeDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAlarmForReport(
    id_alarme: number,
  ): Promise<AlarmForReportRecord | null> {
    return this.prisma.alarmes.findUnique({
      where: {
        id_alarme,
      },
      select: alarmForReportSelect,
    });
  }

  async findReadingsRelatedToAlarm(
    id_alarme: number,
  ): Promise<ReadingsRelatedToAlarmRecord[]> {
    const alarm = await this.findAlarmContext(id_alarme);

    if (!alarm) {
      return [];
    }

    return this.findReadingsByAlarmContext(alarm);
  }

  async findEventsRelatedToAlarm(
    id_alarme: number,
  ): Promise<EventsRelatedToAlarmRecord[]> {
    const alarm = await this.findAlarmContext(id_alarme);

    if (!alarm) {
      return [];
    }

    return this.findEventsByAlarmContext(alarm);
  }

  async findCompleteAlarmReportSource(
    id_alarme: number,
  ): Promise<CompleteAlarmReportSource | null> {
    const alarme = await this.findAlarmForReport(id_alarme);

    if (!alarme) {
      return null;
    }

    const alarmContext = this.buildAlarmContextFromRecord(alarme);
    const [leituras, eventos] = await Promise.all([
      this.findReadingsByAlarmContext(alarmContext),
      this.findEventsByAlarmContext(alarmContext),
    ]);

    return {
      alarme,
      leituras,
      eventos,
    };
  }

  private async findAlarmContext(
    id_alarme: number,
  ): Promise<AlarmContextRecord | null> {
    return this.prisma.alarmes.findUnique({
      where: {
        id_alarme,
      },
      select: alarmContextSelect,
    });
  }

  private async findReadingsByAlarmContext(
    alarm: AlarmContextRecord,
  ): Promise<ReadingsRelatedToAlarmRecord[]> {
    const leituraEm = this.buildAlarmWindowFilter(alarm.ocorrido_em);

    if (!leituraEm) {
      return [];
    }

    return this.prisma.leiturasensores.findMany({
      where: {
        ...this.buildReadingRelationWhere(alarm),
        leitura_em: leituraEm,
      },
      orderBy: {
        leitura_em: 'asc',
      },
      select: readingsRelatedToAlarmSelect,
    });
  }

  private async findEventsByAlarmContext(
    alarm: AlarmContextRecord,
  ): Promise<EventsRelatedToAlarmRecord[]> {
    const ocorridoEm = this.buildAlarmWindowFilter(alarm.ocorrido_em);

    if (!ocorridoEm) {
      return [];
    }

    const where = this.buildEventRelationWhere(alarm);

    if (!where) {
      return [];
    }

    return this.prisma.eventos.findMany({
      where: {
        ...where,
        ocorrido_em: ocorridoEm,
      },
      orderBy: {
        ocorrido_em: 'asc',
      },
      select: eventsRelatedToAlarmSelect,
    });
  }

  private buildReadingRelationWhere(
    alarm: AlarmContextRecord,
  ): Prisma.leiturasensoresWhereInput {
    if (alarm.id_processo_tanque_sensor !== null) {
      return {
        id_processo_tanque_sensor: alarm.id_processo_tanque_sensor,
      };
    }

    if (alarm.id_processo_tanque !== null) {
      return {
        processostanquessensores: {
          id_processo_tanque: alarm.id_processo_tanque,
        },
      };
    }

    if (alarm.id_processo !== null) {
      return {
        processostanquessensores: {
          processostanques: {
            id_processo: alarm.id_processo,
          },
        },
      };
    }

    return {
      id_leitura_sensor: -1,
    };
  }

  private buildEventRelationWhere(
    alarm: AlarmContextRecord,
  ): Prisma.eventosWhereInput | null {
    const orConditions: Prisma.eventosWhereInput[] = [];

    if (alarm.id_processo !== null) {
      orConditions.push({
        id_processo: alarm.id_processo,
      });
    }

    if (alarm.id_processo_tanque_sensor !== null) {
      orConditions.push({
        id_processo_tanque_sensor: alarm.id_processo_tanque_sensor,
      });
    }

    if (orConditions.length === 0) {
      return null;
    }

    return {
      OR: orConditions,
    };
  }

  private buildAlarmWindowFilter(
    ocorridoEm: Date | null,
  ): Prisma.DateTimeFilter | null {
    if (!ocorridoEm) {
      return null;
    }

    const windowMs = ALARM_RELATED_WINDOW_MINUTES * 60 * 1000;

    return {
      gte: new Date(ocorridoEm.getTime() - windowMs),
      lte: new Date(ocorridoEm.getTime() + windowMs),
    };
  }

  private buildAlarmContextFromRecord(
    alarm: AlarmForReportRecord,
  ): AlarmContextRecord {
    return {
      id_alarme: alarm.id_alarme,
      id_processo: alarm.id_processo,
      id_processo_tanque: alarm.id_processo_tanque,
      id_processo_tanque_sensor: alarm.id_processo_tanque_sensor,
      ocorrido_em: alarm.ocorrido_em,
    };
  }
}
