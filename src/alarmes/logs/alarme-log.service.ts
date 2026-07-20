import { Injectable } from '@nestjs/common';
import {
  origemlogoperacional,
  resultadooperacao,
  tipologoperacional,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LogAcknowledgedAlarmeInput,
  LogAlarmeActionInput,
  LogResolvedAlarmeInput,
  OperationalLogResult,
} from './alarme-log.types';

const ALARME_RESOLVIDO = 'ALARME_RESOLVIDO';
const ALARME_RECONHECIDO = 'ALARME_RECONHECIDO';
const MAX_ACTION_LENGTH = 120;

@Injectable()
export class AlarmeLogService {
  constructor(private readonly prisma: PrismaService) {}

  async logAction(input: LogAlarmeActionInput): Promise<OperationalLogResult> {
    const acao = this.normalizeAction(input.acao);
    const descricao = this.joinDescription(
      `Alarme #${input.id_alarme}.`,
      input.descricao,
    );

    return this.createLog({
      id_usuario: input.id_usuario ?? null,
      id_processo: input.id_processo ?? null,
      acao,
      descricao,
      origem: input.id_usuario
        ? origemlogoperacional.USUARIO
        : origemlogoperacional.SISTEMA,
      resultado: input.sucesso
        ? resultadooperacao.SUCESSO
        : resultadooperacao.FALHA,
    });
  }

  async logResolved(
    input: LogResolvedAlarmeInput,
  ): Promise<OperationalLogResult> {
    this.assertValidDate(input.resolvido_em, 'resolvido_em');

    return this.createLog({
      id_usuario: input.id_usuario,
      id_processo: input.id_processo ?? null,
      acao: this.normalizeAction(input.acao ?? ALARME_RESOLVIDO),
      descricao: this.joinDescription(
        `Alarme #${input.id_alarme} resolvido.`,
        `Titulo: ${this.normalizeText(input.titulo)}.`,
        `Severidade: ${this.normalizeText(input.severidade)}.`,
        `Resolvido em: ${input.resolvido_em.toISOString()}.`,
        this.optionalObservation(input.observacao),
      ),
      origem: origemlogoperacional.USUARIO,
      resultado: resultadooperacao.SUCESSO,
    });
  }

  async logAcknowledged(
    input: LogAcknowledgedAlarmeInput,
  ): Promise<OperationalLogResult> {
    this.assertValidDate(input.reconhecido_em, 'reconhecido_em');

    return this.createLog({
      id_usuario: input.id_usuario,
      id_processo: input.id_processo ?? null,
      acao: ALARME_RECONHECIDO,
      descricao: this.joinDescription(
        `Alarme #${input.id_alarme} reconhecido.`,
        `Titulo: ${this.normalizeText(input.titulo)}.`,
        `Reconhecido em: ${input.reconhecido_em.toISOString()}.`,
        this.optionalObservation(input.observacao),
      ),
      origem: origemlogoperacional.USUARIO,
      resultado: resultadooperacao.SUCESSO,
    });
  }

  private async createLog(input: {
    id_usuario: number | null;
    id_processo: number | null;
    acao: string;
    descricao: string;
    origem: origemlogoperacional;
    resultado: resultadooperacao;
  }): Promise<OperationalLogResult> {
    const created = await this.prisma.logsoperacionais.create({
      data: {
        id_usuario: input.id_usuario,
        id_processo: input.id_processo,
        tipo_log: tipologoperacional.ALARME,
        acao: input.acao,
        descricao: input.descricao,
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

  private assertValidDate(value: Date, field: string): void {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new RangeError(`${field} deve ser uma data válida.`);
    }
  }

  private normalizeText(value: string): string {
    return value.trim().replace(/[.\s]+$/u, '');
  }

  private optionalObservation(value?: string | null): string | null {
    const observation = value?.trim().replace(/[.\s]+$/u, '');
    return observation ? `Observacao: ${observation}.` : null;
  }

  private joinDescription(...parts: Array<string | null>): string {
    return parts
      .filter((part): part is string => Boolean(part?.trim()))
      .map((part) => {
        const normalized = part.trim();
        return /[.!?]$/u.test(normalized) ? normalized : `${normalized}.`;
      })
      .join(' ');
  }
}
