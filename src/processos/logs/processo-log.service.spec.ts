import {
  origemlogoperacional,
  resultadooperacao,
  tipologoperacional,
} from '@prisma/client';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Mock } from 'jest-mock';

import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoLogService } from './processo-log.service';

type ProcessoLogMock = {
  id_log_operacional: number;
  id_usuario: number | null;
  id_processo: number | null;
  tipo_log: tipologoperacional;
  acao: string;
  descricao: string | null;
  origem: origemlogoperacional;
  resultado: resultadooperacao;
  criado_em: Date;
};

type PrismaMock = {
  logsoperacionais: {
    create: Mock<(args: unknown) => Promise<ProcessoLogMock>>;
  };
};

describe('ProcessoLogService', () => {
  let service: ProcessoLogService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      logsoperacionais: {
        create: jest.fn<(args: unknown) => Promise<ProcessoLogMock>>(),
      },
    };

    service = new ProcessoLogService(prisma as unknown as PrismaService);
  });

  const logRecord: ProcessoLogMock = {
    id_log_operacional: 1,
    id_usuario: 20,
    id_processo: 10,
    tipo_log: tipologoperacional.PROCESSO,
    acao: 'PROCESSO_INICIADO',
    descricao: 'Usuário iniciou processo.',
    origem: origemlogoperacional.USUARIO,
    resultado: resultadooperacao.SUCESSO,
    criado_em: new Date('2026-01-01T00:00:00Z'),
  };

  it('create chama prisma.logsoperacionais.create', async () => {
    prisma.logsoperacionais.create.mockResolvedValue(logRecord);

    await service.create({
      id_usuario: 20,
      id_processo: 10,
      tipo_log: tipologoperacional.PROCESSO,
      origem: origemlogoperacional.USUARIO,
      resultado: resultadooperacao.SUCESSO,
      acao: 'PROCESSO_INICIADO',
      descricao: 'Usuário iniciou processo.',
    });

    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: {
        id_usuario: 20,
        id_processo: 10,
        tipo_log: tipologoperacional.PROCESSO,
        origem: origemlogoperacional.USUARIO,
        resultado: resultadooperacao.SUCESSO,
        acao: 'PROCESSO_INICIADO',
        descricao: 'Usuário iniciou processo.',
      },
    });
  });

  it('registerUserAction usa origem de usuario', async () => {
    const createSpy = jest
      .spyOn(service, 'create')
      .mockResolvedValue(logRecord);

    await service.registerUserAction({
      id_usuario: 20,
      id_processo: 10,
      acao: 'PROCESSO_INICIADO',
      descricao: 'Usuário iniciou processo.',
    });

    expect(createSpy).toHaveBeenCalledWith({
      id_usuario: 20,
      id_processo: 10,
      tipo_log: tipologoperacional.PROCESSO,
      origem: origemlogoperacional.USUARIO,
      resultado: resultadooperacao.SUCESSO,
      acao: 'PROCESSO_INICIADO',
      descricao: 'Usuário iniciou processo.',
    });
  });

  it('registerSystemAction usa origem de sistema', async () => {
    const createSpy = jest.spyOn(service, 'create').mockResolvedValue({
      ...logRecord,
      id_usuario: null,
      origem: origemlogoperacional.SISTEMA,
      resultado: resultadooperacao.FALHA,
      acao: 'PROCESSO_FALHA',
      descricao: 'Sistema detectou falha.',
    });

    await service.registerSystemAction({
      id_processo: 10,
      acao: 'PROCESSO_FALHA',
      descricao: 'Sistema detectou falha.',
      resultado: resultadooperacao.FALHA,
    });

    expect(createSpy).toHaveBeenCalledWith({
      id_usuario: null,
      id_processo: 10,
      tipo_log: tipologoperacional.PROCESSO,
      origem: origemlogoperacional.SISTEMA,
      resultado: resultadooperacao.FALHA,
      acao: 'PROCESSO_FALHA',
      descricao: 'Sistema detectou falha.',
    });
  });

  it('registerEmergencyStop registra acao de parada de emergencia', async () => {
    const systemActionSpy = jest
      .spyOn(service, 'registerSystemAction')
      .mockResolvedValue({
        ...logRecord,
        id_usuario: null,
        origem: origemlogoperacional.SISTEMA,
        acao: 'PARADA_EMERGENCIA',
        descricao:
          'Sistema executou parada de emergência. Motivo: Falha critica',
      });

    await service.registerEmergencyStop({
      id_processo: 10,
      motivo: 'Falha critica',
    });

    expect(systemActionSpy).toHaveBeenCalledWith({
      id_processo: 10,
      acao: 'PARADA_EMERGENCIA',
      descricao: 'Sistema executou parada de emergência. Motivo: Falha critica',
    });
  });
});
