import { Injectable } from '@nestjs/common';
import { statusprocesso, statustanqueprocesso } from '@prisma/client';

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
        status_tanque_processo: statustanqueprocesso.EM_EXECUCAO,
        iniciado_em: now,
        finalizado_em: null,
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
      tanques: {
        status_tanque_processo: statustanqueprocesso.EM_EXECUCAO,
      },
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
      },
    };
  }

  private resolveNow(now?: Date): Date {
    return now ?? new Date();
  }
}
