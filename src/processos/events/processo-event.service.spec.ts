import {
  origemevento,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';

import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoEventService } from './processo-event.service';

type ProcessoEventoMock = {
  id_evento_processo: number;
  id_processo: number;
  id_processo_tanque_sensor: number | null;
  tipo_evento: tipoeventoprocesso;
  origem_evento: origemevento;
  severidade_evento: severidadeevento;
  ocorrido_em: Date;
};

type PrismaMock = {
  eventos: {
    create: Mock<(args: unknown) => Promise<ProcessoEventoMock>>;
    findMany: Mock<(args: unknown) => Promise<ProcessoEventoMock[]>>;
  };
};

describe('ProcessoEventService', () => {
  let service: ProcessoEventService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      eventos: {
        create: jest.fn<(args: unknown) => Promise<ProcessoEventoMock>>(),
        findMany: jest.fn<(args: unknown) => Promise<ProcessoEventoMock[]>>(),
      },
    };

    service = new ProcessoEventService(prisma as unknown as PrismaService);
  });

  const eventRecord: ProcessoEventoMock = {
    id_evento_processo: 1,
    id_processo: 10,
    id_processo_tanque_sensor: null,
    tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
    origem_evento: origemevento.USUARIO,
    severidade_evento: severidadeevento.INFO,
    ocorrido_em: new Date('2026-01-01T00:00:00Z'),
  };

  it('create chama prisma.eventos.create', async () => {
    prisma.eventos.create.mockResolvedValue(eventRecord);

    await service.create({
      id_processo: 10,
      tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
      origem_evento: origemevento.USUARIO,
      severidade_evento: severidadeevento.INFO,
    });

    expect(prisma.eventos.create).toHaveBeenCalledWith({
      data: {
        id_processo: 10,
        id_processo_tanque_sensor: null,
        tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
        origem_evento: origemevento.USUARIO,
        severidade_evento: severidadeevento.INFO,
      },
    });
  });

  it('registerProcessStarted monta evento de processo iniciado', async () => {
    const createSpy = jest
      .spyOn(service, 'create')
      .mockResolvedValue(eventRecord);

    await service.registerProcessStarted({
      id_processo: 10,
      id_usuario: 20,
    });

    expect(createSpy).toHaveBeenCalledWith(
      {
        id_processo: 10,
        tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
        origem_evento: origemevento.USUARIO,
        severidade_evento: severidadeevento.INFO,
      },
      undefined,
    );
  });

  it('registerEmergencyStop monta evento de parada de emergencia', async () => {
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({
      ...eventRecord,
      tipo_evento: tipoeventoprocesso.PARADA_EMERGENCIA,
      origem_evento: origemevento.SISTEMA,
      severidade_evento: severidadeevento.CRITICO,
    });

    await service.registerEmergencyStop({
      id_processo: 10,
      motivo: 'Falha critica',
    });

    expect(createSpy).toHaveBeenCalledWith(
      {
        id_processo: 10,
        tipo_evento: tipoeventoprocesso.PARADA_EMERGENCIA,
        origem_evento: origemevento.SISTEMA,
        severidade_evento: severidadeevento.CRITICO,
      },
      undefined,
    );
  });

  it('usa o cliente Prisma transacional quando ele e informado', async () => {
    const transactionCreate = jest
      .fn<(args: unknown) => Promise<ProcessoEventoMock>>()
      .mockResolvedValue(eventRecord);
    const tx = {
      eventos: {
        create: transactionCreate,
      },
    };

    await service.registerProcessStarted(
      { id_processo: 10, id_usuario: 20 },
      tx as never,
    );

    expect(transactionCreate).toHaveBeenCalledTimes(1);
    expect(prisma.eventos.create).not.toHaveBeenCalled();
  });

  it('findByProcessId chama findMany com filtro, ordenacao desc e limite', async () => {
    prisma.eventos.findMany.mockResolvedValue([]);

    await service.findByProcessId(10, 25);

    expect(prisma.eventos.findMany).toHaveBeenCalledWith({
      where: {
        id_processo: 10,
      },
      orderBy: {
        ocorrido_em: 'desc',
      },
      take: 25,
    });
  });
});
