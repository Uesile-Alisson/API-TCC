import { Injectable } from '@nestjs/common';
import {
  Prisma,
  severidadealarme,
  statusalarme,
  statusconexaomqtt,
  statusgeralsistema,
  statusprocesso,
  statustanqueprocesso,
  tipoleiturasensor,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProcessoDTO,
  CreateProcessoTanqueDTO,
  ListProcessosQueryDTO,
  UpdateProcessoConfigDTO,
  UpdateProcessoTanqueDTO,
} from './dto';
import { ProcessoLifecycleTransition } from './lifecycle';
import {
  ProcessoAcoplamentoOperationalContext,
  ProcessoCriticalAlarmContext,
  ProcessoOperationalContext,
  ProcessoSensorOperationalContext,
  ProcessoTanqueOperationalContext,
} from './interfaces';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

type ProcessoListItem = Prisma.processosGetPayload<{
  include: {
    usuarios: {
      select: {
        id_usuario: true;
        nome: true;
        login: true;
      };
    };
    processostanques: {
      include: {
        tanques: true;
      };
    };
  };
}>;

type ProcessoOperationalRecord = Prisma.processosGetPayload<{
  include: {
    alarmes: {
      where: {
        severidade: typeof severidadealarme.CRITICO;
        status_alarme: typeof statusalarme.ATIVO;
      };
      orderBy: {
        ocorrido_em: 'desc';
      };
      take: 20;
    };
    processostanques: {
      include: {
        tanques: true;
        processostanquessensores: {
          include: {
            sensores: {
              include: {
                sensoresacoplamentomangueiras: true;
              };
            };
          };
          orderBy: {
            id_processo_tanque_sensor: 'asc';
          };
        };
      };
      orderBy: {
        id_processo_tanque: 'asc';
      };
    };
  };
}>;

type ProcessoDetails = Prisma.processosGetPayload<{
  include: {
    usuarios: {
      select: {
        id_usuario: true;
        nome: true;
        login: true;
      };
    };
    processostanques: {
      include: {
        tanques: true;
        processostanquessensores: {
          include: {
            sensores: true;
          };
        };
      };
    };
    alarmes: {
      orderBy: {
        ocorrido_em: 'desc';
      };
      take: 50;
    };
    eventos: {
      orderBy: {
        ocorrido_em: 'desc';
      };
      take: 50;
    };
  };
}>;

type ProcessoWithBasicRelations = Prisma.processosGetPayload<{
  include: {
    processostanques: {
      include: {
        tanques: true;
        processostanquessensores: {
          include: {
            sensores: true;
          };
        };
      };
    };
  };
}>;

@Injectable()
export class ProcessosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id_processo: number) {
    return this.prisma.processos.findUnique({
      where: { id_processo },
    });
  }

  async findDetailsById(id_processo: number): Promise<ProcessoDetails | null> {
    return this.prisma.processos.findUnique({
      where: { id_processo },
      include: {
        usuarios: {
          select: {
            id_usuario: true,
            nome: true,
            login: true,
          },
        },
        processostanques: {
          include: {
            tanques: true,
            processostanquessensores: {
              include: {
                sensores: true,
              },
            },
          },
          orderBy: {
            id_processo_tanque: 'asc',
          },
        },
        alarmes: {
          orderBy: {
            ocorrido_em: 'desc',
          },
          take: 50,
        },
        eventos: {
          orderBy: {
            ocorrido_em: 'desc',
          },
          take: 50,
        },
      },
    });
  }

  async findActiveProcessId(): Promise<number | null> {
    const processo = await this.prisma.processos.findFirst({
      where: {
        status_processo: {
          in: [statusprocesso.EM_EXECUCAO, statusprocesso.PAUSADO],
        },
      },
      select: {
        id_processo: true,
      },
      orderBy: {
        iniciado_em: 'desc',
      },
    });

    return processo?.id_processo ?? null;
  }

  async list(
    query: ListProcessosQueryDTO,
  ): Promise<PaginatedResult<ProcessoListItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const where = this.buildListWhere(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.processos.findMany({
        where,
        include: {
          usuarios: {
            select: {
              id_usuario: true,
              nome: true,
              login: true,
            },
          },
          processostanques: {
            include: {
              tanques: true,
            },
          },
        },
        orderBy: {
          criado_em: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.processos.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createWithRelations(input: {
    dto: CreateProcessoDTO;
    id_usuario: number;
  }): Promise<ProcessoWithBasicRelations> {
    const { dto, id_usuario } = input;

    return this.prisma.$transaction(async (tx) => {
      const defaults = await this.resolveVacuumDefaults(tx, dto.tanques);
      const processoVacuoAlvo = this.resolveProcessVacuumTarget(dto, defaults);

      const processo = await tx.processos.create({
        data: {
          id_usuario,
          nome_processo: dto.nome_processo ?? null,
          status_processo: statusprocesso.CONFIGURADO,
          vacuo_alvo: this.toDecimal(processoVacuoAlvo),
          tempo_maximo: dto.tempo_maximo,
          parada_emergencia: false,
        },
      });

      await this.createProcessTanksWithSensors({
        tx,
        id_processo: processo.id_processo,
        tanques: dto.tanques,
        processoVacuoAlvo,
        defaults,
      });

      return this.findWithBasicRelationsOrThrow(tx, processo.id_processo);
    });
  }

  async updateConfig(input: {
    id_processo: number;
    dto: UpdateProcessoConfigDTO;
  }): Promise<ProcessoWithBasicRelations> {
    const { id_processo, dto } = input;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.processos.findUnique({
        where: { id_processo },
        select: {
          vacuo_alvo: true,
        },
      });

      const currentVacuumTarget = current
        ? this.decimalToRequiredNumber(current.vacuo_alvo)
        : 0;

      await tx.processos.update({
        where: { id_processo },
        data: this.buildProcessUpdateData(dto),
      });

      if (dto.tanques) {
        await this.replaceProcessTanks({
          tx,
          id_processo,
          tanques: dto.tanques,
          processoVacuoAlvo: dto.vacuo_alvo ?? currentVacuumTarget,
        });
      }

      return this.findWithBasicRelationsOrThrow(tx, id_processo);
    });
  }

  async findOperationalContextById(
    id_processo: number,
  ): Promise<ProcessoOperationalContext | null> {
    const processo = await this.prisma.processos.findUnique({
      where: { id_processo },
      include: {
        alarmes: {
          where: {
            severidade: severidadealarme.CRITICO,
            status_alarme: statusalarme.ATIVO,
          },
          orderBy: {
            ocorrido_em: 'desc',
          },
          take: 20,
        },
        processostanques: {
          include: {
            tanques: true,
            processostanquessensores: {
              include: {
                sensores: {
                  include: {
                    sensoresacoplamentomangueiras: true,
                  },
                },
              },
              orderBy: {
                id_processo_tanque_sensor: 'asc',
              },
            },
          },
          orderBy: {
            id_processo_tanque: 'asc',
          },
        },
      },
    });

    if (!processo) {
      return null;
    }

    return this.mapOperationalContext(processo);
  }

  async applyLifecycleTransition(input: {
    id_processo: number;
    transition: ProcessoLifecycleTransition;
  }): Promise<ProcessoWithBasicRelations> {
    const { id_processo, transition } = input;

    return this.prisma.$transaction(async (tx) => {
      await tx.processos.update({
        where: { id_processo },
        data: transition.processo,
      });

      if (transition.tanques) {
        await tx.processostanques.updateMany({
          where: { id_processo },
          data: transition.tanques,
        });
      }

      return this.findWithBasicRelationsOrThrow(tx, id_processo);
    });
  }

  async findReadingsForMetrics(id_processo: number) {
    return this.prisma.processos.findUnique({
      where: { id_processo },
      select: {
        id_processo: true,
        vacuo_alvo: true,
        processostanques: {
          orderBy: {
            id_processo_tanque: 'asc',
          },
          select: {
            id_processo_tanque: true,
            id_tanque: true,
            vacuo_alvo: true,
            tanques: true,
            processostanquessensores: {
              orderBy: {
                id_processo_tanque_sensor: 'asc',
              },
              select: {
                id_processo_tanque_sensor: true,
                id_sensor: true,
                sensores: true,
                leiturasensores: {
                  where: {
                    tipo_leitura: tipoleiturasensor.VACUO,
                  },
                  orderBy: {
                    leitura_em: 'asc',
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async hasActiveCriticalAlarm(id_processo?: number): Promise<boolean> {
    const count = await this.prisma.alarmes.count({
      where: {
        severidade: severidadealarme.CRITICO,
        status_alarme: statusalarme.ATIVO,
        ...(id_processo ? { id_processo } : {}),
      },
    });

    return count > 0;
  }

  private buildListWhere(
    query: ListProcessosQueryDTO,
  ): Prisma.processosWhereInput {
    const where: Prisma.processosWhereInput = {};

    if (query.status_processo) {
      where.status_processo = query.status_processo;
    }

    const busca = query.busca?.trim();
    if (busca) {
      where.nome_processo = {
        contains: busca,
        mode: 'insensitive',
      };
    }

    if (query.data_inicio || query.data_fim) {
      where.criado_em = {
        ...(query.data_inicio ? { gte: new Date(query.data_inicio) } : {}),
        ...(query.data_fim ? { lte: new Date(query.data_fim) } : {}),
      };
    }

    return where;
  }

  private async resolveVacuumDefaults(
    tx: Prisma.TransactionClient,
    tanques: Array<CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO>,
  ): Promise<{
    tanqueVacuumById: Map<number, number>;
    systemVacuumTarget: number | null;
  }> {
    const tanqueIds = tanques
      .map((tanque) => tanque.id_tanque)
      .filter((id_tanque): id_tanque is number => id_tanque !== undefined);

    const [tanquesRecords, systemConfig] = await Promise.all([
      tx.tanques.findMany({
        where: {
          id_tanque: {
            in: tanqueIds,
          },
        },
        select: {
          id_tanque: true,
          vacuo_padrao: true,
        },
      }),
      tx.configuracoessistema.findFirst({
        orderBy: {
          id_configuracao_sistema: 'desc',
        },
        select: {
          vacuo_padrao: true,
        },
      }),
    ]);

    return {
      tanqueVacuumById: new Map(
        tanquesRecords.map((tanque) => [
          tanque.id_tanque,
          this.decimalToRequiredNumber(tanque.vacuo_padrao),
        ]),
      ),
      systemVacuumTarget: this.decimalToNumber(systemConfig?.vacuo_padrao),
    };
  }

  private resolveProcessVacuumTarget(
    dto: CreateProcessoDTO,
    defaults: {
      tanqueVacuumById: Map<number, number>;
      systemVacuumTarget: number | null;
    },
  ): number {
    return (
      dto.vacuo_alvo ??
      this.resolveTankVacuumTarget(dto.tanques[0], 0, defaults)
    );
  }

  private resolveTankVacuumTarget(
    tanque: CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO,
    processoVacuoAlvo: number,
    defaults: {
      tanqueVacuumById: Map<number, number>;
      systemVacuumTarget: number | null;
    },
  ): number {
    return (
      tanque.vacuo_alvo ??
      (tanque.id_tanque
        ? defaults.tanqueVacuumById.get(tanque.id_tanque)
        : undefined) ??
      defaults.systemVacuumTarget ??
      processoVacuoAlvo
    );
  }

  private async createProcessTanksWithSensors(input: {
    tx: Prisma.TransactionClient;
    id_processo: number;
    tanques: CreateProcessoTanqueDTO[];
    processoVacuoAlvo: number;
    defaults: {
      tanqueVacuumById: Map<number, number>;
      systemVacuumTarget: number | null;
    };
  }): Promise<void> {
    const { tx, id_processo, tanques, processoVacuoAlvo, defaults } = input;

    for (const tanque of tanques) {
      const processoTanque = await tx.processostanques.create({
        data: {
          id_processo,
          id_tanque: tanque.id_tanque,
          vacuo_alvo: this.toDecimal(
            this.resolveTankVacuumTarget(tanque, processoVacuoAlvo, defaults),
          ),
          status_tanque_processo: statustanqueprocesso.CONFIGURADO,
        },
      });

      await this.createProcessTankSensors({
        tx,
        id_processo_tanque: processoTanque.id_processo_tanque,
        sensores: tanque.sensores,
      });
    }
  }

  private async replaceProcessTanks(input: {
    tx: Prisma.TransactionClient;
    id_processo: number;
    tanques: UpdateProcessoTanqueDTO[];
    processoVacuoAlvo: number;
  }): Promise<void> {
    const { tx, id_processo, tanques, processoVacuoAlvo } = input;
    const defaults = await this.resolveVacuumDefaults(tx, tanques);

    await tx.processostanquessensores.deleteMany({
      where: {
        processostanques: {
          id_processo,
        },
      },
    });

    await tx.processostanques.deleteMany({
      where: { id_processo },
    });

    for (const tanque of tanques) {
      if (!tanque.id_tanque) {
        continue;
      }

      const processoTanque = await tx.processostanques.create({
        data: {
          id_processo,
          id_tanque: tanque.id_tanque,
          vacuo_alvo: this.toDecimal(
            this.resolveTankVacuumTarget(tanque, processoVacuoAlvo, defaults),
          ),
          status_tanque_processo: statustanqueprocesso.CONFIGURADO,
        },
      });

      await this.createProcessTankSensors({
        tx,
        id_processo_tanque: processoTanque.id_processo_tanque,
        sensores: tanque.sensores ?? [],
      });
    }
  }

  private async createProcessTankSensors(input: {
    tx: Prisma.TransactionClient;
    id_processo_tanque: number;
    sensores: Array<{ id_sensor?: number; observacoes?: string }>;
  }): Promise<void> {
    const { tx, id_processo_tanque, sensores } = input;

    if (sensores.length === 0) {
      return;
    }

    await tx.processostanquessensores.createMany({
      data: sensores.filter(this.hasSensorId).map((sensor) => ({
        id_processo_tanque,
        id_sensor: sensor.id_sensor,
        ativo: true,
        observacoes: sensor.observacoes ?? null,
      })),
    });
  }

  private hasSensorId(
    this: void,
    sensor: {
      id_sensor?: number;
      observacoes?: string;
    },
  ): sensor is { id_sensor: number; observacoes?: string } {
    return sensor.id_sensor !== undefined;
  }

  private buildProcessUpdateData(
    dto: UpdateProcessoConfigDTO,
  ): Prisma.processosUpdateInput {
    const data: Prisma.processosUpdateInput = {};

    if (dto.nome_processo !== undefined) {
      data.nome_processo = dto.nome_processo;
    }

    if (dto.tempo_maximo !== undefined) {
      data.tempo_maximo = dto.tempo_maximo;
    }

    if (dto.vacuo_alvo !== undefined) {
      data.vacuo_alvo = this.toDecimal(dto.vacuo_alvo);
    }

    return data;
  }

  private async findWithBasicRelationsOrThrow(
    tx: Prisma.TransactionClient,
    id_processo: number,
  ): Promise<ProcessoWithBasicRelations> {
    const processo = await tx.processos.findUnique({
      where: { id_processo },
      include: {
        processostanques: {
          include: {
            tanques: true,
            processostanquessensores: {
              include: {
                sensores: true,
              },
            },
          },
          orderBy: {
            id_processo_tanque: 'asc',
          },
        },
      },
    });

    if (!processo) {
      throw new Error('Processo não encontrado após persistência.');
    }

    return processo;
  }

  private mapOperationalContext(
    processo: ProcessoOperationalRecord,
  ): ProcessoOperationalContext {
    const tanques = processo.processostanques.map((tanque) =>
      this.mapOperationalTank(tanque),
    );
    const criticalAlarms = processo.alarmes.map((alarme) =>
      this.mapCriticalAlarm(alarme),
    );

    return {
      id_processo: processo.id_processo,
      id_usuario: processo.id_usuario,
      nome_processo: processo.nome_processo,
      status_processo: processo.status_processo,
      vacuo_alvo: this.decimalToRequiredNumber(processo.vacuo_alvo),
      vacuo_inicial: this.decimalToNumber(processo.vacuo_inicial),
      vacuo_final: this.decimalToNumber(processo.vacuo_final),
      vacuo_medio: this.decimalToNumber(processo.vacuo_medio),
      eficiencia: this.decimalToNumber(processo.eficiencia),
      tempo_maximo: processo.tempo_maximo,
      tempo_execucao: processo.tempo_execucao,
      iniciado_em: processo.iniciado_em,
      pausado_em: processo.pausado_em,
      retomado_em: processo.retomado_em,
      finalizado_em: processo.finalizado_em,
      parada_emergencia: processo.parada_emergencia,
      criado_em: processo.criado_em,
      tanques,
      safety: {
        hardware: {
          mqtt_connected: false,
          mqtt_status: statusconexaomqtt.DESCONECTADO,
          esp32_online: false,
          esp32_status: statusgeralsistema.ALERTA,
          last_heartbeat_at: null,
          last_status_at: null,
          last_reading_at: null,
          communication_ready: false,
        },
        has_critical_alarm: criticalAlarms.length > 0,
        critical_alarms: criticalAlarms,
        all_tanks_ready: tanques.every((tanque) => tanque.sensores.length > 0),
        all_sensors_ready: tanques.every((tanque) =>
          tanque.sensores.every((sensor) => sensor.ativo_no_processo),
        ),
        all_acoplamentos_ready: tanques.every((tanque) =>
          tanque.sensores.every((sensor) => sensor.acoplamento?.ativo === true),
        ),
        can_start: false,
        blocking_reasons: [],
      },
    };
  }

  private mapOperationalTank(
    tanque: ProcessoOperationalRecord['processostanques'][number],
  ): ProcessoTanqueOperationalContext {
    return {
      id_processo_tanque: tanque.id_processo_tanque,
      id_tanque: tanque.id_tanque,
      nome_tanque: tanque.tanques.nome,
      volume: this.decimalToRequiredNumber(tanque.tanques.volume),
      unidade_volume: tanque.tanques.unidade_volume,
      status_tanque: tanque.tanques.status_tanque,
      vacuo_alvo: this.decimalToRequiredNumber(tanque.vacuo_alvo),
      vacuo_inicial: this.decimalToNumber(tanque.vacuo_inicial),
      vacuo_final: this.decimalToNumber(tanque.vacuo_final),
      vacuo_medio: this.decimalToNumber(tanque.vacuo_medio),
      eficiencia: this.decimalToNumber(tanque.eficiencia),
      status_tanque_processo: tanque.status_tanque_processo,
      iniciado_em: tanque.iniciado_em,
      finalizado_em: tanque.finalizado_em,
      sensores: tanque.processostanquessensores.map((sensor) =>
        this.mapOperationalSensor(sensor),
      ),
    };
  }

  private mapOperationalSensor(
    sensor: ProcessoOperationalRecord['processostanques'][number]['processostanquessensores'][number],
  ): ProcessoSensorOperationalContext {
    return {
      id_processo_tanque_sensor: sensor.id_processo_tanque_sensor,
      id_sensor: sensor.id_sensor,
      nome_sensor: sensor.sensores.nome,
      modelo_sensor: sensor.sensores.modelo,
      unidade_medida: sensor.sensores.unidade_medida,
      status_sensor: sensor.sensores.status_sensor,
      ativo_no_processo: sensor.ativo,
      acoplamento: this.mapOperationalAcoplamento(
        sensor.sensores.sensoresacoplamentomangueiras,
      ),
    };
  }

  private mapOperationalAcoplamento(
    acoplamento: ProcessoOperationalRecord['processostanques'][number]['processostanquessensores'][number]['sensores']['sensoresacoplamentomangueiras'],
  ): ProcessoAcoplamentoOperationalContext | null {
    if (!acoplamento) {
      return null;
    }

    return {
      id_sensor: acoplamento.id_sensor,
      id_tanque: acoplamento.id_tanque,
      status_acoplamento: acoplamento.status_acoplamento,
      sinal_detectado: acoplamento.sinal_detectado,
      ultima_verificacao: acoplamento.ultima_verificacao,
      ultimo_evento_em: acoplamento.ultimo_evento_em,
      ativo: acoplamento.ativo,
    };
  }

  private mapCriticalAlarm(
    alarme: ProcessoOperationalRecord['alarmes'][number],
  ): ProcessoCriticalAlarmContext {
    return {
      id_alarme: alarme.id_alarme,
      titulo: alarme.titulo,
      severidade: alarme.severidade,
      status_alarme: alarme.status_alarme,
      ocorrido_em: alarme.ocorrido_em,
    };
  }

  private toDecimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value);
  }

  private decimalToNumber(
    value: Prisma.Decimal | number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    return value.toNumber();
  }

  private decimalToRequiredNumber(value: Prisma.Decimal | number): number {
    if (typeof value === 'number') {
      return value;
    }

    return value.toNumber();
  }
}
