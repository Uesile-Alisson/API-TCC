import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

const processForReportSelect = {
  id_processo: true,
  id_usuario: true,
  nome_processo: true,
  status_processo: true,
  fase_processo: true,
  vacuo_alvo: true,
  vacuo_inicial: true,
  vacuo_final: true,
  vacuo_medio: true,
  eficiencia: true,
  tempo_maximo: true,
  tempo_execucao: true,
  iniciado_em: true,
  pausado_em: true,
  retomado_em: true,
  finalizado_em: true,
  parada_emergencia: true,
  criado_em: true,
  usuarios: {
    select: {
      id_usuario: true,
      nome: true,
    },
  },
  processostanques: {
    orderBy: {
      id_processo_tanque: 'asc',
    },
    select: {
      id_processo_tanque: true,
      id_tanque: true,
      vacuo_alvo: true,
      vacuo_inicial: true,
      vacuo_final: true,
      vacuo_medio: true,
      eficiencia: true,
      status_tanque_processo: true,
      iniciado_em: true,
      finalizado_em: true,
      criado_em: true,
      volume_alvo_ml: true,
      volume_enviado_ml: true,
      vazao_atual_l_min: true,
      nivel_atual_percentual: true,
      vacuo_atingido: true,
      vacuo_estabilizado: true,
      alimentacao_iniciada_em: true,
      alimentacao_finalizada_em: true,
      tanques: {
        select: {
          id_tanque: true,
          nome: true,
          volume: true,
          unidade_volume: true,
          vacuo_padrao: true,
          status_tanque: true,
        },
      },
      processostanquessensores: {
        orderBy: {
          id_processo_tanque_sensor: 'asc',
        },
        select: {
          id_processo_tanque_sensor: true,
          id_sensor: true,
          ativo: true,
          tipo_sensor_processo: true,
          removido_em: true,
          observacoes: true,
          sensores: {
            select: {
              id_sensor: true,
              nome: true,
              modelo: true,
              protocolo: true,
              unidade_medida: true,
              precisao: true,
              status_sensor: true,
              ultima_leitura: true,
              ultimo_valor_lido: true,
              tipo_sensor: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.processosSelect;

const readingsForProcessSelect = {
  id_leitura_sensor: true,
  id_processo_tanque_sensor: true,
  valor_vacuo: true,
  tipo_leitura: true,
  valor: true,
  unidade_medida: true,
  volume_acumulado_ml: true,
  percentual_nivel: true,
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

const eventsForProcessSelect = {
  id_evento_processo: true,
  id_processo: true,
  id_processo_tanque_sensor: true,
  tipo_evento: true,
  origem_evento: true,
  severidade_evento: true,
  ocorrido_em: true,
} satisfies Prisma.eventosSelect;

const alarmsForProcessSelect = {
  id_alarme: true,
  id_processo: true,
  id_processo_tanque: true,
  id_processo_tanque_sensor: true,
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
} satisfies Prisma.alarmesSelect;

export type ProcessForReportRecord = Prisma.processosGetPayload<{
  select: typeof processForReportSelect;
}>;

export type ReadingsForProcessRecord = Prisma.leiturasensoresGetPayload<{
  select: typeof readingsForProcessSelect;
}>;

export type EventsForProcessRecord = Prisma.eventosGetPayload<{
  select: typeof eventsForProcessSelect;
}>;

export type AlarmsForProcessRecord = Prisma.alarmesGetPayload<{
  select: typeof alarmsForProcessSelect;
}>;

export interface CompleteProcessReportSource {
  processo: ProcessForReportRecord;
  leituras: ReadingsForProcessRecord[];
  eventos: EventsForProcessRecord[];
  alarmes: AlarmsForProcessRecord[];
}

@Injectable()
export class RelatorioProcessoDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findProcessForReport(
    id_processo: number,
  ): Promise<ProcessForReportRecord | null> {
    return this.prisma.processos.findUnique({
      where: {
        id_processo,
      },
      select: processForReportSelect,
    });
  }

  async findReadingsForProcess(
    id_processo: number,
  ): Promise<ReadingsForProcessRecord[]> {
    return this.prisma.leiturasensores.findMany({
      where: {
        processostanquessensores: {
          processostanques: {
            id_processo,
          },
        },
      },
      orderBy: {
        leitura_em: 'asc',
      },
      select: readingsForProcessSelect,
    });
  }

  async findEventsForProcess(
    id_processo: number,
  ): Promise<EventsForProcessRecord[]> {
    return this.prisma.eventos.findMany({
      where: {
        id_processo,
      },
      orderBy: {
        ocorrido_em: 'asc',
      },
      select: eventsForProcessSelect,
    });
  }

  async findAlarmsForProcess(
    id_processo: number,
  ): Promise<AlarmsForProcessRecord[]> {
    return this.prisma.alarmes.findMany({
      where: {
        excluido_em: null,
        OR: [
          {
            id_processo,
          },
          {
            processostanques: {
              id_processo,
            },
          },
          {
            processostanquessensores: {
              processostanques: {
                id_processo,
              },
            },
          },
        ],
      },
      orderBy: {
        ocorrido_em: 'asc',
      },
      select: alarmsForProcessSelect,
    });
  }

  async findCompleteProcessReportSource(
    id_processo: number,
  ): Promise<CompleteProcessReportSource | null> {
    const processo = await this.findProcessForReport(id_processo);

    if (!processo) {
      return null;
    }

    const [leituras, eventos, alarmes] = await Promise.all([
      this.findReadingsForProcess(id_processo),
      this.findEventsForProcess(id_processo),
      this.findAlarmsForProcess(id_processo),
    ]);

    return {
      processo,
      leituras,
      eventos,
      alarmes,
    };
  }
}
