import { Injectable } from '@nestjs/common';
import {
  etapaencerramentotanque,
  statusestagnacao,
  statusencerramentotanque,
  statusprocesso,
  statustanqueprocesso,
  tipoeventoprocesso,
} from '@prisma/client';

export const PROCESSO_TANQUE_ESTABILIZACAO_MINIMA_MS = 30_000;
export const PROCESSO_TANQUE_LEITURAS_MINIMAS_ESTABILIZACAO = 3;

export interface ProcessoLifecycleTransition {
  processo: ProcessoStatusUpdateData;
  tanques?: ProcessoTanqueStatusUpdateData;
}

export interface ProcessoStatusUpdateData {
  status_processo: statusprocesso;
  iniciado_em?: Date | null;
  pausado_em?: Date | null;
  retomado_em?: Date | null;
  finalizado_em?: Date | null;
  parada_emergencia?: boolean;
  tempo_execucao?: number | null;
}

export interface ProcessoTanqueStatusUpdateData {
  status_tanque_processo: statustanqueprocesso;
  iniciado_em?: Date | null;
  finalizado_em?: Date | null;
  vacuo_inicial?: number | null;
  vacuo_final?: number | null;
  vacuo_medio?: number | null;
  vacuo_atingido?: boolean;
  vacuo_estabilizado?: boolean;
  status_estagnacao?: statusestagnacao;
  estagnacao_iniciada_em?: Date | null;
  estagnacao_detectada_em?: Date | null;
  estagnacao_ultima_avaliacao_em?: Date | null;
  estagnacao_variacao_vacuo?: number | null;
  estagnacao_leituras_janela?: number;
  estagnacao_janelas_sem_progresso?: number;
  status_encerramento?: statusencerramentotanque;
  encerramento_iniciado_em?: Date | null;
  isolado_em?: Date | null;
  retencao_iniciada_em?: Date | null;
  retencao_finalizada_em?: Date | null;
  vacuo_isolamento?: number | null;
  perda_vacuo_retencao?: number | null;
  motivo_bloqueio_encerramento?: string | null;
  etapa_encerramento?: etapaencerramentotanque;
  encerramento_tentativa?: number;
  encerramento_comando_tentativas?: number;
  encerramento_proxima_tentativa_em?: Date | null;
  estabilizacao_leituras_esperadas?: number;
  estabilizacao_leituras_observadas?: number;
  estabilizacao_cobertura_percentual?: number;
  estabilizacao_maior_intervalo_ms?: number;
}

export interface ProcessoTanqueReadingLifecycleInput {
  status_atual: statustanqueprocesso;
  vacuo_atual: number;
  vacuo_inicial: number;
  vacuo_medio: number;
  vacuo_alvo: number;
  tolerancia_percentual: number;
  alvo_atingido_em: Date | null;
  leituras_desde_alvo: number;
  leituras_esperadas?: number;
  maior_intervalo_leitura_ms?: number;
  tempo_estabilizacao_segundos?: number;
  cobertura_minima_percentual?: number;
  timeout_leitura_sensor_ms?: number;
  encerramento_automatico?: boolean;
  status_encerramento_atual?: statusencerramentotanque;
  limite_seguranca_vacuo?: number;
  now?: Date;
}

export interface ProcessoTanqueStabilizationEvidence {
  duracao_necessaria_segundos: number;
  duracao_observada_segundos: number;
  leituras_esperadas: number;
  leituras_observadas: number;
  cobertura_percentual: number;
  cobertura_minima_percentual: number;
  maior_intervalo_leitura_ms: number;
  timeout_leitura_sensor_ms: number;
  continuidade_aprovada: boolean;
}

export interface ProcessoTanqueReadingLifecycleTransition {
  data: ProcessoTanqueStatusUpdateData;
  tipo_evento: tipoeventoprocesso | null;
  status_anterior: statustanqueprocesso;
  status_atual: statustanqueprocesso;
  status_mudou: boolean;
  dentro_tolerancia: boolean;
  encerramento_status_anterior: statusencerramentotanque;
  encerramento_status_atual: statusencerramentotanque;
  encerramento_status_mudou: boolean;
  limite_seguranca_excedido: boolean;
  estabilizacao: ProcessoTanqueStabilizationEvidence;
}

interface ProcessoLifecycleInput {
  now?: Date;
}

interface ProcessoLifecycleFinalInput extends ProcessoLifecycleInput {
  tempo_execucao?: number | null;
}

@Injectable()
export class ProcessoLifecycleService {
  buildStartTransition(
    input: ProcessoLifecycleInput,
  ): ProcessoLifecycleTransition {
    const now = this.resolveNow(input.now);

    return {
      processo: {
        status_processo: statusprocesso.EM_EXECUCAO,
        iniciado_em: now,
        pausado_em: null,
        retomado_em: null,
        finalizado_em: null,
        parada_emergencia: false,
      },
      tanques: {
        status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
        iniciado_em: now,
        finalizado_em: null,
        vacuo_inicial: null,
        vacuo_final: null,
        vacuo_medio: null,
        vacuo_atingido: false,
        vacuo_estabilizado: false,
        status_encerramento: statusencerramentotanque.MONITORANDO,
        encerramento_iniciado_em: now,
        isolado_em: null,
        retencao_iniciada_em: null,
        retencao_finalizada_em: null,
        vacuo_isolamento: null,
        perda_vacuo_retencao: null,
        motivo_bloqueio_encerramento: null,
        etapa_encerramento: etapaencerramentotanque.NENHUMA,
        encerramento_tentativa: 0,
        encerramento_comando_tentativas: 0,
        encerramento_proxima_tentativa_em: null,
        estabilizacao_leituras_esperadas: 0,
        estabilizacao_leituras_observadas: 0,
        estabilizacao_cobertura_percentual: 0,
        estabilizacao_maior_intervalo_ms: 0,
        ...this.buildStagnationReset(),
      },
    };
  }

  buildPauseTransition(
    input: ProcessoLifecycleInput,
  ): ProcessoLifecycleTransition {
    const now = this.resolveNow(input.now);

    return {
      processo: {
        status_processo: statusprocesso.PAUSADO,
        pausado_em: now,
      },
    };
  }

  buildResumeTransition(
    input: ProcessoLifecycleInput,
  ): ProcessoLifecycleTransition {
    const now = this.resolveNow(input.now);

    return {
      processo: {
        status_processo: statusprocesso.EM_EXECUCAO,
        retomado_em: now,
        pausado_em: null,
      },
    };
  }

  buildTankReadingTransition(
    input: ProcessoTanqueReadingLifecycleInput,
  ): ProcessoTanqueReadingLifecycleTransition {
    const now = this.resolveNow(input.now);
    const dentroTolerancia = this.isWithinVacuumTarget(
      input.vacuo_atual,
      input.vacuo_alvo,
      input.tolerancia_percentual,
    );
    const limiteSegurancaExcedido = this.exceededSafetyLimit(
      input.vacuo_atual,
      input.limite_seguranca_vacuo,
    );
    const stabilization = this.buildStabilizationEvidence(input, now);
    const previousClosureStatus =
      input.status_encerramento_atual ?? statusencerramentotanque.MONITORANDO;
    let nextStatus: statustanqueprocesso = statustanqueprocesso.GERANDO_VACUO;
    let nextClosureStatus = previousClosureStatus;
    let eventType: tipoeventoprocesso | null = null;

    if (dentroTolerancia) {
      const canStabilize =
        input.status_atual === statustanqueprocesso.VACUO_ATINGIDO &&
        input.alvo_atingido_em !== null &&
        stabilization.duracao_observada_segundos >=
          stabilization.duracao_necessaria_segundos &&
        stabilization.cobertura_percentual >=
          stabilization.cobertura_minima_percentual &&
        stabilization.continuidade_aprovada;

      if (
        input.status_atual === statustanqueprocesso.VACUO_ESTABILIZADO ||
        canStabilize
      ) {
        nextStatus = statustanqueprocesso.VACUO_ESTABILIZADO;
        if (input.status_atual !== statustanqueprocesso.VACUO_ESTABILIZADO) {
          eventType = tipoeventoprocesso.TANQUE_ESTABILIZADO;
        }
      } else {
        nextStatus = statustanqueprocesso.VACUO_ATINGIDO;
        if (
          input.status_atual !== statustanqueprocesso.VACUO_ATINGIDO ||
          input.alvo_atingido_em === null
        ) {
          eventType = tipoeventoprocesso.VACUO_ALVO_ATINGIDO;
        }
      }
    }

    if (limiteSegurancaExcedido) {
      nextClosureStatus = statusencerramentotanque.FALHA;
    } else if (this.canMonitorClosure(previousClosureStatus)) {
      if (nextStatus === statustanqueprocesso.VACUO_ESTABILIZADO) {
        nextClosureStatus =
          input.encerramento_automatico === false
            ? statusencerramentotanque.AGUARDANDO_ACAO_MANUAL
            : statusencerramentotanque.PRONTO_PARA_ENCERRAR;
      } else if (nextStatus === statustanqueprocesso.VACUO_ATINGIDO) {
        nextClosureStatus = statusencerramentotanque.AGUARDANDO_ESTABILIZACAO;
      } else {
        nextClosureStatus = statusencerramentotanque.MONITORANDO;
      }
    }

    return {
      data: {
        status_tanque_processo: nextStatus,
        vacuo_inicial: input.vacuo_inicial,
        vacuo_final: input.vacuo_atual,
        vacuo_medio: input.vacuo_medio,
        vacuo_atingido:
          nextStatus === statustanqueprocesso.VACUO_ATINGIDO ||
          nextStatus === statustanqueprocesso.VACUO_ESTABILIZADO,
        vacuo_estabilizado:
          nextStatus === statustanqueprocesso.VACUO_ESTABILIZADO,
        status_encerramento: nextClosureStatus,
        etapa_encerramento: limiteSegurancaExcedido
          ? etapaencerramentotanque.FALHA
          : undefined,
        encerramento_proxima_tentativa_em: limiteSegurancaExcedido
          ? null
          : undefined,
        motivo_bloqueio_encerramento: limiteSegurancaExcedido
          ? 'Limite de seguranca de vacuo excedido.'
          : null,
        estabilizacao_leituras_esperadas: stabilization.leituras_esperadas,
        estabilizacao_leituras_observadas: stabilization.leituras_observadas,
        estabilizacao_cobertura_percentual: stabilization.cobertura_percentual,
        estabilizacao_maior_intervalo_ms:
          stabilization.maior_intervalo_leitura_ms,
      },
      tipo_evento: eventType,
      status_anterior: input.status_atual,
      status_atual: nextStatus,
      status_mudou: nextStatus !== input.status_atual,
      dentro_tolerancia: dentroTolerancia,
      encerramento_status_anterior: previousClosureStatus,
      encerramento_status_atual: nextClosureStatus,
      encerramento_status_mudou: nextClosureStatus !== previousClosureStatus,
      limite_seguranca_excedido: limiteSegurancaExcedido,
      estabilizacao: stabilization,
    };
  }

  buildFinishTransition(
    input: ProcessoLifecycleFinalInput,
  ): ProcessoLifecycleTransition {
    return this.buildFinalTransition({
      statusProcesso: statusprocesso.CONCLUIDO,
      statusTanque: statustanqueprocesso.CONCLUIDO,
      now: input.now,
      tempoExecucao: input.tempo_execucao,
    });
  }

  buildInterruptTransition(
    input: ProcessoLifecycleFinalInput,
  ): ProcessoLifecycleTransition {
    return this.buildFinalTransition({
      statusProcesso: statusprocesso.INTERROMPIDO,
      statusTanque: statustanqueprocesso.INTERROMPIDO,
      now: input.now,
      tempoExecucao: input.tempo_execucao,
      paradaEmergencia: false,
    });
  }

  buildEmergencyStopTransition(
    input: ProcessoLifecycleFinalInput,
  ): ProcessoLifecycleTransition {
    return this.buildFinalTransition({
      statusProcesso: statusprocesso.INTERROMPIDO,
      statusTanque: statustanqueprocesso.INTERROMPIDO,
      now: input.now,
      tempoExecucao: input.tempo_execucao,
      paradaEmergencia: true,
    });
  }

  buildFailureTransition(
    input: ProcessoLifecycleFinalInput,
  ): ProcessoLifecycleTransition {
    return this.buildFinalTransition({
      statusProcesso: statusprocesso.FALHA,
      statusTanque: statustanqueprocesso.FALHA,
      now: input.now,
      tempoExecucao: input.tempo_execucao,
    });
  }

  private buildFinalTransition(input: {
    statusProcesso: statusprocesso;
    statusTanque: statustanqueprocesso;
    now?: Date;
    tempoExecucao?: number | null;
    paradaEmergencia?: boolean;
  }): ProcessoLifecycleTransition {
    const now = this.resolveNow(input.now);
    const processo: ProcessoStatusUpdateData = {
      status_processo: input.statusProcesso,
      finalizado_em: now,
    };

    if (input.tempoExecucao !== undefined) {
      processo.tempo_execucao = input.tempoExecucao;
    }

    if (input.paradaEmergencia !== undefined) {
      processo.parada_emergencia = input.paradaEmergencia;
    }

    return {
      processo,
      tanques: {
        status_tanque_processo: input.statusTanque,
        finalizado_em: now,
        status_encerramento:
          input.statusTanque === statustanqueprocesso.CONCLUIDO
            ? statusencerramentotanque.CONCLUIDO
            : input.statusTanque === statustanqueprocesso.FALHA
              ? statusencerramentotanque.FALHA
              : statusencerramentotanque.BLOQUEADO,
        etapa_encerramento:
          input.statusTanque === statustanqueprocesso.CONCLUIDO
            ? etapaencerramentotanque.CONCLUIDA
            : input.statusTanque === statustanqueprocesso.FALHA
              ? etapaencerramentotanque.FALHA
              : etapaencerramentotanque.NENHUMA,
        encerramento_proxima_tentativa_em: null,
        ...this.buildStagnationReset(),
      },
    };
  }

  private resolveNow(now?: Date): Date {
    return now ?? new Date();
  }

  private buildStagnationReset(): Omit<
    ProcessoTanqueStatusUpdateData,
    'status_tanque_processo'
  > {
    return {
      status_estagnacao: statusestagnacao.NORMAL,
      estagnacao_iniciada_em: null,
      estagnacao_detectada_em: null,
      estagnacao_ultima_avaliacao_em: null,
      estagnacao_variacao_vacuo: null,
      estagnacao_leituras_janela: 0,
      estagnacao_janelas_sem_progresso: 0,
    };
  }

  private isWithinVacuumTarget(
    currentVacuum: number,
    targetVacuum: number,
    tolerancePercent: number,
  ): boolean {
    const targetAbs = Math.abs(targetVacuum);
    const currentAbs = Math.abs(currentVacuum);

    if (targetAbs === 0) {
      return currentAbs <= 0.001;
    }

    const normalizedTolerance = Math.min(100, Math.max(0, tolerancePercent));
    const minimum = targetAbs * (1 - normalizedTolerance / 100);
    const maximum = targetAbs * (1 + normalizedTolerance / 100);

    return currentAbs >= minimum && currentAbs <= maximum;
  }

  private buildStabilizationEvidence(
    input: ProcessoTanqueReadingLifecycleInput,
    now: Date,
  ): ProcessoTanqueStabilizationEvidence {
    const requiredSeconds = Math.max(
      1,
      input.tempo_estabilizacao_segundos ??
        PROCESSO_TANQUE_ESTABILIZACAO_MINIMA_MS / 1000,
    );
    const expectedReadings = Math.max(
      1,
      input.leituras_esperadas ??
        PROCESSO_TANQUE_LEITURAS_MINIMAS_ESTABILIZACAO,
    );
    const observedReadings = Math.max(0, input.leituras_desde_alvo);
    const coverage = Math.min(
      100,
      Math.max(0, (observedReadings / expectedReadings) * 100),
    );
    const requiredCoverage = Math.min(
      100,
      Math.max(1, input.cobertura_minima_percentual ?? 80),
    );
    const maximumGap = Math.max(0, input.maior_intervalo_leitura_ms ?? 0);
    const timeout = Math.max(1, input.timeout_leitura_sensor_ms ?? 2500);
    const elapsedMilliseconds = input.alvo_atingido_em
      ? Math.max(0, now.getTime() - input.alvo_atingido_em.getTime())
      : 0;

    return {
      duracao_necessaria_segundos: requiredSeconds,
      duracao_observada_segundos: Math.floor(elapsedMilliseconds / 1000),
      leituras_esperadas: expectedReadings,
      leituras_observadas: observedReadings,
      cobertura_percentual: Math.round(coverage * 100) / 100,
      cobertura_minima_percentual: requiredCoverage,
      maior_intervalo_leitura_ms: maximumGap,
      timeout_leitura_sensor_ms: timeout,
      continuidade_aprovada: maximumGap <= timeout,
    };
  }

  private exceededSafetyLimit(
    currentVacuum: number,
    safetyLimit: number | undefined,
  ): boolean {
    return (
      safetyLimit !== undefined &&
      Math.abs(currentVacuum) > Math.abs(safetyLimit)
    );
  }

  private canMonitorClosure(status: statusencerramentotanque): boolean {
    return (
      status === statusencerramentotanque.INATIVO ||
      status === statusencerramentotanque.MONITORANDO ||
      status === statusencerramentotanque.AGUARDANDO_ESTABILIZACAO ||
      status === statusencerramentotanque.PRONTO_PARA_ENCERRAR ||
      status === statusencerramentotanque.AGUARDANDO_ACAO_MANUAL
    );
  }
}
