import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  origemlogoperacional,
  resultadooperacao,
  tipoeventoprocesso,
  tipologoperacional,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoLogService } from './processo-log.service';

type CreateLogResult = { id_log_operacional: number };
type CreateMock = Mock<(...args: unknown[]) => Promise<CreateLogResult>>;
type PrismaMock = { logsoperacionais: { create: CreateMock } };
type CreateArgs = {
  data: Record<string, unknown>;
  select: Record<string, boolean>;
};

describe('ProcessoLogService', () => {
  let service: ProcessoLogService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      logsoperacionais: {
        create: jest
          .fn<(...args: unknown[]) => Promise<CreateLogResult>>()
          .mockResolvedValue({ id_log_operacional: 42 }),
      },
    };
    service = new ProcessoLogService(prisma as unknown as PrismaService);
  });

  it('registerUserAction preserva ação e descrição e usa sucesso por padrão', async () => {
    await expect(
      service.registerUserAction({
        id_usuario: 7,
        id_processo: 10,
        acao: 'PROCESSO_CONFIG_ATUALIZADO',
        descricao: 'Configuração atualizada',
      }),
    ).resolves.toEqual({ created: true, id_log_operacional: 42 });

    expect(getData()).toEqual({
      id_usuario: 7,
      id_processo: 10,
      tipo_log: tipologoperacional.PROCESSO,
      acao: 'PROCESSO_CONFIG_ATUALIZADO',
      descricao: 'Configuração atualizada.',
      origem: origemlogoperacional.USUARIO,
      resultado: resultadooperacao.SUCESSO,
    });
    expect(getArgs().select).toEqual({ id_log_operacional: true });
  });

  it('registerUserAction preserva resultado explícito', async () => {
    await service.registerUserAction({
      id_usuario: 7,
      id_processo: 10,
      acao: 'PRECHECAGEM_OPERACIONAL_EXECUTADA',
      descricao: 'Pre-checagem reprovada.',
      resultado: resultadooperacao.FALHA,
    });

    expect(getData().resultado).toBe(resultadooperacao.FALHA);
  });

  it('registerSystemAction audita decisao automatica sem usuario', async () => {
    await service.registerSystemAction({
      id_processo: 10,
      acao: 'AUXILIAR_FILA_ATUALIZADA',
      descricao: 'Fila automatica atualizada',
    });

    expect(getData()).toMatchObject({
      id_usuario: null,
      origem: origemlogoperacional.SISTEMA,
      resultado: resultadooperacao.SUCESSO,
      acao: 'AUXILIAR_FILA_ATUALIZADA',
    });
  });

  it('registerProcessStarted registra início pelo usuário', async () => {
    await service.registerProcessStarted({ id_processo: 10, id_usuario: 7 });
    expectLifecycle(tipoeventoprocesso.PROCESSO_INICIADO, 'iniciado');
  });

  it('registerProcessPaused registra pausa pelo usuário', async () => {
    await service.registerProcessPaused({ id_processo: 10, id_usuario: 7 });
    expectLifecycle(tipoeventoprocesso.PROCESSO_PAUSADO, 'pausado');
  });

  it('registerProcessResumed registra retomada pelo usuário', async () => {
    await service.registerProcessResumed({ id_processo: 10, id_usuario: 7 });
    expectLifecycle(tipoeventoprocesso.PROCESSO_RETOMADO, 'retomado');
  });

  it('registerProcessFinished registra conclusão pelo usuário', async () => {
    await service.registerProcessFinished({ id_processo: 10, id_usuario: 7 });
    expectLifecycle(tipoeventoprocesso.PROCESSO_CONCLUIDO, 'concluído');
  });

  it('registerProcessInterrupted registra cancelamento e motivo normalizado', async () => {
    await service.registerProcessInterrupted({
      id_processo: 10,
      id_usuario: 7,
      motivo: ' Intervenção manual. ',
    });

    expect(getData()).toMatchObject({
      acao: tipoeventoprocesso.PROCESSO_INTERROMPIDO,
      origem: origemlogoperacional.USUARIO,
      resultado: resultadooperacao.CANCELADO,
      descricao: 'Processo #10 interrompido. Motivo: Intervenção manual.',
    });
  });

  it('registerEmergencyStop usa origem do usuário quando informado', async () => {
    await service.registerEmergencyStop({
      id_processo: 10,
      id_usuario: 7,
      motivo: 'Risco operacional',
    });

    expect(getData()).toMatchObject({
      id_usuario: 7,
      acao: tipoeventoprocesso.PARADA_EMERGENCIA,
      origem: origemlogoperacional.USUARIO,
      resultado: resultadooperacao.CANCELADO,
    });
  });

  it('registerEmergencyStop sem usuário usa origem do sistema', async () => {
    await service.registerEmergencyStop({ id_processo: 10, motivo: 'Sensor' });
    expect(getData()).toMatchObject({
      id_usuario: null,
      origem: origemlogoperacional.SISTEMA,
    });
  });

  it('registerProcessFailure registra falha do sistema sem exigir usuário', async () => {
    await service.registerProcessFailure({
      id_processo: 10,
      motivo: ' Falha no sensor. ',
    });

    expect(getData()).toMatchObject({
      id_usuario: null,
      acao: tipoeventoprocesso.PROCESSO_FALHA,
      origem: origemlogoperacional.SISTEMA,
      resultado: resultadooperacao.FALHA,
      descricao: 'Falha registrada no processo #10. Motivo: Falha no sensor.',
    });
  });

  it('usa o cliente Prisma transacional quando ele e informado', async () => {
    const transactionCreate = jest
      .fn<(...args: unknown[]) => Promise<CreateLogResult>>()
      .mockResolvedValue({ id_log_operacional: 84 });
    const tx = {
      logsoperacionais: {
        create: transactionCreate,
      },
    };

    await expect(
      service.registerUserAction(
        {
          id_usuario: 7,
          id_processo: 10,
          acao: 'PROCESSO_CONFIG_ATUALIZADO',
          descricao: 'Configuracao atualizada',
        },
        tx as never,
      ),
    ).resolves.toEqual({ created: true, id_log_operacional: 84 });

    expect(transactionCreate).toHaveBeenCalledTimes(1);
    expect(prisma.logsoperacionais.create).not.toHaveBeenCalled();
  });

  it('ignora motivo vazio e não duplica pontuação', async () => {
    await service.registerProcessInterrupted({
      id_processo: 10,
      id_usuario: 7,
      motivo: '   ',
    });
    expect(getData().descricao).toBe('Processo #10 interrompido.');
  });

  it('rejeita ação acima do limite do banco', async () => {
    await expect(
      service.registerUserAction({
        id_usuario: 7,
        id_processo: 10,
        acao: 'A'.repeat(121),
        descricao: 'Inválida',
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(prisma.logsoperacionais.create).not.toHaveBeenCalled();
  });

  it('propaga falha do Prisma', async () => {
    const databaseError = new Error('foreign key violation');
    prisma.logsoperacionais.create.mockRejectedValueOnce(databaseError);

    await expect(
      service.registerProcessStarted({ id_processo: 999, id_usuario: 7 }),
    ).rejects.toBe(databaseError);
  });

  function getArgs(): CreateArgs {
    return prisma.logsoperacionais.create.mock.calls[0][0] as CreateArgs;
  }

  function getData(): Record<string, unknown> {
    return getArgs().data;
  }

  function expectLifecycle(acao: tipoeventoprocesso, verb: string): void {
    expect(getData()).toMatchObject({
      id_usuario: 7,
      id_processo: 10,
      tipo_log: tipologoperacional.PROCESSO,
      acao,
      origem: origemlogoperacional.USUARIO,
      resultado: resultadooperacao.SUCESSO,
    });
    expect(String(getData().descricao)).toContain(verb);
  }
});
