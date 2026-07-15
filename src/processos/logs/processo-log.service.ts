import { Injectable } from '@nestjs/common';
import {
  origemlogoperacional,
  resultadooperacao,
  tipologoperacional,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProcessoLogInput } from './processo-log.types';

@Injectable()
export class ProcessoLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProcessoLogInput) {
    return this.prisma.logsoperacionais.create({
      data: {
        id_usuario: input.id_usuario ?? null,
        id_processo: input.id_processo ?? null,
        tipo_log: input.tipo_log,
        acao: input.acao,
        descricao: input.descricao,
        origem: input.origem,
        resultado: input.resultado,
      },
    });
  }

  async registerUserAction(input: {
    id_usuario: number;
    id_processo?: number | null;
    acao: string;
    descricao: string;
    resultado?: resultadooperacao;
    dados_log?: Record<string, unknown> | null;
  }) {
    return this.create({
      id_usuario: input.id_usuario,
      id_processo: input.id_processo ?? null,
      tipo_log: tipologoperacional.PROCESSO,
      origem: origemlogoperacional.USUARIO,
      resultado: input.resultado ?? resultadooperacao.SUCESSO,
      acao: input.acao,
      descricao: input.descricao,
    });
  }

  async registerSystemAction(input: {
    id_processo?: number | null;
    acao: string;
    descricao: string;
    resultado?: resultadooperacao;
    dados_log?: Record<string, unknown> | null;
  }) {
    return this.create({
      id_usuario: null,
      id_processo: input.id_processo ?? null,
      tipo_log: tipologoperacional.PROCESSO,
      origem: origemlogoperacional.SISTEMA,
      resultado: input.resultado ?? resultadooperacao.SUCESSO,
      acao: input.acao,
      descricao: input.descricao,
    });
  }

  async registerProcessStarted(input: {
    id_usuario: number;
    id_processo: number;
  }) {
    return this.registerUserAction({
      id_usuario: input.id_usuario,
      id_processo: input.id_processo,
      acao: 'PROCESSO_INICIADO',
      descricao: 'Usuário iniciou processo.',
    });
  }

  async registerProcessPaused(input: {
    id_usuario: number;
    id_processo: number;
  }) {
    return this.registerUserAction({
      id_usuario: input.id_usuario,
      id_processo: input.id_processo,
      acao: 'PROCESSO_PAUSADO',
      descricao: 'Usuário pausou processo.',
    });
  }

  async registerProcessResumed(input: {
    id_usuario: number;
    id_processo: number;
  }) {
    return this.registerUserAction({
      id_usuario: input.id_usuario,
      id_processo: input.id_processo,
      acao: 'PROCESSO_RETOMADO',
      descricao: 'Usuário retomou processo.',
    });
  }

  async registerProcessFinished(input: {
    id_usuario: number;
    id_processo: number;
  }) {
    return this.registerUserAction({
      id_usuario: input.id_usuario,
      id_processo: input.id_processo,
      acao: 'PROCESSO_FINALIZADO',
      descricao: 'Usuário finalizou processo.',
    });
  }

  async registerProcessInterrupted(input: {
    id_usuario: number;
    id_processo: number;
    motivo?: string | null;
  }) {
    return this.registerUserAction({
      id_usuario: input.id_usuario,
      id_processo: input.id_processo,
      acao: 'PROCESSO_INTERROMPIDO',
      descricao: input.motivo
        ? `Usuário interrompeu processo. Motivo: ${input.motivo}`
        : 'Usuário interrompeu processo.',
    });
  }

  async registerEmergencyStop(input: {
    id_usuario?: number | null;
    id_processo: number;
    motivo?: string | null;
  }) {
    const descricao = input.motivo
      ? `Sistema executou parada de emergência. Motivo: ${input.motivo}`
      : 'Sistema executou parada de emergência.';

    if (input.id_usuario) {
      return this.registerUserAction({
        id_usuario: input.id_usuario,
        id_processo: input.id_processo,
        acao: 'PARADA_EMERGENCIA',
        descricao,
      });
    }

    return this.registerSystemAction({
      id_processo: input.id_processo,
      acao: 'PARADA_EMERGENCIA',
      descricao,
    });
  }

  async registerProcessFailure(input: {
    id_processo: number;
    motivo?: string | null;
  }) {
    return this.registerSystemAction({
      id_processo: input.id_processo,
      acao: 'PROCESSO_FALHA',
      descricao: input.motivo
        ? `Sistema detectou falha. Motivo: ${input.motivo}`
        : 'Sistema detectou falha.',
      resultado: resultadooperacao.FALHA,
    });
  }
}
