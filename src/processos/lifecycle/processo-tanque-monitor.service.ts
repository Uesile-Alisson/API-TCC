import { Injectable, Logger } from '@nestjs/common';
import {
  StatusAcoplamentoMangueira,
  motivoresolucaoalarme,
  origemalarme,
  origemevento,
  Prisma,
  severidadealarme,
  severidadeevento,
  statusalarme,
  statusencerramentotanque,
  statusestagnacao,
  statusintegridadesensor,
  statusprocesso,
  statussensor,
  statustanqueprocesso,
  tipoalarme,
  tipoleiturasensor,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProcessoDashboardReadingPoint,
  ProcessoTanqueRealtimeState,
} from '../interfaces';
import { ProcessoLifecycleService } from './processo-lifecycle.service';
import {
  ProcessoTanqueStagnationService,
  ProcessoTanqueStagnationTransition,
} from './processo-tanque-stagnation.service';

export interface ProcessoTanqueMonitorInput {
  id_leitura_sensor: number;
  id_processo: number;
  id_processo_tanque: number;
  id_processo_tanque_sensor: number;
}

export interface ProcessoTanqueMonitorResult {
  processed: boolean;
  reason: string;
  id_processo: number;
  id_processo_tanque: number;
  status_anterior?: statustanqueprocesso;
  status_atual?: statustanqueprocesso;
  status_mudou?: boolean;
  encerramento_mudou?: boolean;
  encerramento_status_anterior?: statusencerramentotanque;
  encerramento_status_atual?: statusencerramentotanque;
  estagnacao_mudou?: boolean;
  estagnacao_status_anterior?: statusestagnacao;
  estagnacao_status_atual?: statusestagnacao;
  vacuo_inicial?: number;
  vacuo_final?: number;
  vacuo_medio?: number;
  tank_state?: ProcessoTanqueRealtimeState;
  latest_reading?: ProcessoDashboardReadingPoint;
}

@Injectable()
export class ProcessoTanqueMonitorService {
  private readonly logger = new Logger(ProcessoTanqueMonitorService.name);
  private readonly tankQueues = new Map<number, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycleService: ProcessoLifecycleService,
    private readonly stagnationService: ProcessoTanqueStagnationService,
  ) {}

  monitorReading(
    input: ProcessoTanqueMonitorInput,
  ): Promise<ProcessoTanqueMonitorResult> {
    const previous =
      this.tankQueues.get(input.id_processo_tanque) ?? Promise.resolve();
    const operation = previous
      .catch(() => undefined)
      .then(() => this.processReading(input));
    const queueTail = operation.then(
      () => undefined,
      () => undefined,
    );

    this.tankQueues.set(input.id_processo_tanque, queueTail);

    return operation.finally(() => {
      if (this.tankQueues.get(input.id_processo_tanque) === queueTail) {
        this.tankQueues.delete(input.id_processo_tanque);
      }
    });
  }

  private async processReading(
    input: ProcessoTanqueMonitorInput,
  ): Promise<ProcessoTanqueMonitorResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const context = await tx.processostanquessensores.findUnique({
        where: {
          id_processo_tanque_sensor: input.id_processo_tanque_sensor,
        },
        select: {
          ativo: true,
          removido_em: true,
          sensores: {
            select: {
              status_sensor: true,
              status_integridade: true,
              calibracao_valida_ate: true,
            },
          },
          processostanques: {
            select: {
              id_processo_tanque: true,
              id_processo: true,
              id_tanque: true,
              vacuo_alvo: true,
              status_tanque_processo: true,
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
              status_estagnacao: true,
              estagnacao_iniciada_em: true,
              estagnacao_detectada_em: true,
              estagnacao_ultima_avaliacao_em: true,
              estagnacao_variacao_vacuo: true,
              estagnacao_leituras_janela: true,
              estagnacao_janelas_sem_progresso: true,
              iniciado_em: true,
              finalizado_em: true,
              tanques: {
                select: {
                  nome: true,
                  volume: true,
                  sensoresacoplamentomangueiras: {
                    where: { ativo: true },
                    select: {
                      status_acoplamento: true,
                      sinal_detectado: true,
                    },
                  },
                },
              },
              _count: {
                select: {
                  processostanquessensores: {
                    where: {
                      ativo: true,
                      removido_em: null,
                    },
                  },
                },
              },
              processos: {
                select: {
                  status_processo: true,
                  retomado_em: true,
                  encerramento_automatico: true,
                  encerramento_tolerancia_vacuo_percentual: true,
                  encerramento_limite_seguranca_vacuo: true,
                  encerramento_tempo_estabilizacao_segundos: true,
                  encerramento_estabilizacao_cobertura_minima_percentual: true,
                  encerramento_intervalo_leitura_esperado_ms: true,
                  encerramento_timeout_leitura_sensor_ms: true,
                  encerramento_tempo_retencao_segundos: true,
                  encerramento_perda_vacuo_maxima_retencao: true,
                  partida_finalizada_em: true,
                  estagnacao_janela_segundos: true,
                  estagnacao_variacao_minima: true,
                  estagnacao_leituras_minimas: true,
                  estagnacao_janelas_consecutivas: true,
                  estagnacao_tempo_minimo_bomba_principal_segundos: true,
                  estagnacao_tempo_maximo_sem_progresso_segundos: true,
                  estagnacao_fator_minimo_proximidade_alvo: true,
                  processostanques: {
                    where: {
                      status_tanque_processo: {
                        in: [
                          statustanqueprocesso.EM_EXECUCAO,
                          statustanqueprocesso.GERANDO_VACUO,
                          statustanqueprocesso.AGUARDANDO,
                        ],
                      },
                    },
                    select: {
                      tanques: { select: { volume: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!context || !context.ativo || context.removido_em) {
        return this.ignored(input, 'Vínculo de leitura inativo ou ausente.');
      }

      const sensor = context.sensores;
      if (
        sensor &&
        (sensor.status_sensor !== statussensor.ATIVO ||
          sensor.status_integridade !== statusintegridadesensor.VALIDO ||
          (sensor.calibracao_valida_ate !== null &&
            sensor.calibracao_valida_ate <= new Date()))
      ) {
        return this.ignored(
          input,
          'Leitura excluida do lifecycle: sensor indisponivel, sem liberacao ou com calibracao vencida.',
        );
      }

      const tank = context.processostanques;
      if (
        tank.id_processo !== input.id_processo ||
        tank.id_processo_tanque !== input.id_processo_tanque
      ) {
        return this.ignored(
          input,
          'Contexto da leitura diverge do processo/tanque persistido.',
        );
      }

      if (tank.processos.status_processo !== statusprocesso.EM_EXECUCAO) {
        return this.ignored(input, 'Processo não está em execução.');
      }

      if (this.isTerminalTankStatus(tank.status_tanque_processo)) {
        return this.ignored(input, 'Tanque está em estado terminal.');
      }

      const [
        systemConfig,
        aggregate,
        firstReading,
        lastReading,
        targetEvent,
        activeStagnationAlarm,
      ] = await Promise.all([
        tx.configuracoessistema.findFirst({
          orderBy: { atualizado_em: 'desc' },
          select: {
            estagnacao_janela_segundos: true,
            estagnacao_variacao_minima: true,
            estagnacao_leituras_minimas: true,
            estagnacao_janelas_consecutivas: true,
          },
        }),
        tx.leiturasensores.aggregate({
          where: this.buildTankReadingWhere(input.id_processo_tanque),
          _avg: { valor_vacuo: true },
          _count: { _all: true },
        }),
        tx.leiturasensores.findFirst({
          where: this.buildTankReadingWhere(input.id_processo_tanque),
          orderBy: [{ leitura_em: 'asc' }, { id_leitura_sensor: 'asc' }],
          select: {
            id_leitura_sensor: true,
            id_processo_tanque_sensor: true,
            valor_vacuo: true,
            valor: true,
            leitura_em: true,
            recebido_em: true,
            processostanquessensores: {
              select: {
                id_sensor: true,
              },
            },
          },
        }),
        tx.leiturasensores.findFirst({
          where: this.buildTankReadingWhere(input.id_processo_tanque),
          orderBy: [{ leitura_em: 'desc' }, { id_leitura_sensor: 'desc' }],
          select: {
            id_leitura_sensor: true,
            id_processo_tanque_sensor: true,
            valor_vacuo: true,
            valor: true,
            leitura_em: true,
            recebido_em: true,
            processostanquessensores: {
              select: {
                id_sensor: true,
              },
            },
          },
        }),
        tx.eventos.findFirst({
          where: {
            id_processo: input.id_processo,
            id_processo_tanque_sensor: input.id_processo_tanque_sensor,
            tipo_evento: 'VACUO_ALVO_ATINGIDO',
          },
          orderBy: { ocorrido_em: 'desc' },
          select: { ocorrido_em: true },
        }),
        tx.alarmes.findFirst({
          where: {
            id_processo: input.id_processo,
            id_processo_tanque: input.id_processo_tanque,
            tipo_alarme: tipoalarme.ESTAGNACAO,
            status_alarme: statusalarme.ATIVO,
            resolvido_em: null,
            excluido_em: null,
          },
          orderBy: { ocorrido_em: 'desc' },
          select: { id_alarme: true },
        }),
      ]);

      if (!systemConfig || !firstReading || !lastReading) {
        return this.ignored(
          input,
          'Configuração ou histórico de leituras indisponível.',
        );
      }

      const averageVacuum = this.decimalToNumber(aggregate._avg.valor_vacuo);
      if (averageVacuum === null) {
        return this.ignored(input, 'Média de vácuo indisponível.');
      }

      const targetEventOccurredAt = targetEvent?.ocorrido_em ?? null;
      const targetEventBelongsToCurrentRun =
        targetEventOccurredAt !== null &&
        (!tank.processos.retomado_em ||
          targetEventOccurredAt >= tank.processos.retomado_em);
      const targetReachedAt =
        tank.status_tanque_processo ===
          statustanqueprocesso.VACUO_ESTABILIZADO ||
        (tank.status_tanque_processo === statustanqueprocesso.VACUO_ATINGIDO &&
          targetEventBelongsToCurrentRun)
          ? targetEventOccurredAt
          : null;
      const stabilizationReadings = targetReachedAt
        ? await tx.leiturasensores.findMany({
            where: {
              ...this.buildTankReadingWhere(input.id_processo_tanque),
              recebido_em: { gte: targetReachedAt },
            },
            orderBy: [{ recebido_em: 'asc' }, { id_leitura_sensor: 'asc' }],
            select: { recebido_em: true },
          })
        : [];
      const readingsSinceTarget = stabilizationReadings.length;
      const expectedStabilizationReadings = Math.max(
        1,
        Math.ceil(
          (tank.processos.encerramento_tempo_estabilizacao_segundos * 1000) /
            tank.processos.encerramento_intervalo_leitura_esperado_ms,
        ),
      );
      const maximumStabilizationGap = this.calculateMaximumReadingGap(
        targetReachedAt,
        stabilizationReadings.map((reading) => reading.recebido_em),
        lastReading.recebido_em,
      );
      const initialVacuum = this.requiredReadingValue(firstReading);
      const finalVacuum = this.requiredReadingValue(lastReading);
      const stagnationConfig = {
        windowSeconds:
          tank.processos.estagnacao_janela_segundos ??
          systemConfig.estagnacao_janela_segundos,
        minimumVariation: this.decimalToNumber(
          tank.processos.estagnacao_variacao_minima ??
            systemConfig.estagnacao_variacao_minima,
        ) as number,
        minimumReadings:
          tank.processos.estagnacao_leituras_minimas ??
          systemConfig.estagnacao_leituras_minimas,
        consecutiveWindows:
          tank.processos.estagnacao_janelas_consecutivas ??
          systemConfig.estagnacao_janelas_consecutivas,
        minimumPumpSeconds:
          tank.processos.estagnacao_tempo_minimo_bomba_principal_segundos ?? 30,
        maximumNoProgressSeconds:
          tank.processos.estagnacao_tempo_maximo_sem_progresso_segundos ?? 180,
        minimumTargetFactor:
          this.decimalToNumber(
            tank.processos.estagnacao_fator_minimo_proximidade_alvo,
          ) ?? 0.35,
      };
      const tankVolume = this.decimalToNumber(tank.tanques.volume) ?? 1;
      const activeVolumes = tank.processos.processostanques?.map(
        (item) => this.decimalToNumber(item.tanques.volume) ?? tankVolume,
      ) ?? [tankVolume];
      const averageActiveVolume =
        activeVolumes.reduce((total, volume) => total + volume, 0) /
        Math.max(1, activeVolumes.length);
      const pumpStartedAt = this.latestNullableDate(
        tank.iniciado_em,
        tank.processos.retomado_em,
        tank.processos.partida_finalizada_em,
      );
      const pumpRuntimeSeconds = pumpStartedAt
        ? Math.max(
            0,
            Math.floor(
              (lastReading.recebido_em.getTime() - pumpStartedAt.getTime()) /
                1000,
            ),
          )
        : 0;
      const transition = this.lifecycleService.buildTankReadingTransition({
        status_atual: tank.status_tanque_processo,
        vacuo_atual: finalVacuum,
        vacuo_inicial: initialVacuum,
        vacuo_medio: averageVacuum,
        vacuo_alvo: tank.vacuo_alvo.toNumber(),
        tolerancia_percentual:
          tank.processos.encerramento_tolerancia_vacuo_percentual.toNumber(),
        alvo_atingido_em: targetReachedAt,
        leituras_desde_alvo: readingsSinceTarget,
        leituras_esperadas: expectedStabilizationReadings,
        maior_intervalo_leitura_ms: maximumStabilizationGap,
        tempo_estabilizacao_segundos:
          tank.processos.encerramento_tempo_estabilizacao_segundos,
        cobertura_minima_percentual:
          tank.processos.encerramento_estabilizacao_cobertura_minima_percentual.toNumber(),
        timeout_leitura_sensor_ms:
          tank.processos.encerramento_timeout_leitura_sensor_ms,
        encerramento_automatico: tank.processos.encerramento_automatico,
        status_encerramento_atual: tank.status_encerramento,
        limite_seguranca_vacuo:
          tank.processos.encerramento_limite_seguranca_vacuo.toNumber(),
        now: lastReading.recebido_em,
      });
      const stagnationWindowStart = this.latestDate(
        new Date(
          lastReading.recebido_em.getTime() -
            stagnationConfig.windowSeconds * 1000,
        ),
        tank.iniciado_em,
        tank.processos.retomado_em,
      );
      const stagnationReadings =
        transition.status_atual === statustanqueprocesso.GERANDO_VACUO
          ? await tx.leiturasensores.findMany({
              where: {
                ...this.buildTankReadingWhere(input.id_processo_tanque),
                recebido_em: {
                  gte: stagnationWindowStart,
                  lte: lastReading.recebido_em,
                },
              },
              orderBy: [{ recebido_em: 'asc' }, { id_leitura_sensor: 'asc' }],
              select: {
                valor_vacuo: true,
                valor: true,
                recebido_em: true,
              },
            })
          : [];
      const stagnationTransition = this.stagnationService.evaluate({
        status_tanque_processo: transition.status_atual,
        status_atual: tank.status_estagnacao,
        iniciada_em: tank.estagnacao_iniciada_em,
        detectada_em: tank.estagnacao_detectada_em,
        ultima_avaliacao_em: tank.estagnacao_ultima_avaliacao_em,
        variacao_vacuo: this.decimalToNumber(tank.estagnacao_variacao_vacuo),
        leituras_janela: tank.estagnacao_leituras_janela,
        janelas_sem_progresso: tank.estagnacao_janelas_sem_progresso,
        janela_segundos: stagnationConfig.windowSeconds,
        variacao_minima: stagnationConfig.minimumVariation,
        leituras_minimas: stagnationConfig.minimumReadings,
        janelas_consecutivas: stagnationConfig.consecutiveWindows,
        volume_tanque: tankVolume,
        volume_medio_tanques_ativos: averageActiveVolume,
        tanques_ativos: activeVolumes.length,
        vacuo_alvo: tank.vacuo_alvo.toNumber(),
        vacuo_atual: finalVacuum,
        fator_minimo_proximidade_alvo: stagnationConfig.minimumTargetFactor,
        tempo_bomba_principal_segundos: pumpRuntimeSeconds,
        tempo_minimo_bomba_principal_segundos:
          stagnationConfig.minimumPumpSeconds,
        tempo_maximo_sem_progresso_segundos:
          stagnationConfig.maximumNoProgressSeconds,
        leitura_valida: true,
        execucao_iniciada_em: this.latestNullableDate(
          tank.iniciado_em,
          tank.processos.retomado_em,
        ),
        avaliado_em: lastReading.recebido_em,
        amostras: stagnationReadings.map((reading) => ({
          valor_vacuo: this.requiredReadingValue(reading),
          recebido_em: reading.recebido_em,
        })),
      });
      const updated = await tx.processostanques.updateMany({
        where: {
          id_processo_tanque: input.id_processo_tanque,
          status_tanque_processo: tank.status_tanque_processo,
          status_estagnacao: tank.status_estagnacao,
          encerramento_versao: tank.encerramento_versao,
          processos: {
            status_processo: statusprocesso.EM_EXECUCAO,
          },
        },
        data: {
          ...transition.data,
          ...stagnationTransition.data,
          encerramento_versao: transition.encerramento_status_mudou
            ? { increment: 1 }
            : undefined,
        },
      });

      if (updated.count !== 1) {
        return this.ignored(
          input,
          'Estado do tanque mudou durante o processamento da leitura.',
        );
      }

      if (transition.tipo_evento) {
        await tx.eventos.create({
          data: {
            id_processo: input.id_processo,
            id_processo_tanque_sensor: input.id_processo_tanque_sensor,
            tipo_evento: transition.tipo_evento,
            origem_evento: origemevento.SENSOR,
            severidade_evento: severidadeevento.INFO,
            ocorrido_em: lastReading.recebido_em,
          },
        });
      }

      if (stagnationTransition.tipo_evento) {
        await tx.eventos.create({
          data: {
            id_processo: input.id_processo,
            id_processo_tanque_sensor: input.id_processo_tanque_sensor,
            tipo_evento: stagnationTransition.tipo_evento,
            origem_evento: origemevento.BACKEND,
            severidade_evento:
              stagnationTransition.status_atual === statusestagnacao.DETECTADA
                ? severidadeevento.AVISO
                : severidadeevento.INFO,
            ocorrido_em: lastReading.recebido_em,
          },
        });
      }

      const activeStagnationAlarmId = await this.syncStagnationAlarm({
        tx,
        input,
        tankName: tank.tanques.nome,
        transition: stagnationTransition,
        activeAlarmId: activeStagnationAlarm?.id_alarme ?? null,
        evaluatedAt: lastReading.recebido_em,
        minimumVariation:
          stagnationTransition.data.estagnacao_variacao_minima_ajustada ??
          stagnationConfig.minimumVariation,
        windowSeconds: stagnationConfig.windowSeconds,
      });

      const latestReading: ProcessoDashboardReadingPoint = {
        id_leitura_sensor: lastReading.id_leitura_sensor,
        id_processo_tanque_sensor: lastReading.id_processo_tanque_sensor,
        id_tanque: tank.id_tanque,
        id_sensor: lastReading.processostanquessensores.id_sensor,
        valor_vacuo: finalVacuum,
        leitura_em: lastReading.leitura_em,
        recebido_em: lastReading.recebido_em,
      };
      const tankState: ProcessoTanqueRealtimeState = {
        id_processo_tanque: tank.id_processo_tanque,
        id_tanque: tank.id_tanque,
        nome_tanque: tank.tanques.nome,
        status_tanque_processo: transition.status_atual,
        vacuo_atingido: transition.data.vacuo_atingido ?? false,
        vacuo_estabilizado: transition.data.vacuo_estabilizado ?? false,
        vacuo_alvo: tank.vacuo_alvo.toNumber(),
        vacuo_atual: finalVacuum,
        vacuo_inicial: initialVacuum,
        vacuo_final: finalVacuum,
        vacuo_medio: averageVacuum,
        eficiencia: this.calculateEfficiency(
          finalVacuum,
          tank.vacuo_alvo.toNumber(),
        ),
        iniciado_em: tank.iniciado_em,
        finalizado_em: tank.finalizado_em,
        ultima_leitura_em: lastReading.leitura_em,
        ultima_leitura_recebida_em: lastReading.recebido_em,
        total_sensores: tank._count.processostanquessensores,
        total_leituras: aggregate._count._all,
        encerramento: {
          status: transition.encerramento_status_atual,
          etapa: transition.data.etapa_encerramento ?? tank.etapa_encerramento,
          automatico: tank.processos.encerramento_automatico,
          pronto_para_encerrar:
            transition.encerramento_status_atual === 'PRONTO_PARA_ENCERRAR',
          aguardando_acao_manual:
            transition.encerramento_status_atual === 'AGUARDANDO_ACAO_MANUAL',
          pode_desacoplar: false,
          mangueira_acoplada: this.resolveCouplingState(
            tank.tanques.sensoresacoplamentomangueiras,
          ),
          iniciado_em: tank.encerramento_iniciado_em,
          isolado_em: tank.isolado_em,
          retencao_iniciada_em: tank.retencao_iniciada_em,
          retencao_finalizada_em: tank.retencao_finalizada_em,
          vacuo_isolamento: this.decimalToNumber(tank.vacuo_isolamento),
          perda_vacuo_retencao: this.decimalToNumber(tank.perda_vacuo_retencao),
          motivo_bloqueio:
            transition.data.motivo_bloqueio_encerramento ??
            tank.motivo_bloqueio_encerramento,
          versao:
            tank.encerramento_versao +
            (transition.encerramento_status_mudou ? 1 : 0),
          tentativa: tank.encerramento_tentativa,
          comando_tentativas: tank.encerramento_comando_tentativas,
          proxima_tentativa_em: tank.encerramento_proxima_tentativa_em,
          estabilizacao: {
            tempo_necessario_segundos:
              transition.estabilizacao.duracao_necessaria_segundos,
            cobertura_minima_percentual:
              transition.estabilizacao.cobertura_minima_percentual,
            leituras_esperadas: transition.estabilizacao.leituras_esperadas,
            leituras_observadas: transition.estabilizacao.leituras_observadas,
            cobertura_atual_percentual:
              transition.estabilizacao.cobertura_percentual,
            maior_intervalo_ms:
              transition.estabilizacao.maior_intervalo_leitura_ms,
            timeout_leitura_ms:
              transition.estabilizacao.timeout_leitura_sensor_ms,
            continuidade_aprovada:
              transition.estabilizacao.continuidade_aprovada,
          },
          retencao: {
            tempo_necessario_segundos:
              tank.processos.encerramento_tempo_retencao_segundos,
            perda_maxima_permitida:
              tank.processos.encerramento_perda_vacuo_maxima_retencao.toNumber(),
          },
          seguranca: {
            limite_vacuo:
              tank.processos.encerramento_limite_seguranca_vacuo.toNumber(),
            limite_excedido: transition.limite_seguranca_excedido,
          },
        },
        estagnacao: this.buildStagnationState({
          transition: stagnationTransition,
          activeAlarmId: activeStagnationAlarmId,
          evaluatedAt: lastReading.recebido_em,
          windowSeconds: stagnationConfig.windowSeconds,
          minimumVariation:
            stagnationTransition.data.estagnacao_variacao_minima_ajustada ??
            stagnationConfig.minimumVariation,
          baseMinimumVariation: stagnationConfig.minimumVariation,
          minimumReadings: stagnationConfig.minimumReadings,
          consecutiveWindows: stagnationConfig.consecutiveWindows,
        }),
      };

      return {
        processed: true,
        reason: transition.status_mudou
          ? 'Lifecycle individual do tanque atualizado.'
          : 'Métricas individuais do tanque atualizadas.',
        id_processo: input.id_processo,
        id_processo_tanque: input.id_processo_tanque,
        status_anterior: transition.status_anterior,
        status_atual: transition.status_atual,
        status_mudou: transition.status_mudou,
        encerramento_mudou: transition.encerramento_status_mudou,
        encerramento_status_anterior: transition.encerramento_status_anterior,
        encerramento_status_atual: transition.encerramento_status_atual,
        estagnacao_mudou: stagnationTransition.status_mudou,
        estagnacao_status_anterior: stagnationTransition.status_anterior,
        estagnacao_status_atual: stagnationTransition.status_atual,
        vacuo_inicial: initialVacuum,
        vacuo_final: finalVacuum,
        vacuo_medio: averageVacuum,
        tank_state: tankState,
        latest_reading: latestReading,
      } satisfies ProcessoTanqueMonitorResult;
    });

    if (result.processed && result.status_mudou) {
      this.logger.log(
        `Lifecycle individual atualizado. Processo: ${result.id_processo}. ` +
          `Processo/tanque: ${result.id_processo_tanque}. ` +
          `Status: ${result.status_anterior} -> ${result.status_atual}.`,
      );
    }

    if (result.processed && result.estagnacao_mudou) {
      this.logger.warn(
        `Detector de estagnacao atualizado. Processo: ${result.id_processo}. ` +
          `Processo/tanque: ${result.id_processo_tanque}. ` +
          `Status: ${result.estagnacao_status_anterior} -> ` +
          `${result.estagnacao_status_atual}.`,
      );
    }

    return result;
  }

  private buildTankReadingWhere(
    idProcessoTanque: number,
  ): Prisma.leiturasensoresWhereInput {
    return {
      tipo_leitura: tipoleiturasensor.VACUO,
      valor_vacuo: { not: null },
      processostanquessensores: {
        id_processo_tanque: idProcessoTanque,
      },
    };
  }

  private calculateMaximumReadingGap(
    targetReachedAt: Date | null,
    readings: Date[],
    evaluatedAt: Date,
  ): number {
    if (!targetReachedAt) {
      return 0;
    }

    let maximumGap = 0;
    let previous = targetReachedAt;

    for (const readingAt of readings) {
      maximumGap = Math.max(
        maximumGap,
        Math.max(0, readingAt.getTime() - previous.getTime()),
      );
      previous = readingAt;
    }

    return Math.max(
      maximumGap,
      Math.max(0, evaluatedAt.getTime() - previous.getTime()),
    );
  }

  private resolveCouplingState(
    acoplamento: {
      status_acoplamento: StatusAcoplamentoMangueira;
      sinal_detectado: boolean;
    } | null,
  ): boolean | null {
    if (!acoplamento) {
      return null;
    }

    return (
      acoplamento.status_acoplamento === StatusAcoplamentoMangueira.ACOPLADA &&
      acoplamento.sinal_detectado
    );
  }

  private requiredReadingValue(input: {
    valor_vacuo: Prisma.Decimal | null;
    valor: Prisma.Decimal;
  }): number {
    return (input.valor_vacuo ?? input.valor).toNumber();
  }

  private decimalToNumber(value: Prisma.Decimal | null): number | null {
    return value?.toNumber() ?? null;
  }

  private calculateEfficiency(
    currentVacuum: number,
    targetVacuum: number,
  ): number | null {
    if (targetVacuum === 0) {
      return null;
    }

    const efficiency = (Math.abs(currentVacuum) / Math.abs(targetVacuum)) * 100;

    return Math.round(efficiency * 100) / 100;
  }

  private async syncStagnationAlarm(input: {
    tx: Prisma.TransactionClient;
    input: ProcessoTanqueMonitorInput;
    tankName: string;
    transition: ProcessoTanqueStagnationTransition;
    activeAlarmId: number | null;
    evaluatedAt: Date;
    minimumVariation: number;
    windowSeconds: number;
  }): Promise<number | null> {
    if (input.transition.status_atual === statusestagnacao.DETECTADA) {
      const description =
        `O tanque ${input.tankName} permaneceu sem progresso minimo de vacuo ` +
        `por ${input.transition.data.estagnacao_janelas_sem_progresso} ` +
        `janelas consecutivas de ${input.windowSeconds} segundos. ` +
        `Variacao observada: ${input.transition.variacao_vacuo ?? 0}. ` +
        `Minimo esperado: ${input.minimumVariation}.`;

      if (input.activeAlarmId) {
        await input.tx.alarmes.update({
          where: { id_alarme: input.activeAlarmId },
          data: {
            descricao: description,
            valor_detectado: input.transition.variacao_vacuo,
            ultima_validacao_em: input.evaluatedAt,
          },
        });

        return input.activeAlarmId;
      }

      const alarm = await input.tx.alarmes.create({
        data: {
          id_processo: input.input.id_processo,
          id_processo_tanque: input.input.id_processo_tanque,
          id_processo_tanque_sensor: input.input.id_processo_tanque_sensor,
          titulo: 'Estagnacao de vacuo detectada',
          descricao: description,
          tipo_alarme: tipoalarme.ESTAGNACAO,
          severidade: severidadealarme.MEDIO,
          status_alarme: statusalarme.ATIVO,
          origem_alarme: origemalarme.BACKEND,
          valor_detectado: input.transition.variacao_vacuo,
          unidade: 'vacuo/janela',
          ocorrido_em:
            input.transition.data.estagnacao_detectada_em ?? input.evaluatedAt,
          ultima_validacao_em: input.evaluatedAt,
          bloqueante: false,
          requer_intervencao: true,
          recuperacao_automatica: true,
        },
        select: { id_alarme: true },
      });

      return alarm.id_alarme;
    }

    if (
      input.activeAlarmId &&
      input.transition.status_atual === statusestagnacao.NORMAL
    ) {
      await input.tx.alarmes.update({
        where: { id_alarme: input.activeAlarmId },
        data: {
          status_alarme: statusalarme.NORMALIZADO,
          normalizado_em: input.evaluatedAt,
          ultima_validacao_em: input.evaluatedAt,
          motivo_resolucao: motivoresolucaoalarme.AUTO_RECUPERADO,
        },
      });
    }

    return null;
  }

  private buildStagnationState(input: {
    transition: ProcessoTanqueStagnationTransition;
    activeAlarmId: number | null;
    evaluatedAt: Date;
    windowSeconds: number;
    minimumVariation: number;
    baseMinimumVariation?: number;
    minimumReadings: number;
    consecutiveWindows: number;
  }): ProcessoTanqueRealtimeState['estagnacao'] {
    const startedAt = input.transition.data.estagnacao_iniciada_em;
    const durationSeconds = startedAt
      ? Math.max(
          0,
          Math.floor(
            (input.evaluatedAt.getTime() - startedAt.getTime()) / 1000,
          ),
        )
      : 0;

    return {
      status: input.transition.status_atual,
      suspeita: input.transition.status_atual === statusestagnacao.SUSPEITA,
      detectada: input.transition.status_atual === statusestagnacao.DETECTADA,
      iniciada_em: startedAt,
      detectada_em: input.transition.data.estagnacao_detectada_em,
      ultima_avaliacao_em: input.transition.data.estagnacao_ultima_avaliacao_em,
      duracao_segundos: durationSeconds,
      variacao_vacuo: input.transition.data.estagnacao_variacao_vacuo,
      janela_segundos: input.windowSeconds,
      variacao_minima_esperada: input.minimumVariation,
      variacao_minima_base:
        input.baseMinimumVariation ?? input.minimumVariation,
      leituras_janela: input.transition.data.estagnacao_leituras_janela,
      leituras_minimas: input.minimumReadings,
      janelas_sem_progresso:
        input.transition.data.estagnacao_janelas_sem_progresso,
      janelas_consecutivas_necessarias: input.consecutiveWindows,
      id_alarme_ativo: input.activeAlarmId,
      mensagem: input.transition.motivo,
      evidencias: {
        fator_volume: input.transition.data.estagnacao_fator_volume ?? null,
        fator_tanques_ativos:
          input.transition.data.estagnacao_fator_tanques_ativos ?? null,
        fator_proximidade_alvo:
          input.transition.data.estagnacao_fator_proximidade_alvo ?? null,
        volume_tanque: input.transition.data.estagnacao_volume_tanque ?? null,
        volume_medio_tanques_ativos:
          input.transition.data.estagnacao_volume_medio_tanques_ativos ?? null,
        tanques_ativos: input.transition.data.estagnacao_tanques_ativos ?? 0,
        vacuo_atual: input.transition.data.estagnacao_vacuo_atual ?? null,
        distancia_alvo: input.transition.data.estagnacao_distancia_alvo ?? null,
        tempo_bomba_principal_segundos:
          input.transition.data.estagnacao_tempo_bomba_principal_segundos ?? 0,
        motivo_decisao: input.transition.data.estagnacao_motivo_decisao ?? null,
      },
    };
  }

  private latestDate(required: Date, ...values: Array<Date | null>): Date {
    return values.reduce<Date>(
      (latest, value) =>
        value && value.getTime() > latest.getTime() ? value : latest,
      required,
    );
  }

  private latestNullableDate(...values: Array<Date | null>): Date | null {
    return values.reduce<Date | null>((latest, value) => {
      if (!value) {
        return latest;
      }

      return !latest || value.getTime() > latest.getTime() ? value : latest;
    }, null);
  }

  private isTerminalTankStatus(status: statustanqueprocesso): boolean {
    return (
      status === statustanqueprocesso.CONCLUIDO ||
      status === statustanqueprocesso.FALHA ||
      status === statustanqueprocesso.INTERROMPIDO ||
      status === statustanqueprocesso.CHEIO
    );
  }

  private ignored(
    input: ProcessoTanqueMonitorInput,
    reason: string,
  ): ProcessoTanqueMonitorResult {
    return {
      processed: false,
      reason,
      id_processo: input.id_processo,
      id_processo_tanque: input.id_processo_tanque,
    };
  }
}
