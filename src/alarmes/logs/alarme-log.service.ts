import { Injectable } from '@nestjs/common';
import {
  origemlogoperacional,
  resultadooperacao,
  tipologoperacional,
} from '@prisma/client';
import { ALARME_MESSAGES } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AlarmeLogResult,
  LogAcknowledgedAlarmeInput,
  LogAlarmActionInput,
  LogResolvedAlarmeInput,
} from './alarme-log.types';

@Injectable()
export class AlarmeLogService {
  constructor(private readonly prisma: PrismaService) {}

  async logResolved(input: LogResolvedAlarmeInput): Promise<AlarmeLogResult> {
    const log = await this.prisma.logsoperacionais.create({
      data: {
        id_usuario: input.id_usuario,
        id_processo: input.id_processo ?? null,
        tipo_log: tipologoperacional.ALARME,
        acao: input.acao ?? 'ALARME_RESOLVIDO',
        descricao: this.buildResolvedDescription(input),
        origem: origemlogoperacional.USUARIO,
        resultado: resultadooperacao.SUCESSO,
      },
      select: {
        id_log_operacional: true,
      },
    });

    return {
      created: true,
      id_log_operacional: log.id_log_operacional,
    };
  }

  async logAcknowledged(
    input: LogAcknowledgedAlarmeInput,
  ): Promise<AlarmeLogResult> {
    return this.logAction({
      id_alarme: input.id_alarme,
      id_usuario: input.id_usuario,
      id_processo: input.id_processo,
      acao: 'ALARME_RECONHECIDO',
      descricao: this.buildAcknowledgedDescription(input),
      sucesso: true,
    });
  }

  async logAction(input: LogAlarmActionInput): Promise<AlarmeLogResult> {
    const log = await this.prisma.logsoperacionais.create({
      data: {
        id_usuario: input.id_usuario ?? null,
        id_processo: input.id_processo ?? null,
        tipo_log: tipologoperacional.ALARME,
        acao: input.acao,
        descricao: input.descricao,
        origem: origemlogoperacional.USUARIO,
        resultado:
          input.sucesso === false
            ? resultadooperacao.FALHA
            : resultadooperacao.SUCESSO,
      },
      select: {
        id_log_operacional: true,
      },
    });

    return {
      created: true,
      id_log_operacional: log.id_log_operacional,
    };
  }

  private buildResolvedDescription(input: LogResolvedAlarmeInput): string {
    const descriptionParts = [
      `Alarme #${input.id_alarme} resolvido.`,
      `Titulo: ${input.titulo}.`,
      `Severidade: ${input.severidade}.`,
      `Resolvido em: ${input.resolvido_em.toISOString()}.`,
    ];
    const observacao = input.observacao?.trim();

    if (observacao) {
      descriptionParts.push(`Observacao: ${observacao}.`);
    }

    return `${ALARME_MESSAGES.RESOLVE_LOG_DESCRIPTION} ${descriptionParts.join(
      ' ',
    )}`;
  }

  private buildAcknowledgedDescription(
    input: LogAcknowledgedAlarmeInput,
  ): string {
    const descriptionParts = [
      `Alarme #${input.id_alarme} reconhecido.`,
      `Titulo: ${input.titulo}.`,
      `Reconhecido em: ${input.reconhecido_em.toISOString()}.`,
    ];
    const observacao = input.observacao?.trim();

    if (observacao) {
      descriptionParts.push(`Observacao: ${observacao}.`);
    }

    return descriptionParts.join(' ');
  }
}
