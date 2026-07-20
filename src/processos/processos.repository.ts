import { ConflictException, Injectable } from '@nestjs/common';
import {
  motivoresolucaoalarme,
  Prisma,
  severidadealarme,
  statusauxiliotanque,
  statusalarme,
  statusconexaomqtt,
  statusencerramentoprocesso,
  statusgeralsistema,
  statusprocesso,
  statuspartidaprocesso,
  etapapartidaprocesso,
  statussubsistemaauxiliar,
  statustanqueprocesso,
  tipoalarme,
  tipobomba,
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
import type { ProcessoPrecheckValve } from './precheck';

const DASHBOARD_READINGS_PER_SENSOR = 50;

interface ProcessoClosureDefaults {
  toleranciaVacuoPercentual: number;
  limiteSegurancaVacuo: number;
  tempoEstabilizacaoSegundos: number;
  coberturaMinimaPercentual: number;
  intervaloLeituraEsperadoMs: number;
  timeoutLeituraSensorMs: number;
  tempoRetencaoSegundos: number;
  perdaVacuoMaximaRetencao: number;
}

interface ProcessoCreationDefaults {
  tanqueVacuumById: Map<number, number>;
  systemVacuumTarget: number | null;
  closure: ProcessoClosureDefaults;
  operational: {
    stagnationWindowSeconds: number;
    stagnationMinimumVariation: number;
    stagnationMinimumReadings: number;
    stagnationConsecutiveWindows: number;
    stagnationMinimumMainPumpSeconds: number;
    stagnationMaximumNoProgressSeconds: number;
    stagnationMinimumTargetProximityFactor: number;
    assistanceEvaluationWindowSeconds: number;
    assistanceMinimumImprovement: number;
    assistanceTimeoutSeconds: number;
  };
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type ProcessoPersistAudit = (
  tx: Prisma.TransactionClient,
  idProcesso: number,
) => Promise<void>;

type ProcessoListItem = Prisma.processosGetPayload<{
  include: {
    usuarios: {
      select: {
        id_usuario: true;
        nome: true;
        login: true;
      };
    };
    processosauxiliares: true;
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
        tanques: {
          include: {
            sensoresacoplamentomangueiras: true;
          };
        };
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
    processosauxiliares: {
      include: {
        processo_tanque_atual: {
          include: {
            tanques: true;
          };
        };
        usuario_controle_bomba: {
          select: {
            id_usuario: true;
            nome: true;
            login: true;
          };
        };
      };
    };
    processostanques: {
      include: {
        tanques: true;
        processostanquesauxiliares: {
          include: {
            usuario_controle_valvula: {
              select: {
                id_usuario: true;
                nome: true;
                login: true;
              };
            };
          };
        };
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
    processosauxiliares: true;
    processostanques: {
      include: {
        tanques: true;
        processostanquesauxiliares: true;
        processostanquessensores: {
          include: {
            sensores: true;
          };
        };
      };
    };
  };
}>;

type ProcessoValveRecord = Prisma.valvulasGetPayload<{
  include: {
    bombas: {
      select: {
        id_bomba: true;
        codigo_hardware: true;
        nome: true;
        status_padrao: true;
        tipo_bomba: true;
      };
    };
    tanques: {
      select: {
        id_tanque: true;
        nome: true;
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
        processosauxiliares: {
          include: {
            processo_tanque_atual: {
              include: {
                tanques: true,
              },
            },
            usuario_controle_bomba: {
              select: {
                id_usuario: true,
                nome: true,
                login: true,
              },
            },
          },
        },
        processostanques: {
          include: {
            tanques: true,
            processostanquesauxiliares: {
              include: {
                usuario_controle_valvula: {
                  select: {
                    id_usuario: true,
                    nome: true,
                    login: true,
                  },
                },
              },
            },
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

  async findAuxiliaryStateByProcessId(id_processo: number) {
    return this.prisma.processos.findUnique({
      where: { id_processo },
      select: {
        id_processo: true,
        modo_operacao_auxiliar: true,
        processosauxiliares: {
          select: {
            status_subsistema: true,
            versao: true,
            motivo_bloqueio: true,
            ultimo_erro: true,
            atualizado_em: true,
            controle_bomba_assumido_em: true,
            controle_bomba_expira_em: true,
            usuario_controle_bomba: {
              select: {
                id_usuario: true,
                nome: true,
                login: true,
              },
            },
            processo_tanque_atual: {
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
        processostanques: {
          orderBy: {
            id_processo_tanque: 'asc',
          },
          select: {
            id_processo_tanque: true,
            id_tanque: true,
            tanques: {
              select: {
                nome: true,
                sensoresacoplamentomangueiras: {
                  select: {
                    status_acoplamento: true,
                  },
                },
                valvulas: {
                  where: {
                    ativo: true,
                    bombas: {
                      tipo_bomba: tipobomba.AUXILIAR,
                    },
                  },
                  orderBy: {
                    id_valvula: 'asc',
                  },
                  select: {
                    id_valvula: true,
                    nome_valvula: true,
                    codigo_hardware: true,
                    status_valvula: true,
                    ativo: true,
                    ultimo_acionamento: true,
                    bombas: {
                      select: {
                        id_bomba: true,
                        nome: true,
                        codigo_hardware: true,
                        status_padrao: true,
                        ligada_hardware: true,
                        disponivel_hardware: true,
                        ultimo_status_hardware_em: true,
                      },
                    },
                  },
                },
              },
            },
            processostanquesauxiliares: {
              select: {
                id_processo_tanque_auxiliar: true,
                status_auxilio: true,
                prioridade: true,
                solicitado_em: true,
                iniciado_em: true,
                finalizado_em: true,
                versao: true,
                motivo_bloqueio: true,
                ultimo_erro: true,
                avaliacao_iniciada_em: true,
                avaliacao_finalizada_em: true,
                vacuo_antes_auxilio: true,
                tendencia_antes_auxilio: true,
                vacuo_durante_auxilio: true,
                tendencia_durante_auxilio: true,
                vacuo_apos_auxilio: true,
                tendencia_apos_auxilio: true,
                melhoria_observada: true,
                melhoria_minima_esperada: true,
                eficacia_confirmada: true,
                motivo_avaliacao: true,
                controle_valvula_assumido_em: true,
                controle_valvula_expira_em: true,
                usuario_controle_valvula: {
                  select: {
                    id_usuario: true,
                    nome: true,
                    login: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findAuxiliarySafetyContextByProcessId(id_processo: number) {
    return this.prisma.processos.findUnique({
      where: { id_processo },
      select: {
        id_processo: true,
        status_processo: true,
        status_encerramento_geral: true,
        modo_operacao_auxiliar: true,
        parada_emergencia: true,
        alarmes: {
          where: {
            severidade: severidadealarme.CRITICO,
            status_alarme: statusalarme.ATIVO,
            resolvido_em: null,
            excluido_em: null,
          },
          select: { id_alarme: true },
          take: 1,
        },
        processosauxiliares: {
          select: {
            status_subsistema: true,
            versao: true,
            id_processo_tanque_atual: true,
            id_usuario_controle_bomba: true,
            controle_bomba_expira_em: true,
          },
        },
        processostanques: {
          orderBy: { id_processo_tanque: 'asc' },
          select: {
            id_processo_tanque: true,
            id_tanque: true,
            status_tanque_processo: true,
            processostanquesauxiliares: {
              select: {
                status_auxilio: true,
                versao: true,
                id_usuario_controle_valvula: true,
                controle_valvula_expira_em: true,
              },
            },
            tanques: {
              select: {
                nome: true,
                sensoresacoplamentomangueiras: {
                  select: {
                    status_acoplamento: true,
                    sinal_detectado: true,
                    ultima_verificacao: true,
                    ativo: true,
                  },
                },
                valvulas: {
                  where: { ativo: true },
                  orderBy: { id_valvula: 'asc' },
                  select: {
                    id_valvula: true,
                    codigo_hardware: true,
                    status_valvula: true,
                    ativo: true,
                    bombas: {
                      select: {
                        id_bomba: true,
                        codigo_hardware: true,
                        tipo_bomba: true,
                        status_padrao: true,
                        ligada_hardware: true,
                        disponivel_hardware: true,
                        ultimo_status_hardware_em: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findDashboardById(id_processo: number) {
    return this.prisma.$transaction(async (tx) => {
      const processo = await tx.processos.findUnique({
        where: { id_processo },
        select: {
          id_processo: true,
          nome_processo: true,
          status_processo: true,
          fase_processo: true,
          vacuo_alvo: true,
          tempo_maximo: true,
          tempo_execucao: true,
          iniciado_em: true,
          finalizado_em: true,
          parada_emergencia: true,
          encerramento_automatico: true,
          encerramento_tolerancia_vacuo_percentual: true,
          encerramento_limite_seguranca_vacuo: true,
          encerramento_tempo_estabilizacao_segundos: true,
          encerramento_estabilizacao_cobertura_minima_percentual: true,
          encerramento_intervalo_leitura_esperado_ms: true,
          encerramento_timeout_leitura_sensor_ms: true,
          encerramento_tempo_retencao_segundos: true,
          encerramento_perda_vacuo_maxima_retencao: true,
          estagnacao_janela_segundos: true,
          estagnacao_variacao_minima: true,
          estagnacao_leituras_minimas: true,
          estagnacao_janelas_consecutivas: true,
          encerramento_versao: true,
          status_encerramento_geral: true,
          etapa_encerramento_geral: true,
          encerramento_geral_iniciado_em: true,
          encerramento_geral_finalizado_em: true,
          encerramento_geral_confirmacao_iniciada_em: true,
          encerramento_geral_proxima_tentativa_em: true,
          encerramento_geral_tentativa: true,
          encerramento_geral_comando_tentativas: true,
          encerramento_geral_ultimo_erro: true,
          processostanques: {
            orderBy: {
              id_processo_tanque: 'asc',
            },
            select: {
              id_processo_tanque: true,
              id_tanque: true,
              status_tanque_processo: true,
              vacuo_alvo: true,
              vacuo_inicial: true,
              vacuo_final: true,
              vacuo_medio: true,
              eficiencia: true,
              vacuo_atingido: true,
              vacuo_estabilizado: true,
              status_encerramento: true,
              encerramento_iniciado_em: true,
              isolado_em: true,
              retencao_iniciada_em: true,
              retencao_finalizada_em: true,
              vacuo_isolamento: true,
              perda_vacuo_retencao: true,
              motivo_bloqueio_encerramento: true,
              encerramento_versao: true,
              etapa_encerramento: true,
              encerramento_tentativa: true,
              encerramento_comando_tentativas: true,
              encerramento_proxima_tentativa_em: true,
              estabilizacao_leituras_esperadas: true,
              estabilizacao_leituras_observadas: true,
              estabilizacao_cobertura_percentual: true,
              estabilizacao_maior_intervalo_ms: true,
              status_estagnacao: true,
              estagnacao_iniciada_em: true,
              estagnacao_detectada_em: true,
              estagnacao_ultima_avaliacao_em: true,
              estagnacao_variacao_vacuo: true,
              estagnacao_leituras_janela: true,
              estagnacao_janelas_sem_progresso: true,
              estagnacao_variacao_minima_ajustada: true,
              estagnacao_fator_volume: true,
              estagnacao_fator_tanques_ativos: true,
              estagnacao_fator_proximidade_alvo: true,
              estagnacao_volume_tanque: true,
              estagnacao_volume_medio_tanques_ativos: true,
              estagnacao_tanques_ativos: true,
              estagnacao_vacuo_atual: true,
              estagnacao_distancia_alvo: true,
              estagnacao_tempo_bomba_principal_segundos: true,
              estagnacao_motivo_decisao: true,
              iniciado_em: true,
              finalizado_em: true,
              tanques: {
                select: {
                  nome: true,
                  sensoresacoplamentomangueiras: {
                    where: { ativo: true },
                    select: {
                      status_acoplamento: true,
                      sinal_detectado: true,
                    },
                  },
                },
              },
              alarmes: {
                where: {
                  tipo_alarme: tipoalarme.ESTAGNACAO,
                  status_alarme: statusalarme.ATIVO,
                  resolvido_em: null,
                  excluido_em: null,
                },
                orderBy: { ocorrido_em: 'desc' },
                take: 1,
                select: { id_alarme: true },
              },
              processostanquessensores: {
                where: {
                  ativo: true,
                  removido_em: null,
                },
                orderBy: {
                  id_processo_tanque_sensor: 'asc',
                },
                select: {
                  id_processo_tanque_sensor: true,
                  id_sensor: true,
                  _count: {
                    select: {
                      leiturasensores: {
                        where: {
                          tipo_leitura: tipoleiturasensor.VACUO,
                          valor_vacuo: { not: null },
                        },
                      },
                    },
                  },
                  leiturasensores: {
                    where: {
                      tipo_leitura: tipoleiturasensor.VACUO,
                      valor_vacuo: { not: null },
                    },
                    orderBy: [
                      { leitura_em: 'desc' },
                      { id_leitura_sensor: 'desc' },
                    ],
                    take: DASHBOARD_READINGS_PER_SENSOR,
                    select: {
                      id_leitura_sensor: true,
                      valor_vacuo: true,
                      valor: true,
                      leitura_em: true,
                      recebido_em: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!processo) {
        return null;
      }

      const [systemConfig, alarmCounts, latestAlarm] = await Promise.all([
        tx.configuracoessistema.findFirst({
          orderBy: { atualizado_em: 'desc' },
          select: {
            estagnacao_janela_segundos: true,
            estagnacao_variacao_minima: true,
            estagnacao_leituras_minimas: true,
            estagnacao_janelas_consecutivas: true,
          },
        }),
        tx.alarmes.groupBy({
          by: ['severidade'],
          where: { id_processo },
          _count: { _all: true },
        }),
        tx.alarmes.findFirst({
          where: { id_processo },
          orderBy: [{ ocorrido_em: 'desc' }, { id_alarme: 'desc' }],
          select: { severidade: true },
        }),
      ]);

      return {
        processo,
        systemConfig,
        alarmCounts,
        latestAlarm,
      };
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

  async findEmergencyTargetProcessId(): Promise<number | null> {
    const processes = await this.prisma.processos.findMany({
      where: {
        OR: [
          {
            status_processo: {
              in: [statusprocesso.EM_EXECUCAO, statusprocesso.PAUSADO],
            },
          },
          { status_partida: statuspartidaprocesso.EM_ANDAMENTO },
          {
            parada_emergencia: true,
            status_encerramento_geral: {
              not: statusencerramentoprocesso.CONCLUIDO,
            },
          },
        ],
      },
      select: { id_processo: true },
      orderBy: [{ iniciado_em: 'desc' }, { id_processo: 'desc' }],
      take: 2,
    });

    if (processes.length > 1) {
      throw new ConflictException(
        'Mais de um processo operacional foi encontrado; a parada de emergencia exige um alvo explicito.',
      );
    }

    return processes[0]?.id_processo ?? null;
  }

  async findValvesByProcessId(
    id_processo: number,
  ): Promise<ProcessoPrecheckValve[]> {
    const processoTanques = await this.prisma.processostanques.findMany({
      where: { id_processo },
      select: { id_tanque: true },
    });
    const tanqueIds = processoTanques.map((tanque) => tanque.id_tanque);

    if (tanqueIds.length === 0) {
      return [];
    }

    const valvulas = await this.prisma.valvulas.findMany({
      where: {
        id_tanque: {
          in: tanqueIds,
        },
      },
      include: {
        bombas: {
          select: {
            id_bomba: true,
            codigo_hardware: true,
            nome: true,
            status_padrao: true,
            tipo_bomba: true,
          },
        },
        tanques: {
          select: {
            id_tanque: true,
            nome: true,
          },
        },
      },
      orderBy: {
        id_valvula: 'asc',
      },
    });

    return valvulas.map((valvula) => this.mapPrecheckValve(valvula));
  }

  async findValveByProcessId(
    id_processo: number,
    id_valvula: number,
  ): Promise<ProcessoPrecheckValve | null> {
    const valvulas: ProcessoPrecheckValve[] =
      await this.findValvesByProcessId(id_processo);

    return (
      valvulas.find((valvula) => valvula.id_valvula === id_valvula) ?? null
    );
  }

  async findTankClosureByProcessAndTank(
    id_processo: number,
    id_tanque: number,
  ) {
    return this.prisma.processostanques.findUnique({
      where: {
        id_processo_id_tanque: { id_processo, id_tanque },
      },
      select: {
        status_encerramento: true,
        etapa_encerramento: true,
      },
    });
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
          processosauxiliares: true,
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
    persistAudit?: ProcessoPersistAudit;
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
          modo_operacao_auxiliar: dto.modo_operacao_auxiliar,
          encerramento_automatico: dto.encerramento_automatico,
          encerramento_tolerancia_vacuo_percentual: this.toDecimal(
            defaults.closure.toleranciaVacuoPercentual,
          ),
          encerramento_limite_seguranca_vacuo: this.toDecimal(
            defaults.closure.limiteSegurancaVacuo,
          ),
          encerramento_tempo_estabilizacao_segundos:
            defaults.closure.tempoEstabilizacaoSegundos,
          encerramento_estabilizacao_cobertura_minima_percentual:
            this.toDecimal(defaults.closure.coberturaMinimaPercentual),
          encerramento_intervalo_leitura_esperado_ms:
            defaults.closure.intervaloLeituraEsperadoMs,
          encerramento_timeout_leitura_sensor_ms:
            defaults.closure.timeoutLeituraSensorMs,
          encerramento_tempo_retencao_segundos:
            defaults.closure.tempoRetencaoSegundos,
          encerramento_perda_vacuo_maxima_retencao: this.toDecimal(
            defaults.closure.perdaVacuoMaximaRetencao,
          ),
          estagnacao_janela_segundos:
            dto.estagnacao_janela_segundos ??
            defaults.operational.stagnationWindowSeconds,
          estagnacao_variacao_minima: this.toDecimal(
            dto.estagnacao_variacao_minima ??
              defaults.operational.stagnationMinimumVariation,
          ),
          estagnacao_leituras_minimas:
            dto.estagnacao_leituras_minimas ??
            defaults.operational.stagnationMinimumReadings,
          estagnacao_janelas_consecutivas:
            dto.estagnacao_janelas_consecutivas ??
            defaults.operational.stagnationConsecutiveWindows,
          estagnacao_tempo_minimo_bomba_principal_segundos:
            dto.estagnacao_tempo_minimo_bomba_principal_segundos ??
            defaults.operational.stagnationMinimumMainPumpSeconds,
          estagnacao_tempo_maximo_sem_progresso_segundos:
            dto.estagnacao_tempo_maximo_sem_progresso_segundos ??
            defaults.operational.stagnationMaximumNoProgressSeconds,
          estagnacao_fator_minimo_proximidade_alvo: this.toDecimal(
            dto.estagnacao_fator_minimo_proximidade_alvo ??
              defaults.operational.stagnationMinimumTargetProximityFactor,
          ),
          auxilio_janela_avaliacao_segundos:
            dto.auxilio_janela_avaliacao_segundos ??
            defaults.operational.assistanceEvaluationWindowSeconds,
          auxilio_melhoria_minima: this.toDecimal(
            dto.auxilio_melhoria_minima ??
              defaults.operational.assistanceMinimumImprovement,
          ),
          auxilio_timeout_segundos:
            dto.auxilio_timeout_segundos ??
            defaults.operational.assistanceTimeoutSeconds,
        },
      });

      await tx.processosauxiliares.create({
        data: {
          id_processo: processo.id_processo,
        },
      });

      await this.createProcessTanksWithSensors({
        tx,
        id_processo: processo.id_processo,
        tanques: dto.tanques,
        processoVacuoAlvo,
        defaults,
      });

      await input.persistAudit?.(tx, processo.id_processo);

      return this.findWithBasicRelationsOrThrow(tx, processo.id_processo);
    });
  }

  async updateConfig(input: {
    id_processo: number;
    dto: UpdateProcessoConfigDTO;
    persistAudit?: ProcessoPersistAudit;
  }): Promise<ProcessoWithBasicRelations> {
    const { id_processo, dto } = input;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.processos.findUnique({
        where: { id_processo },
        select: {
          vacuo_alvo: true,
          status_processo: true,
          encerramento_versao: true,
        },
      });

      const currentVacuumTarget = current
        ? this.decimalToRequiredNumber(current.vacuo_alvo)
        : 0;

      const updatedConfig = await tx.processos.updateMany({
        where: {
          id_processo,
          status_processo: statusprocesso.CONFIGURADO,
          encerramento_versao: current?.encerramento_versao,
        },
        data: this.buildProcessUpdateData(dto),
      });

      if (updatedConfig.count !== 1) {
        throw new ConflictException(
          'A configuracao mudou ou o processo deixou o estado CONFIGURADO.',
        );
      }

      if (dto.tanques) {
        await this.replaceProcessTanks({
          tx,
          id_processo,
          tanques: dto.tanques,
          processoVacuoAlvo: dto.vacuo_alvo ?? currentVacuumTarget,
        });
      }

      if (
        dto.modo_operacao_auxiliar !== undefined ||
        dto.tanques !== undefined
      ) {
        await tx.processosauxiliares.upsert({
          where: { id_processo },
          create: { id_processo },
          update: {
            versao: { increment: 1 },
            atualizado_em: new Date(),
          },
        });
      }

      await input.persistAudit?.(tx, id_processo);

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
            tanques: {
              include: {
                sensoresacoplamentomangueiras: true,
              },
            },
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
    startupCompletion?: {
      expectedVersion: number;
      completedAt: Date;
    };
    persistAudit?: ProcessoPersistAudit;
  }): Promise<ProcessoWithBasicRelations> {
    const { id_processo, transition, startupCompletion } = input;

    return this.prisma.$transaction(async (tx) => {
      let updatedProcess: { status_processo: statusprocesso };
      if (startupCompletion) {
        const completed = await tx.processos.updateMany({
          where: {
            id_processo,
            status_partida: statuspartidaprocesso.EM_ANDAMENTO,
            partida_versao: startupCompletion.expectedVersion,
          },
          data: {
            ...transition.processo,
            status_partida: statuspartidaprocesso.CONCLUIDA,
            etapa_partida: etapapartidaprocesso.CONCLUIDA,
            partida_finalizada_em: startupCompletion.completedAt,
            partida_execucao_bloqueada_ate: null,
            partida_ultimo_erro: null,
            partida_versao: { increment: 1 },
          },
        });
        if (completed.count !== 1) {
          throw new ConflictException(
            `Partida concorrente detectada no processo ${id_processo}.`,
          );
        }
        const persisted = await tx.processos.findUniqueOrThrow({
          where: { id_processo },
          select: { status_processo: true },
        });
        updatedProcess = persisted;
      } else {
        updatedProcess = await tx.processos.update({
          where: { id_processo },
          data: transition.processo,
          select: {
            status_processo: true,
          },
        });
      }

      if (transition.tanques) {
        await tx.processostanques.updateMany({
          where: { id_processo },
          data: {
            ...transition.tanques,
            encerramento_versao:
              transition.tanques.status_encerramento !== undefined
                ? { increment: 1 }
                : undefined,
          },
        });

        if (
          transition.tanques.status_tanque_processo ===
            statustanqueprocesso.CONCLUIDO ||
          transition.tanques.status_tanque_processo ===
            statustanqueprocesso.INTERROMPIDO ||
          transition.tanques.status_tanque_processo ===
            statustanqueprocesso.FALHA
        ) {
          await tx.alarmes.updateMany({
            where: {
              id_processo,
              tipo_alarme: tipoalarme.ESTAGNACAO,
              status_alarme: statusalarme.ATIVO,
              resolvido_em: null,
              excluido_em: null,
            },
            data: {
              status_alarme: statusalarme.NORMALIZADO,
              normalizado_em: new Date(),
              motivo_resolucao: motivoresolucaoalarme.FECHAMENTO_POS_PROCESSO,
            },
          });
        }
      }

      await this.syncAuxiliaryStateForLifecycle(
        tx,
        id_processo,
        updatedProcess.status_processo,
      );

      await input.persistAudit?.(tx, id_processo);

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
  ): Promise<ProcessoCreationDefaults> {
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
          tolerancia_vacuo_percentual: true,
          limite_seguranca_vacuo: true,
          tempo_estabilizacao_vacuo_segundos: true,
          estabilizacao_cobertura_minima_percentual: true,
          intervalo_leitura_esperado_ms: true,
          timeout_leitura_sensor_ms: true,
          tempo_retencao_vacuo_segundos: true,
          perda_vacuo_maxima_retencao: true,
          estagnacao_janela_segundos: true,
          estagnacao_variacao_minima: true,
          estagnacao_leituras_minimas: true,
          estagnacao_janelas_consecutivas: true,
          estagnacao_tempo_minimo_bomba_principal_segundos: true,
          estagnacao_tempo_maximo_sem_progresso_segundos: true,
          estagnacao_fator_minimo_proximidade_alvo: true,
          auxilio_janela_avaliacao_segundos: true,
          auxilio_melhoria_minima: true,
          auxilio_timeout_segundos: true,
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
      closure: {
        toleranciaVacuoPercentual:
          this.decimalToNumber(systemConfig?.tolerancia_vacuo_percentual) ?? 10,
        limiteSegurancaVacuo:
          this.decimalToNumber(systemConfig?.limite_seguranca_vacuo) ?? -95,
        tempoEstabilizacaoSegundos:
          systemConfig?.tempo_estabilizacao_vacuo_segundos ?? 30,
        coberturaMinimaPercentual:
          this.decimalToNumber(
            systemConfig?.estabilizacao_cobertura_minima_percentual,
          ) ?? 80,
        intervaloLeituraEsperadoMs:
          systemConfig?.intervalo_leitura_esperado_ms ?? 1000,
        timeoutLeituraSensorMs: systemConfig?.timeout_leitura_sensor_ms ?? 2500,
        tempoRetencaoSegundos:
          systemConfig?.tempo_retencao_vacuo_segundos ?? 30,
        perdaVacuoMaximaRetencao:
          this.decimalToNumber(systemConfig?.perda_vacuo_maxima_retencao) ?? 2,
      },
      operational: {
        stagnationWindowSeconds: systemConfig?.estagnacao_janela_segundos ?? 60,
        stagnationMinimumVariation:
          this.decimalToNumber(systemConfig?.estagnacao_variacao_minima) ?? 2,
        stagnationMinimumReadings:
          systemConfig?.estagnacao_leituras_minimas ?? 5,
        stagnationConsecutiveWindows:
          systemConfig?.estagnacao_janelas_consecutivas ?? 2,
        stagnationMinimumMainPumpSeconds:
          systemConfig?.estagnacao_tempo_minimo_bomba_principal_segundos ?? 30,
        stagnationMaximumNoProgressSeconds:
          systemConfig?.estagnacao_tempo_maximo_sem_progresso_segundos ?? 180,
        stagnationMinimumTargetProximityFactor:
          this.decimalToNumber(
            systemConfig?.estagnacao_fator_minimo_proximidade_alvo,
          ) ?? 0.35,
        assistanceEvaluationWindowSeconds:
          systemConfig?.auxilio_janela_avaliacao_segundos ?? 30,
        assistanceMinimumImprovement:
          this.decimalToNumber(systemConfig?.auxilio_melhoria_minima) ?? 1,
        assistanceTimeoutSeconds: systemConfig?.auxilio_timeout_segundos ?? 180,
      },
    };
  }

  private resolveProcessVacuumTarget(
    dto: CreateProcessoDTO,
    defaults: ProcessoCreationDefaults,
  ): number {
    return (
      dto.vacuo_alvo ??
      this.resolveTankVacuumTarget(dto.tanques[0], 0, defaults)
    );
  }

  private resolveTankVacuumTarget(
    tanque: CreateProcessoTanqueDTO | UpdateProcessoTanqueDTO,
    processoVacuoAlvo: number,
    defaults: ProcessoCreationDefaults,
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
    defaults: ProcessoCreationDefaults;
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
          processostanquesauxiliares: {
            create: {},
          },
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
          processostanquesauxiliares: {
            create: {},
          },
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

    if (dto.modo_operacao_auxiliar !== undefined) {
      data.modo_operacao_auxiliar = dto.modo_operacao_auxiliar;
    }

    if (dto.estagnacao_janela_segundos !== undefined) {
      data.estagnacao_janela_segundos = dto.estagnacao_janela_segundos;
    }
    if (dto.estagnacao_variacao_minima !== undefined) {
      data.estagnacao_variacao_minima = this.toDecimal(
        dto.estagnacao_variacao_minima,
      );
    }
    if (dto.estagnacao_leituras_minimas !== undefined) {
      data.estagnacao_leituras_minimas = dto.estagnacao_leituras_minimas;
    }
    if (dto.estagnacao_janelas_consecutivas !== undefined) {
      data.estagnacao_janelas_consecutivas =
        dto.estagnacao_janelas_consecutivas;
    }
    if (dto.estagnacao_tempo_minimo_bomba_principal_segundos !== undefined) {
      data.estagnacao_tempo_minimo_bomba_principal_segundos =
        dto.estagnacao_tempo_minimo_bomba_principal_segundos;
    }
    if (dto.estagnacao_tempo_maximo_sem_progresso_segundos !== undefined) {
      data.estagnacao_tempo_maximo_sem_progresso_segundos =
        dto.estagnacao_tempo_maximo_sem_progresso_segundos;
    }
    if (dto.estagnacao_fator_minimo_proximidade_alvo !== undefined) {
      data.estagnacao_fator_minimo_proximidade_alvo = this.toDecimal(
        dto.estagnacao_fator_minimo_proximidade_alvo,
      );
    }
    if (dto.auxilio_janela_avaliacao_segundos !== undefined) {
      data.auxilio_janela_avaliacao_segundos =
        dto.auxilio_janela_avaliacao_segundos;
    }
    if (dto.auxilio_melhoria_minima !== undefined) {
      data.auxilio_melhoria_minima = this.toDecimal(
        dto.auxilio_melhoria_minima,
      );
    }
    if (dto.auxilio_timeout_segundos !== undefined) {
      data.auxilio_timeout_segundos = dto.auxilio_timeout_segundos;
    }

    if (
      dto.encerramento_automatico !== undefined ||
      dto.tanques !== undefined
    ) {
      if (dto.encerramento_automatico !== undefined) {
        data.encerramento_automatico = dto.encerramento_automatico;
      }
      data.encerramento_versao = { increment: 1 };
    }

    return data;
  }

  private async syncAuxiliaryStateForLifecycle(
    tx: Prisma.TransactionClient,
    id_processo: number,
    processStatus: statusprocesso,
  ): Promise<void> {
    const subsystemStatus =
      processStatus === statusprocesso.EM_EXECUCAO
        ? statussubsistemaauxiliar.DISPONIVEL
        : processStatus === statusprocesso.FALHA
          ? statussubsistemaauxiliar.FALHA
          : statussubsistemaauxiliar.INATIVO;
    const tankStatus =
      processStatus === statusprocesso.EM_EXECUCAO
        ? statusauxiliotanque.MONITORANDO
        : processStatus === statusprocesso.FALHA
          ? statusauxiliotanque.FALHA
          : statusauxiliotanque.INATIVO;
    const resetErrors = processStatus === statusprocesso.EM_EXECUCAO;
    const now = new Date();

    await tx.processosauxiliares.upsert({
      where: { id_processo },
      create: {
        id_processo,
        status_subsistema: subsystemStatus,
      },
      update: {
        status_subsistema: subsystemStatus,
        id_processo_tanque_atual: null,
        id_usuario_controle_bomba: null,
        controle_bomba_assumido_em: null,
        controle_bomba_expira_em: null,
        motivo_bloqueio: resetErrors ? null : undefined,
        ultimo_erro: resetErrors ? null : undefined,
        versao: { increment: 1 },
        atualizado_em: now,
      },
    });

    await tx.processostanquesauxiliares.updateMany({
      where: {
        processostanques: {
          id_processo,
        },
      },
      data: {
        status_auxilio: tankStatus,
        prioridade: 0,
        solicitado_em: null,
        iniciado_em: null,
        finalizado_em: null,
        avaliacao_iniciada_em: null,
        avaliacao_finalizada_em: null,
        vacuo_antes_auxilio: null,
        tendencia_antes_auxilio: null,
        vacuo_durante_auxilio: null,
        tendencia_durante_auxilio: null,
        vacuo_apos_auxilio: null,
        tendencia_apos_auxilio: null,
        melhoria_observada: null,
        melhoria_minima_esperada: null,
        eficacia_confirmada: null,
        motivo_avaliacao: null,
        id_usuario_controle_valvula: null,
        controle_valvula_assumido_em: null,
        controle_valvula_expira_em: null,
        motivo_bloqueio: resetErrors ? null : undefined,
        ultimo_erro: resetErrors ? null : undefined,
        versao: { increment: 1 },
        atualizado_em: now,
      },
    });
  }

  private async findWithBasicRelationsOrThrow(
    tx: Prisma.TransactionClient,
    id_processo: number,
  ): Promise<ProcessoWithBasicRelations> {
    const processo = await tx.processos.findUnique({
      where: { id_processo },
      include: {
        processosauxiliares: true,
        processostanques: {
          include: {
            tanques: true,
            processostanquesauxiliares: true,
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
      modo_operacao_auxiliar: processo.modo_operacao_auxiliar,
      encerramento_automatico: processo.encerramento_automatico,
      encerramento_versao: processo.encerramento_versao,
      encerramento_tolerancia_vacuo_percentual: this.decimalToRequiredNumber(
        processo.encerramento_tolerancia_vacuo_percentual,
      ),
      encerramento_limite_seguranca_vacuo: this.decimalToRequiredNumber(
        processo.encerramento_limite_seguranca_vacuo,
      ),
      encerramento_tempo_estabilizacao_segundos:
        processo.encerramento_tempo_estabilizacao_segundos,
      encerramento_estabilizacao_cobertura_minima_percentual:
        this.decimalToRequiredNumber(
          processo.encerramento_estabilizacao_cobertura_minima_percentual,
        ),
      encerramento_intervalo_leitura_esperado_ms:
        processo.encerramento_intervalo_leitura_esperado_ms,
      encerramento_timeout_leitura_sensor_ms:
        processo.encerramento_timeout_leitura_sensor_ms,
      encerramento_tempo_retencao_segundos:
        processo.encerramento_tempo_retencao_segundos,
      encerramento_perda_vacuo_maxima_retencao: this.decimalToRequiredNumber(
        processo.encerramento_perda_vacuo_maxima_retencao,
      ),
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
          mqtt_credentials_configured: false,
          mqtt_credentials_verified: false,
          mqtt_credentials_verified_at: null,
          mqtt_credentials_failure: null,
          mqtt_connected: false,
          mqtt_operational: false,
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
          tanque.sensores.some((sensor) => sensor.acoplamento?.ativo === true),
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
      vacuo_atingido: tanque.vacuo_atingido,
      vacuo_estabilizado: tanque.vacuo_estabilizado,
      status_tanque_processo: tanque.status_tanque_processo,
      status_encerramento: tanque.status_encerramento,
      encerramento_versao: tanque.encerramento_versao,
      iniciado_em: tanque.iniciado_em,
      finalizado_em: tanque.finalizado_em,
      sensores: tanque.processostanquessensores.map((sensor) =>
        this.mapOperationalSensor(
          sensor,
          tanque.tanques.sensoresacoplamentomangueiras,
        ),
      ),
    };
  }

  private mapOperationalSensor(
    sensor: ProcessoOperationalRecord['processostanques'][number]['processostanquessensores'][number],
    tanqueAcoplamento: ProcessoOperationalRecord['processostanques'][number]['tanques']['sensoresacoplamentomangueiras'],
  ): ProcessoSensorOperationalContext {
    return {
      id_processo_tanque_sensor: sensor.id_processo_tanque_sensor,
      id_sensor: sensor.id_sensor,
      nome_sensor: sensor.sensores.nome,
      modelo_sensor: sensor.sensores.modelo,
      unidade_medida: sensor.sensores.unidade_medida,
      status_sensor: sensor.sensores.status_sensor,
      status_integridade: sensor.sensores.status_integridade,
      calibrado_em: sensor.sensores.calibrado_em,
      calibracao_valida_ate: sensor.sensores.calibracao_valida_ate,
      liberado_em: sensor.sensores.liberado_em,
      integridade_ultimo_erro: sensor.sensores.integridade_ultimo_erro,
      tipo_sensor: sensor.sensores.tipo_sensor,
      ultima_leitura: sensor.sensores.ultima_leitura,
      ultimo_valor_lido: this.decimalToNumber(
        sensor.sensores.ultimo_valor_lido,
      ),
      ativo_no_processo: sensor.ativo,
      acoplamento: this.mapOperationalAcoplamento(
        sensor.sensores.sensoresacoplamentomangueiras ?? tanqueAcoplamento,
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

  private mapPrecheckValve(
    valvula: ProcessoValveRecord,
  ): ProcessoPrecheckValve {
    return {
      id_valvula: valvula.id_valvula,
      codigo_hardware: valvula.codigo_hardware,
      id_bomba: valvula.id_bomba,
      id_tanque: valvula.id_tanque,
      numero_saida_manifold: valvula.numero_saida_manifold,
      nome_valvula: valvula.nome_valvula,
      status_valvula: valvula.status_valvula,
      ativo: valvula.ativo,
      funcao_valvula: valvula.funcao_valvula,
      ultimo_acionamento: valvula.ultimo_acionamento,
      bomba: {
        id_bomba: valvula.bombas.id_bomba,
        codigo_hardware: valvula.bombas.codigo_hardware,
        nome: valvula.bombas.nome,
        status_padrao: valvula.bombas.status_padrao,
        tipo_bomba: valvula.bombas.tipo_bomba,
      },
      tanque: valvula.tanques
        ? {
            id_tanque: valvula.tanques.id_tanque,
            nome: valvula.tanques.nome,
          }
        : null,
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
