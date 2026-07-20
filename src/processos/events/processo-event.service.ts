import { Injectable } from '@nestjs/common';
import {
  origemevento,
  Prisma,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProcessoEventInput } from './processo-event.types';

@Injectable()
export class ProcessoEventService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProcessoEventInput, tx?: Prisma.TransactionClient) {
    const prisma = tx ?? this.prisma;

    return prisma.eventos.create({
      data: {
        id_processo: input.id_processo,
        id_processo_tanque_sensor: input.id_processo_tanque_sensor ?? null,
        tipo_evento: input.tipo_evento,
        origem_evento: input.origem_evento ?? origemevento.BACKEND,
        severidade_evento: input.severidade_evento ?? severidadeevento.INFO,
      },
    });
  }

  async registerProcessCreated(
    input: {
      id_processo: number;
      id_usuario: number;
      nome_processo?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.create(
      {
        id_processo: input.id_processo,
        tipo_evento: tipoeventoprocesso.PROCESSO_CRIADO,
        origem_evento: origemevento.USUARIO,
        severidade_evento: severidadeevento.INFO,
      },
      tx,
    );
  }

  async registerProcessStarted(
    input: {
      id_processo: number;
      id_usuario: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.create(
      {
        id_processo: input.id_processo,
        tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
        origem_evento: origemevento.USUARIO,
        severidade_evento: severidadeevento.INFO,
      },
      tx,
    );
  }

  async registerProcessPaused(
    input: {
      id_processo: number;
      id_usuario: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.create(
      {
        id_processo: input.id_processo,
        tipo_evento: tipoeventoprocesso.PROCESSO_PAUSADO,
        origem_evento: origemevento.USUARIO,
        severidade_evento: severidadeevento.INFO,
      },
      tx,
    );
  }

  async registerProcessResumed(
    input: {
      id_processo: number;
      id_usuario: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.create(
      {
        id_processo: input.id_processo,
        tipo_evento: tipoeventoprocesso.PROCESSO_RETOMADO,
        origem_evento: origemevento.USUARIO,
        severidade_evento: severidadeevento.INFO,
      },
      tx,
    );
  }

  async registerProcessFinished(
    input: {
      id_processo: number;
      id_usuario: number;
      tempo_execucao?: number | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.create(
      {
        id_processo: input.id_processo,
        tipo_evento: tipoeventoprocesso.PROCESSO_CONCLUIDO,
        origem_evento: origemevento.USUARIO,
        severidade_evento: severidadeevento.INFO,
      },
      tx,
    );
  }

  async registerProcessInterrupted(
    input: {
      id_processo: number;
      id_usuario: number;
      motivo?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.create(
      {
        id_processo: input.id_processo,
        tipo_evento: tipoeventoprocesso.PROCESSO_INTERROMPIDO,
        origem_evento: origemevento.USUARIO,
        severidade_evento: severidadeevento.AVISO,
      },
      tx,
    );
  }

  async registerEmergencyStop(
    input: {
      id_processo: number;
      id_usuario?: number | null;
      motivo?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.create(
      {
        id_processo: input.id_processo,
        tipo_evento: tipoeventoprocesso.PARADA_EMERGENCIA,
        origem_evento: input.id_usuario
          ? origemevento.USUARIO
          : origemevento.SISTEMA,
        severidade_evento: severidadeevento.CRITICO,
      },
      tx,
    );
  }

  async registerProcessFailure(
    input: {
      id_processo: number;
      motivo?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.create(
      {
        id_processo: input.id_processo,
        tipo_evento: tipoeventoprocesso.PROCESSO_FALHA,
        origem_evento: origemevento.SISTEMA,
        severidade_evento: severidadeevento.CRITICO,
      },
      tx,
    );
  }

  async findByProcessId(
    id_processo: number,
    limit?: number,
    tx?: Prisma.TransactionClient,
  ) {
    const prisma = tx ?? this.prisma;

    return prisma.eventos.findMany({
      where: {
        id_processo,
      },
      orderBy: {
        ocorrido_em: 'desc',
      },
      take: limit ?? 50,
    });
  }
}
