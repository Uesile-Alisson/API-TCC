import { Injectable } from '@nestjs/common';
import {
  origemlogoperacional,
  Prisma,
  resultadooperacao,
  tipoeventoprocesso,
  tipologoperacional,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProcessoLogResult,
  RegisterProcessEmergencyInput,
  RegisterProcessFailureInput,
  RegisterProcessLifecycleInput,
  RegisterProcessReasonInput,
  RegisterProcessSystemActionInput,
  RegisterProcessUserActionInput,
} from './processo-log.types';

const MAX_ACTION_LENGTH = 120;

@Injectable()
export class ProcessoLogService {
  constructor(private readonly prisma: PrismaService) {}

  async registerUserAction(
    input: RegisterProcessUserActionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.createLog(
      {
        id_usuario: input.id_usuario,
        id_processo: input.id_processo,
        acao: input.acao,
        descricao: input.descricao,
        origem: origemlogoperacional.USUARIO,
        resultado: input.resultado ?? resultadooperacao.SUCESSO,
      },
      tx,
    );
  }

  async registerSystemAction(
    input: RegisterProcessSystemActionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.createLog(
      {
        id_usuario: null,
        id_processo: input.id_processo,
        acao: input.acao,
        descricao: input.descricao,
        origem: origemlogoperacional.SISTEMA,
        resultado: input.resultado ?? resultadooperacao.SUCESSO,
      },
      tx,
    );
  }

  async registerProcessStarted(
    input: RegisterProcessLifecycleInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.registerLifecycleAction(
      input,
      tipoeventoprocesso.PROCESSO_INICIADO,
      `Processo #${input.id_processo} iniciado.`,
      tx,
    );
  }

  async registerProcessPaused(
    input: RegisterProcessLifecycleInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.registerLifecycleAction(
      input,
      tipoeventoprocesso.PROCESSO_PAUSADO,
      `Processo #${input.id_processo} pausado.`,
      tx,
    );
  }

  async registerProcessResumed(
    input: RegisterProcessLifecycleInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.registerLifecycleAction(
      input,
      tipoeventoprocesso.PROCESSO_RETOMADO,
      `Processo #${input.id_processo} retomado.`,
      tx,
    );
  }

  async registerProcessFinished(
    input: RegisterProcessLifecycleInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.registerLifecycleAction(
      input,
      tipoeventoprocesso.PROCESSO_CONCLUIDO,
      `Processo #${input.id_processo} concluído.`,
      tx,
    );
  }

  async registerProcessInterrupted(
    input: RegisterProcessReasonInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.createLog(
      {
        id_usuario: input.id_usuario,
        id_processo: input.id_processo,
        acao: tipoeventoprocesso.PROCESSO_INTERROMPIDO,
        descricao: this.withReason(
          `Processo #${input.id_processo} interrompido.`,
          input.motivo,
        ),
        origem: origemlogoperacional.USUARIO,
        resultado: resultadooperacao.CANCELADO,
      },
      tx,
    );
  }

  async registerEmergencyStop(
    input: RegisterProcessEmergencyInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.createLog(
      {
        id_usuario: input.id_usuario ?? null,
        id_processo: input.id_processo,
        acao: tipoeventoprocesso.PARADA_EMERGENCIA,
        descricao: this.withReason(
          `Parada de emergência no processo #${input.id_processo}.`,
          input.motivo,
        ),
        origem: input.id_usuario
          ? origemlogoperacional.USUARIO
          : origemlogoperacional.SISTEMA,
        resultado: resultadooperacao.CANCELADO,
      },
      tx,
    );
  }

  async registerProcessFailure(
    input: RegisterProcessFailureInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.createLog(
      {
        id_usuario: null,
        id_processo: input.id_processo,
        acao: tipoeventoprocesso.PROCESSO_FALHA,
        descricao: this.withReason(
          `Falha registrada no processo #${input.id_processo}.`,
          input.motivo,
        ),
        origem: origemlogoperacional.SISTEMA,
        resultado: resultadooperacao.FALHA,
      },
      tx,
    );
  }

  private registerLifecycleAction(
    input: RegisterProcessLifecycleInput,
    acao: tipoeventoprocesso,
    descricao: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    return this.createLog(
      {
        id_usuario: input.id_usuario,
        id_processo: input.id_processo,
        acao,
        descricao,
        origem: origemlogoperacional.USUARIO,
        resultado: resultadooperacao.SUCESSO,
      },
      tx,
    );
  }

  private async createLog(
    input: {
      id_usuario: number | null;
      id_processo: number;
      acao: string;
      descricao: string;
      origem: origemlogoperacional;
      resultado: resultadooperacao;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<ProcessoLogResult> {
    const prisma = tx ?? this.prisma;
    const created = await prisma.logsoperacionais.create({
      data: {
        id_usuario: input.id_usuario,
        id_processo: input.id_processo,
        tipo_log: tipologoperacional.PROCESSO,
        acao: this.normalizeAction(input.acao),
        descricao: this.normalizeSentence(input.descricao),
        origem: input.origem,
        resultado: input.resultado,
      },
      select: {
        id_log_operacional: true,
      },
    });

    return {
      created: true,
      id_log_operacional: created.id_log_operacional,
    };
  }

  private normalizeAction(value: string): string {
    const action = value.trim();

    if (!action || action.length > MAX_ACTION_LENGTH) {
      throw new RangeError(
        `A ação do log deve conter entre 1 e ${MAX_ACTION_LENGTH} caracteres.`,
      );
    }

    return action;
  }

  private withReason(description: string, reason?: string | null): string {
    const normalizedReason = reason?.trim().replace(/[.\s]+$/u, '');
    return normalizedReason
      ? `${this.normalizeSentence(description)} Motivo: ${normalizedReason}.`
      : this.normalizeSentence(description);
  }

  private normalizeSentence(value: string): string {
    const sentence = value.trim();
    return /[.!?]$/u.test(sentence) ? sentence : `${sentence}.`;
  }
}
