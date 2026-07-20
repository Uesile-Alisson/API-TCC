import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StatusAcoplamentoMangueira,
  modooperacaoauxiliar,
  origemalarme,
  severidadealarme,
  statusalarme,
  statusauxiliotanque,
  statusestagnacao,
  statusencerramentoprocesso,
  statusprocesso,
  statussensor,
  statusintegridadesensor,
  statussubsistemaauxiliar,
  statustanqueprocesso,
  StatusValvula,
  tipoalarme,
  tipobomba,
  tipoleiturasensor,
  tiposensor,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProcessoAuxiliarSafetyAction,
  ProcessoAuxiliarSafetyOrigin,
} from '../interfaces';

export interface ProcessoAuxiliarLeaseMutationResult {
  id_processo: number;
  id_processo_tanque: number | null;
  id_usuario: number | null;
  versao: number;
  assumido_em: Date | null;
  expira_em: Date | null;
}

export interface ProcessoAuxiliarCommandReservation {
  id_processo: number;
  id_processo_tanque: number | null;
  action: ProcessoAuxiliarSafetyAction;
  previous_subsystem_status: statussubsistemaauxiliar;
  previous_current_tank_id: number | null;
  previous_tank_status: statusauxiliotanque | null;
  reserved_subsystem_version: number;
  reserved_tank_version: number | null;
}

export interface ProcessoAuxiliarCommandStateResult {
  subsystem_version: number;
  tank_version: number | null;
}

export interface ProcessoAuxiliarSchedulerTank {
  id_processo_tanque: number;
  id_tanque: number;
  status_tanque_processo: statustanqueprocesso;
  status_estagnacao: statusestagnacao;
  estagnacao_detectada_em: Date | null;
  status_auxilio: statusauxiliotanque;
  prioridade: number;
  solicitado_em: Date | null;
  iniciado_em: Date | null;
  versao: number;
  motivo_bloqueio: string | null;
  valve_status: StatusValvula | null;
  active_valve_lease: boolean;
  avaliacao_iniciada_em: Date | null;
  avaliacao_finalizada_em: Date | null;
  vacuo_antes_auxilio: number | null;
  tendencia_antes_auxilio: number | null;
  vacuo_durante_auxilio: number | null;
  tendencia_durante_auxilio: number | null;
  vacuo_apos_auxilio: number | null;
  tendencia_apos_auxilio: number | null;
  melhoria_observada: number | null;
  melhoria_minima_esperada: number | null;
  eficacia_confirmada: boolean | null;
  motivo_avaliacao: string | null;
  sensor_operational: boolean;
  coupling_ok: boolean;
}

export interface ProcessoAuxiliarSchedulerContext {
  id_processo: number;
  status_processo: statusprocesso;
  mode: modooperacaoauxiliar;
  subsystem_status: statussubsistemaauxiliar;
  subsystem_version: number;
  current_tank_id: number | null;
  subsystem_updated_at: Date;
  subsystem_reason: string | null;
  pump_running: boolean | null;
  pump_status_at: Date | null;
  active_pump_lease: boolean;
  has_active_human_lease: boolean;
  assistance_timeout_seconds: number;
  assistance_evaluation_window_seconds: number;
  assistance_minimum_improvement: number;
  tanks: ProcessoAuxiliarSchedulerTank[];
}

const PUMP_ACTIONS = new Set<ProcessoAuxiliarSafetyAction>([
  ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
  ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
]);

const VALVE_CONTROL_ACTIONS = new Set<ProcessoAuxiliarSafetyAction>([
  ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR,
  ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR,
  ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
]);

const NON_QUEUEABLE_AUXILIARY_STATES = new Set<statusauxiliotanque>([
  statusauxiliotanque.ATENDIDO,
  statusauxiliotanque.BLOQUEADO,
  statusauxiliotanque.FALHA,
  statusauxiliotanque.EM_ATENDIMENTO,
]);

const RESETTABLE_AUXILIARY_STATES = new Set<statusauxiliotanque>([
  statusauxiliotanque.ELEGIVEL,
  statusauxiliotanque.AGUARDANDO,
  statusauxiliotanque.BLOQUEADO,
]);

@Injectable()
export class ProcessoAuxiliarRepository {
  constructor(private readonly prisma: PrismaService) {}

  async acquirePumpControl(input: {
    id_processo: number;
    id_usuario: number;
    expected_version: number;
    duration_seconds: number;
  }): Promise<ProcessoAuxiliarLeaseMutationResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.duration_seconds * 1000);

    return this.prisma.$transaction(async (tx) => {
      const process = await tx.processos.findUnique({
        where: { id_processo: input.id_processo },
        select: {
          status_processo: true,
          status_encerramento_geral: true,
          modo_operacao_auxiliar: true,
          processosauxiliares: true,
        },
      });

      this.assertLeaseCanBeAcquired(process, 'bomba');

      const updated = await tx.processosauxiliares.updateMany({
        where: {
          id_processo: input.id_processo,
          versao: input.expected_version,
          OR: [
            { id_usuario_controle_bomba: null },
            { id_usuario_controle_bomba: input.id_usuario },
            { controle_bomba_expira_em: { lte: now } },
          ],
        },
        data: {
          id_usuario_controle_bomba: input.id_usuario,
          controle_bomba_assumido_em: now,
          controle_bomba_expira_em: expiresAt,
          status_subsistema: statussubsistemaauxiliar.CONTROLE_MANUAL,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Nao foi possivel assumir o controle da bomba: versao desatualizada ou lease ativo de outro usuario.',
        );
      }

      const state = await tx.processosauxiliares.findUniqueOrThrow({
        where: { id_processo: input.id_processo },
      });

      return {
        id_processo: input.id_processo,
        id_processo_tanque: null,
        id_usuario: state.id_usuario_controle_bomba,
        versao: state.versao,
        assumido_em: state.controle_bomba_assumido_em,
        expira_em: state.controle_bomba_expira_em,
      };
    });
  }

  async releasePumpControl(input: {
    id_processo: number;
    id_usuario: number;
    expected_version: number;
  }): Promise<ProcessoAuxiliarLeaseMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const [pump, openValves] = await Promise.all([
        tx.bombas.findFirst({
          where: { tipo_bomba: tipobomba.AUXILIAR },
          select: { ligada_hardware: true, ultimo_status_hardware_em: true },
        }),
        tx.valvulas.count({
          where: {
            ativo: true,
            status_valvula: StatusValvula.ABERTA,
            bombas: { tipo_bomba: tipobomba.AUXILIAR },
          },
        }),
      ]);

      if (!pump || pump.ligada_hardware !== false) {
        throw new ConflictException(
          'O controle da bomba so pode ser liberado com a bomba auxiliar confirmadamente desligada.',
        );
      }

      if (openValves > 0) {
        throw new ConflictException(
          'O controle da bomba so pode ser liberado depois de fechar todas as valvulas auxiliares.',
        );
      }

      const now = new Date();
      const updated = await tx.processosauxiliares.updateMany({
        where: {
          id_processo: input.id_processo,
          versao: input.expected_version,
          id_usuario_controle_bomba: input.id_usuario,
        },
        data: {
          id_usuario_controle_bomba: null,
          controle_bomba_assumido_em: null,
          controle_bomba_expira_em: null,
          id_processo_tanque_atual: null,
          status_subsistema: statussubsistemaauxiliar.DISPONIVEL,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Nao foi possivel liberar o controle da bomba: versao desatualizada ou usuario nao e o titular.',
        );
      }

      const state = await tx.processosauxiliares.findUniqueOrThrow({
        where: { id_processo: input.id_processo },
      });

      return {
        id_processo: input.id_processo,
        id_processo_tanque: null,
        id_usuario: state.id_usuario_controle_bomba,
        versao: state.versao,
        assumido_em: state.controle_bomba_assumido_em,
        expira_em: state.controle_bomba_expira_em,
      };
    });
  }

  async acquireValveControl(input: {
    id_processo: number;
    id_processo_tanque: number;
    id_usuario: number;
    expected_version: number;
    duration_seconds: number;
  }): Promise<ProcessoAuxiliarLeaseMutationResult> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.duration_seconds * 1000);

    return this.prisma.$transaction(async (tx) => {
      const tank = await tx.processostanques.findFirst({
        where: {
          id_processo_tanque: input.id_processo_tanque,
          id_processo: input.id_processo,
        },
        select: {
          processos: {
            select: {
              status_processo: true,
              status_encerramento_geral: true,
              modo_operacao_auxiliar: true,
            },
          },
          processostanquesauxiliares: true,
        },
      });

      this.assertTankLeaseCanBeAcquired(tank);

      const updated = await tx.processostanquesauxiliares.updateMany({
        where: {
          id_processo_tanque: input.id_processo_tanque,
          versao: input.expected_version,
          OR: [
            { id_usuario_controle_valvula: null },
            { id_usuario_controle_valvula: input.id_usuario },
            { controle_valvula_expira_em: { lte: now } },
          ],
        },
        data: {
          id_usuario_controle_valvula: input.id_usuario,
          controle_valvula_assumido_em: now,
          controle_valvula_expira_em: expiresAt,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Nao foi possivel assumir o controle da valvula: versao desatualizada ou lease ativo de outro usuario.',
        );
      }

      const state = await tx.processostanquesauxiliares.findUniqueOrThrow({
        where: { id_processo_tanque: input.id_processo_tanque },
      });

      return {
        id_processo: input.id_processo,
        id_processo_tanque: input.id_processo_tanque,
        id_usuario: state.id_usuario_controle_valvula,
        versao: state.versao,
        assumido_em: state.controle_valvula_assumido_em,
        expira_em: state.controle_valvula_expira_em,
      };
    });
  }

  async releaseValveControl(input: {
    id_processo: number;
    id_processo_tanque: number;
    id_usuario: number;
    expected_version: number;
  }): Promise<ProcessoAuxiliarLeaseMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const tank = await tx.processostanques.findFirst({
        where: {
          id_processo_tanque: input.id_processo_tanque,
          id_processo: input.id_processo,
        },
        select: {
          id_tanque: true,
          tanques: {
            select: {
              valvulas: {
                where: {
                  ativo: true,
                  bombas: { tipo_bomba: tipobomba.AUXILIAR },
                },
                select: { status_valvula: true },
              },
            },
          },
        },
      });

      if (!tank) {
        throw new NotFoundException('Tanque nao pertence ao processo.');
      }

      if (
        tank.tanques.valvulas.length !== 1 ||
        tank.tanques.valvulas[0].status_valvula !== StatusValvula.FECHADA
      ) {
        throw new ConflictException(
          'O controle da valvula so pode ser liberado com a valvula auxiliar confirmadamente fechada.',
        );
      }

      const now = new Date();
      const updated = await tx.processostanquesauxiliares.updateMany({
        where: {
          id_processo_tanque: input.id_processo_tanque,
          versao: input.expected_version,
          id_usuario_controle_valvula: input.id_usuario,
        },
        data: {
          id_usuario_controle_valvula: null,
          controle_valvula_assumido_em: null,
          controle_valvula_expira_em: null,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Nao foi possivel liberar o controle da valvula: versao desatualizada ou usuario nao e o titular.',
        );
      }

      const state = await tx.processostanquesauxiliares.findUniqueOrThrow({
        where: { id_processo_tanque: input.id_processo_tanque },
      });

      return {
        id_processo: input.id_processo,
        id_processo_tanque: input.id_processo_tanque,
        id_usuario: state.id_usuario_controle_valvula,
        versao: state.versao,
        assumido_em: state.controle_valvula_assumido_em,
        expira_em: state.controle_valvula_expira_em,
      };
    });
  }

  async reserveCommand(input: {
    id_processo: number;
    id_processo_tanque?: number;
    id_usuario?: number;
    origin: ProcessoAuxiliarSafetyOrigin;
    action: ProcessoAuxiliarSafetyAction;
    expected_subsystem_version: number;
    expected_tank_version?: number;
  }): Promise<ProcessoAuxiliarCommandReservation> {
    return this.prisma.$transaction(async (tx) => {
      const process = await tx.processos.findUnique({
        where: { id_processo: input.id_processo },
        select: {
          modo_operacao_auxiliar: true,
          processosauxiliares: true,
          processostanques: {
            select: {
              processostanquesauxiliares: {
                select: {
                  id_usuario_controle_valvula: true,
                  controle_valvula_expira_em: true,
                },
              },
            },
          },
        },
      });

      if (!process?.processosauxiliares) {
        throw new NotFoundException(
          'Contrato do subsistema auxiliar nao encontrado.',
        );
      }

      const targetTank = input.id_processo_tanque
        ? await tx.processostanques.findFirst({
            where: {
              id_processo: input.id_processo,
              id_processo_tanque: input.id_processo_tanque,
            },
            select: { processostanquesauxiliares: true },
          })
        : null;

      if (input.id_processo_tanque && !targetTank?.processostanquesauxiliares) {
        throw new NotFoundException(
          'Contrato auxiliar do tanque nao encontrado.',
        );
      }

      if (
        input.id_processo_tanque &&
        input.expected_tank_version === undefined
      ) {
        throw new ConflictException(
          'expected_tank_version e obrigatorio para comando associado a tanque.',
        );
      }

      this.assertReservationOwnership({
        mode: process.modo_operacao_auxiliar,
        origin: input.origin,
        action: input.action,
        id_usuario: input.id_usuario,
        pump_owner: process.processosauxiliares.id_usuario_controle_bomba,
        pump_expires: process.processosauxiliares.controle_bomba_expira_em,
        valve_owner:
          targetTank?.processostanquesauxiliares?.id_usuario_controle_valvula ??
          null,
        valve_expires:
          targetTank?.processostanquesauxiliares?.controle_valvula_expira_em ??
          null,
        any_active_valve_lease: process.processostanques.some((tank) => {
          const lease = tank.processostanquesauxiliares;
          return Boolean(
            lease?.id_usuario_controle_valvula &&
            lease.controle_valvula_expira_em &&
            lease.controle_valvula_expira_em.getTime() > Date.now(),
          );
        }),
      });

      const now = new Date();
      const previousSubsystem = process.processosauxiliares;
      const previousTank = targetTank?.processostanquesauxiliares ?? null;
      const subsystemUpdated = await tx.processosauxiliares.updateMany({
        where: {
          id_processo: input.id_processo,
          versao: input.expected_subsystem_version,
        },
        data: {
          status_subsistema: this.resolveReservedSubsystemStatus(input.action),
          ...(input.action ===
            ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR ||
          input.action === ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR
            ? { id_processo_tanque_atual: input.id_processo_tanque }
            : {}),
          versao: { increment: 1 },
          atualizado_em: now,
        },
      });

      if (subsystemUpdated.count !== 1) {
        throw new ConflictException(
          'Versao do subsistema auxiliar foi alterada por outra operacao.',
        );
      }

      if (input.id_processo_tanque) {
        const tankUpdated = await tx.processostanquesauxiliares.updateMany({
          where: {
            id_processo_tanque: input.id_processo_tanque,
            versao: input.expected_tank_version,
          },
          data: {
            versao: { increment: 1 },
            atualizado_em: now,
          },
        });

        if (tankUpdated.count !== 1) {
          throw new ConflictException(
            'Versao auxiliar do tanque foi alterada por outra operacao.',
          );
        }
      }

      return {
        id_processo: input.id_processo,
        id_processo_tanque: input.id_processo_tanque ?? null,
        action: input.action,
        previous_subsystem_status: previousSubsystem.status_subsistema,
        previous_current_tank_id: previousSubsystem.id_processo_tanque_atual,
        previous_tank_status: previousTank?.status_auxilio ?? null,
        reserved_subsystem_version: input.expected_subsystem_version + 1,
        reserved_tank_version:
          input.expected_tank_version !== undefined
            ? input.expected_tank_version + 1
            : null,
      };
    });
  }

  async finalizeCommand(
    reservation: ProcessoAuxiliarCommandReservation,
  ): Promise<ProcessoAuxiliarCommandStateResult> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const targetTank = reservation.id_processo_tanque
        ? await tx.processostanques.findUnique({
            where: {
              id_processo_tanque: reservation.id_processo_tanque,
            },
            select: {
              status_tanque_processo: true,
              processostanquesauxiliares: {
                select: { eficacia_confirmada: true },
              },
            },
          })
        : null;
      const subsystemUpdated = await tx.processosauxiliares.updateMany({
        where: {
          id_processo: reservation.id_processo,
          versao: reservation.reserved_subsystem_version,
        },
        data: {
          status_subsistema: this.resolveFinalSubsystemStatus(
            reservation.action,
          ),
          ...(reservation.action ===
          ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR
            ? { id_processo_tanque_atual: null }
            : {}),
          motivo_bloqueio: null,
          ultimo_erro: null,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      });

      if (subsystemUpdated.count !== 1) {
        throw new ConflictException(
          'Estado auxiliar mudou antes da confirmacao do ACK MQTT.',
        );
      }

      let tankVersion: number | null = null;
      if (
        reservation.id_processo_tanque &&
        reservation.reserved_tank_version !== null
      ) {
        const tankData = this.resolveFinalTankData(
          reservation.action,
          targetTank?.status_tanque_processo ?? null,
          targetTank?.processostanquesauxiliares?.eficacia_confirmada ?? false,
          now,
        );
        const tankUpdated = await tx.processostanquesauxiliares.updateMany({
          where: {
            id_processo_tanque: reservation.id_processo_tanque,
            versao: reservation.reserved_tank_version,
          },
          data: {
            ...tankData,
            motivo_bloqueio: null,
            ultimo_erro: null,
            versao: { increment: 1 },
            atualizado_em: now,
          },
        });

        if (tankUpdated.count !== 1) {
          throw new ConflictException(
            'Estado auxiliar do tanque mudou antes da confirmacao do ACK MQTT.',
          );
        }
        tankVersion = reservation.reserved_tank_version + 1;
      }

      return {
        subsystem_version: reservation.reserved_subsystem_version + 1,
        tank_version: tankVersion,
      };
    });
  }

  async rollbackCommand(
    reservation: ProcessoAuxiliarCommandReservation,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const subsystem = await tx.processosauxiliares.updateMany({
        where: {
          id_processo: reservation.id_processo,
          versao: reservation.reserved_subsystem_version,
        },
        data: {
          status_subsistema: reservation.previous_subsystem_status,
          id_processo_tanque_atual: reservation.previous_current_tank_id,
          ultimo_erro: errorMessage,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      });

      if (subsystem.count !== 1) {
        await tx.processosauxiliares.updateMany({
          where: { id_processo: reservation.id_processo },
          data: {
            status_subsistema: statussubsistemaauxiliar.FALHA,
            ultimo_erro: errorMessage,
            versao: { increment: 1 },
            atualizado_em: now,
          },
        });
      }

      if (
        reservation.id_processo_tanque &&
        reservation.reserved_tank_version !== null
      ) {
        const tank = await tx.processostanquesauxiliares.updateMany({
          where: {
            id_processo_tanque: reservation.id_processo_tanque,
            versao: reservation.reserved_tank_version,
          },
          data: {
            ...(reservation.previous_tank_status
              ? { status_auxilio: reservation.previous_tank_status }
              : {}),
            ultimo_erro: errorMessage,
            versao: { increment: 1 },
            atualizado_em: now,
          },
        });

        if (tank.count !== 1) {
          await tx.processostanquesauxiliares.updateMany({
            where: { id_processo_tanque: reservation.id_processo_tanque },
            data: {
              status_auxilio: statusauxiliotanque.FALHA,
              ultimo_erro: errorMessage,
              versao: { increment: 1 },
              atualizado_em: now,
            },
          });
        }
      }
    });
  }

  async markInconsistentAfterAck(
    reservation: ProcessoAuxiliarCommandReservation,
    errorMessage: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.processosauxiliares.updateMany({
        where: { id_processo: reservation.id_processo },
        data: {
          status_subsistema: statussubsistemaauxiliar.FALHA,
          ultimo_erro: errorMessage,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      }),
      ...(reservation.id_processo_tanque
        ? [
            this.prisma.processostanquesauxiliares.updateMany({
              where: {
                id_processo_tanque: reservation.id_processo_tanque,
              },
              data: {
                status_auxilio: statusauxiliotanque.FALHA,
                ultimo_erro: errorMessage,
                versao: { increment: 1 },
                atualizado_em: now,
              },
            }),
          ]
        : []),
    ]);
  }

  async findSchedulerContexts(
    evaluatedAt = new Date(),
  ): Promise<ProcessoAuxiliarSchedulerContext[]> {
    const [processes, systemConfig] = await Promise.all([
      this.prisma.processos.findMany({
        where: {
          status_processo: {
            in: [statusprocesso.EM_EXECUCAO, statusprocesso.PAUSADO],
          },
        },
        orderBy: { id_processo: 'asc' },
        select: {
          id_processo: true,
          status_processo: true,
          modo_operacao_auxiliar: true,
          tempo_maximo: true,
          auxilio_timeout_segundos: true,
          auxilio_janela_avaliacao_segundos: true,
          auxilio_melhoria_minima: true,
          encerramento_timeout_leitura_sensor_ms: true,
          processosauxiliares: true,
          processostanques: {
            orderBy: { id_processo_tanque: 'asc' },
            select: {
              id_processo_tanque: true,
              id_tanque: true,
              status_tanque_processo: true,
              status_estagnacao: true,
              estagnacao_detectada_em: true,
              vacuo_alvo: true,
              processostanquesauxiliares: true,
              processostanquessensores: {
                where: { ativo: true, removido_em: null },
                select: {
                  sensores: {
                    select: {
                      tipo_sensor: true,
                      status_sensor: true,
                      status_integridade: true,
                      calibracao_valida_ate: true,
                      ultima_leitura: true,
                    },
                  },
                },
              },
              tanques: {
                select: {
                  sensoresacoplamentomangueiras: {
                    select: {
                      ativo: true,
                      status_acoplamento: true,
                      sinal_detectado: true,
                    },
                  },
                  valvulas: {
                    where: {
                      ativo: true,
                      bombas: { tipo_bomba: tipobomba.AUXILIAR },
                    },
                    orderBy: { id_valvula: 'asc' },
                    select: {
                      status_valvula: true,
                      bombas: {
                        select: {
                          ligada_hardware: true,
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
      }),
      this.prisma.configuracoessistema.findFirst({
        orderBy: { id_configuracao_sistema: 'asc' },
        select: {
          estagnacao_janela_segundos: true,
          estagnacao_janelas_consecutivas: true,
        },
      }),
    ]);

    const windowSeconds = systemConfig?.estagnacao_janela_segundos ?? 60;
    const consecutiveWindows =
      systemConfig?.estagnacao_janelas_consecutivas ?? 2;

    return processes.flatMap((process) => {
      const subsystem = process.processosauxiliares;
      if (!subsystem) {
        return [];
      }

      const pump = process.processostanques
        .flatMap((tank) => tank.tanques.valvulas)
        .map((valve) => valve.bombas)
        .at(0);
      const activePumpLease = this.isActiveLease(
        subsystem.id_usuario_controle_bomba,
        subsystem.controle_bomba_expira_em,
        evaluatedAt,
      );
      const tanks = process.processostanques.flatMap((tank) => {
        const auxiliary = tank.processostanquesauxiliares;
        if (!auxiliary) {
          return [];
        }
        const valve = tank.tanques.valvulas[0] ?? null;
        const vacuumSensors = (tank.processostanquessensores ?? []).filter(
          (link) => link.sensores.tipo_sensor === tiposensor.VACUO,
        );
        const vacuumSensor = vacuumSensors[0]?.sensores ?? null;
        const coupling = tank.tanques.sensoresacoplamentomangueiras;
        const sensorOperational = Boolean(
          vacuumSensors.length === 1 &&
          vacuumSensor?.status_sensor === statussensor.ATIVO &&
          vacuumSensor.status_integridade === statusintegridadesensor.VALIDO &&
          (vacuumSensor.calibracao_valida_ate === null ||
            vacuumSensor.calibracao_valida_ate > evaluatedAt) &&
          vacuumSensor.ultima_leitura &&
          evaluatedAt.getTime() - vacuumSensor.ultima_leitura.getTime() <=
            process.encerramento_timeout_leitura_sensor_ms,
        );

        return [
          {
            id_processo_tanque: tank.id_processo_tanque,
            id_tanque: tank.id_tanque,
            status_tanque_processo: tank.status_tanque_processo,
            status_estagnacao: tank.status_estagnacao,
            estagnacao_detectada_em: tank.estagnacao_detectada_em,
            status_auxilio: auxiliary.status_auxilio,
            prioridade: auxiliary.prioridade,
            solicitado_em: auxiliary.solicitado_em,
            iniciado_em: auxiliary.iniciado_em,
            versao: auxiliary.versao,
            motivo_bloqueio: auxiliary.motivo_bloqueio,
            avaliacao_iniciada_em: auxiliary.avaliacao_iniciada_em,
            avaliacao_finalizada_em: auxiliary.avaliacao_finalizada_em,
            vacuo_antes_auxilio: this.decimalToNumber(
              auxiliary.vacuo_antes_auxilio,
            ),
            tendencia_antes_auxilio: this.decimalToNumber(
              auxiliary.tendencia_antes_auxilio,
            ),
            vacuo_durante_auxilio: this.decimalToNumber(
              auxiliary.vacuo_durante_auxilio,
            ),
            tendencia_durante_auxilio: this.decimalToNumber(
              auxiliary.tendencia_durante_auxilio,
            ),
            vacuo_apos_auxilio: this.decimalToNumber(
              auxiliary.vacuo_apos_auxilio,
            ),
            tendencia_apos_auxilio: this.decimalToNumber(
              auxiliary.tendencia_apos_auxilio,
            ),
            melhoria_observada: this.decimalToNumber(
              auxiliary.melhoria_observada,
            ),
            melhoria_minima_esperada: this.decimalToNumber(
              auxiliary.melhoria_minima_esperada,
            ),
            eficacia_confirmada: auxiliary.eficacia_confirmada,
            motivo_avaliacao: auxiliary.motivo_avaliacao,
            sensor_operational: sensorOperational,
            coupling_ok: Boolean(
              coupling?.ativo &&
              coupling.sinal_detectado &&
              coupling.status_acoplamento ===
                StatusAcoplamentoMangueira.ACOPLADA,
            ),
            valve_status: valve?.status_valvula ?? null,
            active_valve_lease: this.isActiveLease(
              auxiliary.id_usuario_controle_valvula,
              auxiliary.controle_valvula_expira_em,
              evaluatedAt,
            ),
          },
        ];
      });
      const derivedTimeout = windowSeconds * consecutiveWindows;

      return [
        {
          id_processo: process.id_processo,
          status_processo: process.status_processo,
          mode: process.modo_operacao_auxiliar,
          subsystem_status: subsystem.status_subsistema,
          subsystem_version: subsystem.versao,
          current_tank_id: subsystem.id_processo_tanque_atual,
          subsystem_updated_at: subsystem.atualizado_em,
          subsystem_reason: subsystem.motivo_bloqueio,
          pump_running: pump?.ligada_hardware ?? null,
          pump_status_at: pump?.ultimo_status_hardware_em ?? null,
          active_pump_lease: activePumpLease,
          has_active_human_lease:
            activePumpLease || tanks.some((tank) => tank.active_valve_lease),
          assistance_timeout_seconds: Math.max(
            10,
            Math.min(
              process.tempo_maximo,
              process.auxilio_timeout_segundos ?? derivedTimeout,
            ),
          ),
          assistance_evaluation_window_seconds:
            process.auxilio_janela_avaliacao_segundos ?? windowSeconds,
          assistance_minimum_improvement:
            this.decimalToNumber(process.auxilio_melhoria_minima) ?? 1,
          tanks,
        },
      ];
    });
  }

  async refreshAssistanceEvidence(input: {
    id_processo: number;
    id_processo_tanque: number;
    evaluated_at: Date;
  }): Promise<{
    changed: boolean;
    evidence: Partial<ProcessoAuxiliarSchedulerTank>;
  }> {
    const tank = await this.prisma.processostanques.findFirst({
      where: {
        id_processo_tanque: input.id_processo_tanque,
        id_processo: input.id_processo,
      },
      select: {
        status_estagnacao: true,
        processos: {
          select: {
            auxilio_janela_avaliacao_segundos: true,
            auxilio_melhoria_minima: true,
          },
        },
        processostanquesauxiliares: true,
      },
    });
    const auxiliary = tank?.processostanquesauxiliares;
    if (!tank || !auxiliary?.iniciado_em) {
      return { changed: false, evidence: {} };
    }

    const windowSeconds = Math.max(
      5,
      tank.processos.auxilio_janela_avaliacao_segundos,
    );
    const minimumImprovement = this.decimalToNumber(
      tank.processos.auxilio_melhoria_minima,
    ) as number;
    const windowStart = new Date(
      auxiliary.iniciado_em.getTime() - windowSeconds * 1000,
    );
    const readings = await this.prisma.leiturasensores.findMany({
      where: {
        processostanquessensores: {
          id_processo_tanque: input.id_processo_tanque,
          ativo: true,
          removido_em: null,
        },
        tipo_leitura: tipoleiturasensor.VACUO,
        valor_vacuo: { not: null },
        recebido_em: { gte: windowStart, lte: input.evaluated_at },
      },
      orderBy: [{ recebido_em: 'asc' }, { id_leitura_sensor: 'asc' }],
      select: { valor_vacuo: true, valor: true, recebido_em: true },
    });
    const before = readings
      .filter((reading) => reading.recebido_em < auxiliary.iniciado_em!)
      .map((reading) => (reading.valor_vacuo ?? reading.valor).toNumber());
    const during = readings
      .filter((reading) => reading.recebido_em >= auxiliary.iniciado_em!)
      .map((reading) => (reading.valor_vacuo ?? reading.valor).toNumber());
    if (during.length === 0) {
      return { changed: false, evidence: {} };
    }

    const beforeVacuum =
      auxiliary.vacuo_antes_auxilio?.toNumber() ??
      this.averageTail(before.length > 0 ? before : during.slice(0, 1));
    const duringVacuum = this.averageTail(during);
    const improvement = this.round(
      Math.abs(duringVacuum) - Math.abs(beforeVacuum),
      3,
    );
    const elapsedSeconds =
      (input.evaluated_at.getTime() - auxiliary.iniciado_em.getTime()) / 1000;
    const matured = elapsedSeconds >= windowSeconds;
    const normalized = tank.status_estagnacao !== statusestagnacao.DETECTADA;
    const effective =
      normalized || (matured && improvement >= minimumImprovement);
    const reason = effective
      ? normalized
        ? 'Progresso de vacuo retomado durante o auxilio.'
        : `Melhoria minima de ${minimumImprovement} atingida.`
      : matured
        ? `Melhoria ${improvement} abaixo do minimo ${minimumImprovement}; auxilio mantido ate o timeout.`
        : 'Coletando evidencias durante a janela minima de avaliacao.';
    const evidence = {
      avaliacao_iniciada_em:
        auxiliary.avaliacao_iniciada_em ?? auxiliary.iniciado_em,
      avaliacao_finalizada_em: effective ? input.evaluated_at : null,
      vacuo_antes_auxilio: beforeVacuum,
      tendencia_antes_auxilio: this.calculateTrend(before),
      vacuo_durante_auxilio: duringVacuum,
      tendencia_durante_auxilio: this.calculateTrend(during),
      vacuo_apos_auxilio: effective ? duringVacuum : null,
      tendencia_apos_auxilio: effective ? this.calculateTrend(during) : null,
      melhoria_observada: improvement,
      melhoria_minima_esperada: minimumImprovement,
      eficacia_confirmada: effective ? true : null,
      motivo_avaliacao: reason,
    } satisfies Partial<ProcessoAuxiliarSchedulerTank>;

    const changed =
      auxiliary.melhoria_observada?.toNumber() !== improvement ||
      auxiliary.eficacia_confirmada !== evidence.eficacia_confirmada ||
      auxiliary.motivo_avaliacao !== reason;
    await this.prisma.processostanquesauxiliares.update({
      where: { id_processo_tanque: input.id_processo_tanque },
      data: {
        avaliacao_iniciada_em: evidence.avaliacao_iniciada_em,
        avaliacao_finalizada_em: evidence.avaliacao_finalizada_em,
        vacuo_antes_auxilio: evidence.vacuo_antes_auxilio,
        tendencia_antes_auxilio: evidence.tendencia_antes_auxilio,
        vacuo_durante_auxilio: evidence.vacuo_durante_auxilio,
        tendencia_durante_auxilio: evidence.tendencia_durante_auxilio,
        vacuo_apos_auxilio: evidence.vacuo_apos_auxilio,
        tendencia_apos_auxilio: evidence.tendencia_apos_auxilio,
        melhoria_observada: evidence.melhoria_observada,
        melhoria_minima_esperada: evidence.melhoria_minima_esperada,
        eficacia_confirmada: evidence.eficacia_confirmada,
        motivo_avaliacao: evidence.motivo_avaliacao,
        atualizado_em: input.evaluated_at,
      },
    });

    return { changed, evidence };
  }

  async clearExpiredLeases(evaluatedAt = new Date()): Promise<number> {
    const [pumps, valves] = await this.prisma.$transaction([
      this.prisma.processosauxiliares.updateMany({
        where: {
          id_usuario_controle_bomba: { not: null },
          controle_bomba_expira_em: { lte: evaluatedAt },
        },
        data: {
          id_usuario_controle_bomba: null,
          controle_bomba_assumido_em: null,
          controle_bomba_expira_em: null,
          versao: { increment: 1 },
          atualizado_em: evaluatedAt,
        },
      }),
      this.prisma.processostanquesauxiliares.updateMany({
        where: {
          id_usuario_controle_valvula: { not: null },
          controle_valvula_expira_em: { lte: evaluatedAt },
        },
        data: {
          id_usuario_controle_valvula: null,
          controle_valvula_assumido_em: null,
          controle_valvula_expira_em: null,
          versao: { increment: 1 },
          atualizado_em: evaluatedAt,
        },
      }),
    ]);

    return pumps.count + valves.count;
  }

  async synchronizeCandidates(
    context: ProcessoAuxiliarSchedulerContext,
    evaluatedAt = new Date(),
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      let changed = 0;

      for (const tank of context.tanks) {
        if (tank.id_processo_tanque === context.current_tank_id) {
          continue;
        }

        const detected =
          context.status_processo === statusprocesso.EM_EXECUCAO &&
          tank.status_tanque_processo === statustanqueprocesso.GERANDO_VACUO &&
          tank.status_estagnacao === statusestagnacao.DETECTADA;
        let desiredStatus: statusauxiliotanque | null = null;
        let requestedAt: Date | null | undefined;
        let reason: string | null | undefined;

        if (
          detected &&
          !NON_QUEUEABLE_AUXILIARY_STATES.has(tank.status_auxilio)
        ) {
          desiredStatus =
            context.mode === modooperacaoauxiliar.MANUAL
              ? statusauxiliotanque.ELEGIVEL
              : statusauxiliotanque.AGUARDANDO;
          requestedAt = tank.solicitado_em ?? evaluatedAt;
          reason =
            context.mode === modooperacaoauxiliar.MANUAL
              ? 'Estagnacao detectada: auxilio recomendado para decisao humana.'
              : null;
        } else if (
          !detected &&
          RESETTABLE_AUXILIARY_STATES.has(tank.status_auxilio)
        ) {
          desiredStatus = statusauxiliotanque.MONITORANDO;
          requestedAt = null;
          reason = null;
        }

        if (
          !desiredStatus ||
          (tank.status_auxilio === desiredStatus &&
            tank.solicitado_em?.getTime() === requestedAt?.getTime() &&
            tank.motivo_bloqueio === reason)
        ) {
          continue;
        }

        const updated = await tx.processostanquesauxiliares.updateMany({
          where: {
            id_processo_tanque: tank.id_processo_tanque,
            versao: tank.versao,
          },
          data: {
            status_auxilio: desiredStatus,
            solicitado_em: requestedAt,
            motivo_bloqueio: reason,
            ultimo_erro: null,
            avaliacao_iniciada_em:
              desiredStatus === statusauxiliotanque.AGUARDANDO ||
              desiredStatus === statusauxiliotanque.ELEGIVEL
                ? null
                : undefined,
            avaliacao_finalizada_em:
              desiredStatus === statusauxiliotanque.AGUARDANDO ||
              desiredStatus === statusauxiliotanque.ELEGIVEL
                ? null
                : undefined,
            eficacia_confirmada:
              desiredStatus === statusauxiliotanque.AGUARDANDO ||
              desiredStatus === statusauxiliotanque.ELEGIVEL
                ? null
                : undefined,
            motivo_avaliacao:
              desiredStatus === statusauxiliotanque.AGUARDANDO ||
              desiredStatus === statusauxiliotanque.ELEGIVEL
                ? null
                : undefined,
            versao: { increment: 1 },
            atualizado_em: evaluatedAt,
          },
        });
        changed += updated.count;
      }

      return changed;
    });
  }

  async updateIdleSchedulerDecision(input: {
    id_processo: number;
    expected_version: number;
    status: statussubsistemaauxiliar;
    reason: string | null;
    evaluated_at?: Date;
  }): Promise<boolean> {
    const updated = await this.prisma.processosauxiliares.updateMany({
      where: {
        id_processo: input.id_processo,
        id_processo_tanque_atual: null,
        versao: input.expected_version,
      },
      data: {
        status_subsistema: input.status,
        motivo_bloqueio: input.reason,
        versao: { increment: 1 },
        atualizado_em: input.evaluated_at ?? new Date(),
      },
    });

    return updated.count === 1;
  }

  async blockTank(input: {
    id_processo: number;
    id_processo_tanque: number;
    reason: string;
    create_no_effect_alarm?: boolean;
  }): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.processosauxiliares.updateMany({
        where: { id_processo: input.id_processo },
        data: {
          status_subsistema: statussubsistemaauxiliar.BLOQUEADO,
          id_processo_tanque_atual: null,
          motivo_bloqueio: input.reason,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      });
      await tx.processostanquesauxiliares.updateMany({
        where: { id_processo_tanque: input.id_processo_tanque },
        data: {
          status_auxilio: statusauxiliotanque.BLOQUEADO,
          motivo_bloqueio: input.reason,
          finalizado_em: now,
          avaliacao_finalizada_em: now,
          eficacia_confirmada: input.create_no_effect_alarm ? false : undefined,
          motivo_avaliacao: input.reason,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      });

      if (input.create_no_effect_alarm) {
        const existing = await tx.alarmes.findFirst({
          where: {
            id_processo: input.id_processo,
            id_processo_tanque: input.id_processo_tanque,
            tipo_alarme: tipoalarme.BOMBA,
            status_alarme: statusalarme.ATIVO,
            excluido_em: null,
          },
          select: { id_alarme: true },
        });
        if (!existing) {
          await tx.alarmes.create({
            data: {
              id_processo: input.id_processo,
              id_processo_tanque: input.id_processo_tanque,
              titulo: 'Bomba auxiliar sem efeito suficiente',
              descricao: input.reason,
              tipo_alarme: tipoalarme.BOMBA,
              severidade: severidadealarme.CRITICO,
              status_alarme: statusalarme.ATIVO,
              origem_alarme: origemalarme.BACKEND,
              ocorrido_em: now,
              bloqueante: true,
              requer_intervencao: true,
              recuperacao_automatica: false,
            },
          });
        }
      }
    });
  }

  async markSchedulerFailure(input: {
    id_processo: number;
    id_processo_tanque?: number;
    error: string;
  }): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.processosauxiliares.updateMany({
        where: { id_processo: input.id_processo },
        data: {
          status_subsistema: statussubsistemaauxiliar.FALHA,
          ultimo_erro: input.error,
          versao: { increment: 1 },
          atualizado_em: now,
        },
      }),
      ...(input.id_processo_tanque
        ? [
            this.prisma.processostanquesauxiliares.updateMany({
              where: { id_processo_tanque: input.id_processo_tanque },
              data: {
                status_auxilio: statusauxiliotanque.FALHA,
                ultimo_erro: input.error,
                versao: { increment: 1 },
                atualizado_em: now,
              },
            }),
          ]
        : []),
    ]);
  }

  private isActiveLease(
    ownerId: number | null,
    expiresAt: Date | null,
    evaluatedAt: Date,
  ): boolean {
    return Boolean(
      ownerId && expiresAt && expiresAt.getTime() > evaluatedAt.getTime(),
    );
  }

  private assertLeaseCanBeAcquired(
    process: {
      status_processo: statusprocesso;
      status_encerramento_geral: statusencerramentoprocesso;
      modo_operacao_auxiliar: modooperacaoauxiliar;
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar;
      } | null;
    } | null,
    resource: string,
  ): void {
    if (!process) {
      throw new NotFoundException('Processo nao encontrado.');
    }
    if (!process.processosauxiliares) {
      throw new NotFoundException('Contrato auxiliar nao encontrado.');
    }
    if (process.status_processo !== statusprocesso.EM_EXECUCAO) {
      throw new ConflictException(
        `Controle de ${resource} exige processo em execucao.`,
      );
    }
    const generalClosureStatus =
      process.status_encerramento_geral ?? statusencerramentoprocesso.INATIVO;
    if (
      generalClosureStatus !== statusencerramentoprocesso.INATIVO &&
      generalClosureStatus !== statusencerramentoprocesso.AGUARDANDO_TANQUES
    ) {
      throw new ConflictException(
        `Controle de ${resource} bloqueado durante o encerramento geral.`,
      );
    }
    if (process.modo_operacao_auxiliar === modooperacaoauxiliar.AUTOMATICO) {
      throw new ConflictException(
        'Modo AUTOMATICO nao permite aquisicao de controle humano. Use ASSISTIDO ou MANUAL.',
      );
    }
  }

  private assertTankLeaseCanBeAcquired(
    tank: {
      processos: {
        status_processo: statusprocesso;
        status_encerramento_geral: statusencerramentoprocesso;
        modo_operacao_auxiliar: modooperacaoauxiliar;
      };
      processostanquesauxiliares: object | null;
    } | null,
  ): void {
    if (!tank) {
      throw new NotFoundException('Tanque nao pertence ao processo.');
    }
    this.assertLeaseCanBeAcquired(
      {
        ...tank.processos,
        processosauxiliares: tank.processostanquesauxiliares
          ? { status_subsistema: statussubsistemaauxiliar.DISPONIVEL }
          : null,
      },
      'valvula',
    );
  }

  private assertReservationOwnership(input: {
    mode: modooperacaoauxiliar;
    origin: ProcessoAuxiliarSafetyOrigin;
    action: ProcessoAuxiliarSafetyAction;
    id_usuario?: number;
    pump_owner: number | null;
    pump_expires: Date | null;
    valve_owner: number | null;
    valve_expires: Date | null;
    any_active_valve_lease: boolean;
  }): void {
    const now = Date.now();
    const safeStateAction =
      input.action === ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR ||
      input.action === ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR;
    const activePumpLease = Boolean(
      input.pump_owner &&
      input.pump_expires &&
      input.pump_expires.getTime() > now,
    );

    if (input.origin === ProcessoAuxiliarSafetyOrigin.AUTOMACAO) {
      if (safeStateAction) {
        return;
      }
      if (input.mode === modooperacaoauxiliar.MANUAL) {
        throw new ConflictException(
          'Modo MANUAL nao permite energizacao pelo escalonador automatico.',
        );
      }
      if (
        input.mode === modooperacaoauxiliar.ASSISTIDO &&
        (activePumpLease || input.any_active_valve_lease)
      ) {
        throw new ConflictException(
          'Escalonador cedeu o subsistema a um lease humano ativo.',
        );
      }
      return;
    }

    if (input.mode === modooperacaoauxiliar.AUTOMATICO && safeStateAction) {
      return;
    }
    if (input.mode === modooperacaoauxiliar.AUTOMATICO) {
      throw new ConflictException(
        'Modo AUTOMATICO nao permite energizacao por comando humano.',
      );
    }

    if (!input.id_usuario) {
      throw new ConflictException(
        'Comando humano exige usuario identificado para validar titularidade.',
      );
    }
    if (
      PUMP_ACTIONS.has(input.action) &&
      (input.pump_owner !== input.id_usuario ||
        !input.pump_expires ||
        input.pump_expires.getTime() <= now)
    ) {
      throw new ConflictException(
        'Usuario nao possui lease ativo da bomba auxiliar.',
      );
    }

    if (
      VALVE_CONTROL_ACTIONS.has(input.action) &&
      (input.valve_owner !== input.id_usuario ||
        !input.valve_expires ||
        input.valve_expires.getTime() <= now)
    ) {
      throw new ConflictException(
        'Usuario nao possui lease ativo da valvula auxiliar do tanque.',
      );
    }
  }

  private resolveReservedSubsystemStatus(
    action: ProcessoAuxiliarSafetyAction,
  ): statussubsistemaauxiliar {
    return action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR ||
      action === ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR
      ? statussubsistemaauxiliar.PREPARANDO
      : statussubsistemaauxiliar.TROCANDO_TANQUE;
  }

  private resolveFinalSubsystemStatus(
    action: ProcessoAuxiliarSafetyAction,
  ): statussubsistemaauxiliar {
    if (action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR) {
      return statussubsistemaauxiliar.OPERANDO;
    }
    if (action === ProcessoAuxiliarSafetyAction.ABRIR_VALVULA_AUXILIAR) {
      return statussubsistemaauxiliar.PREPARANDO;
    }
    if (action === ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR) {
      return statussubsistemaauxiliar.TROCANDO_TANQUE;
    }
    return statussubsistemaauxiliar.DISPONIVEL;
  }

  private resolveFinalTankData(
    action: ProcessoAuxiliarSafetyAction,
    lifecycle: statustanqueprocesso | null,
    efficacyConfirmed: boolean,
    now: Date,
  ): {
    status_auxilio?: statusauxiliotanque;
    iniciado_em?: Date;
    finalizado_em?: Date | null;
  } {
    if (action === ProcessoAuxiliarSafetyAction.LIGAR_BOMBA_AUXILIAR) {
      return {
        status_auxilio: statusauxiliotanque.EM_ATENDIMENTO,
        iniciado_em: now,
        finalizado_em: null,
      };
    }
    if (action === ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR) {
      const attended =
        efficacyConfirmed ||
        lifecycle === statustanqueprocesso.VACUO_ATINGIDO ||
        lifecycle === statustanqueprocesso.VACUO_ESTABILIZADO;
      return {
        status_auxilio: attended
          ? statusauxiliotanque.ATENDIDO
          : statusauxiliotanque.MONITORANDO,
        finalizado_em: attended ? now : null,
      };
    }
    return {};
  }

  private decimalToNumber(
    value: Prisma.Decimal | number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return typeof value === 'number' ? value : value.toNumber();
  }

  private averageTail(values: number[]): number {
    const sample = values.slice(-Math.max(1, Math.ceil(values.length / 3)));
    return this.round(
      sample.reduce((total, value) => total + value, 0) / sample.length,
      3,
    );
  }

  private calculateTrend(values: number[]): number | null {
    if (values.length < 2) {
      return null;
    }
    const size = Math.max(1, Math.ceil(values.length / 3));
    const first = values.slice(0, size);
    const last = values.slice(-size);
    const firstMagnitude =
      first.reduce((total, value) => total + Math.abs(value), 0) / first.length;
    const lastMagnitude =
      last.reduce((total, value) => total + Math.abs(value), 0) / last.length;
    return this.round(lastMagnitude - firstMagnitude, 3);
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
