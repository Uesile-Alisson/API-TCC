import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  origemlogoperacional,
  resultadooperacao,
  tipologoperacional,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import { AlarmeLogService } from '../logs';
import { LogResolvedAlarmeInput } from '../logs/alarme-log.types';

type CreateLogResult = {
  id_log_operacional: number;
};

type CreateMock = Mock<(...args: unknown[]) => Promise<CreateLogResult>>;

type PrismaMock = {
  logsoperacionais: {
    create: CreateMock;
  };
};

type CreateArgs = {
  data: Record<string, unknown>;
  select: Record<string, boolean>;
};

describe('AlarmeLogService', () => {
  let service: AlarmeLogService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      logsoperacionais: {
        create: jest
          .fn<(...args: unknown[]) => Promise<CreateLogResult>>()
          .mockResolvedValue({ id_log_operacional: 99 }),
      },
    };

    service = new AlarmeLogService(prisma as unknown as PrismaService);
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('logResolved cria log operacional de alarme resolvido', async () => {
    await expect(
      service.logResolved(makeInput({ id_processo: 20 })),
    ).resolves.toEqual({
      created: true,
      id_log_operacional: 99,
    });

    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id_usuario: 7,
        id_processo: 20,
        tipo_log: tipologoperacional.ALARME,
        origem: origemlogoperacional.USUARIO,
        resultado: resultadooperacao.SUCESSO,
        acao: 'ALARME_RESOLVIDO',
      }),
      select: {
        id_log_operacional: true,
      },
    });
  });

  it('logResolved usa id_processo null quando nao recebido', async () => {
    await service.logResolved(makeInput({ id_processo: undefined }));

    expect(getCreateData()).toMatchObject({
      id_processo: null,
    });
  });

  it('logResolved com observacao inclui texto trimado na descricao', async () => {
    await service.logResolved(
      makeInput({ observacao: ' Verificado em campo ' }),
    );

    expect(getDescription()).toContain('Observacao: Verificado em campo.');
  });

  it('logResolved sem observacao nao inclui marcador de observacao', async () => {
    await service.logResolved(makeInput({ observacao: '   ' }));

    expect(getDescription()).not.toContain('Observacao:');
  });

  it('logResolved inclui id, titulo, severidade e resolvido_em em ISO', async () => {
    const resolvidoEm = new Date('2026-06-21T10:00:00Z');

    await service.logResolved(makeInput({ resolvido_em: resolvidoEm }));

    const description = getDescription();
    expect(description).toContain('Alarme #10 resolvido.');
    expect(description).toContain('Titulo: Falha de pressao.');
    expect(description).toContain('Severidade: CRITICO.');
    expect(description).toContain(
      `Resolvido em: ${resolvidoEm.toISOString()}.`,
    );
  });

  function getCreateArgs(): CreateArgs {
    return prisma.logsoperacionais.create.mock.calls[0][0] as CreateArgs;
  }

  function getCreateData(): Record<string, unknown> {
    return getCreateArgs().data;
  }

  function getDescription(): string {
    return String(getCreateData().descricao);
  }
});

function makeInput(
  overrides: Partial<LogResolvedAlarmeInput> = {},
): LogResolvedAlarmeInput {
  return {
    id_alarme: 10,
    id_usuario: 7,
    id_processo: 20,
    titulo: 'Falha de pressao',
    severidade: 'CRITICO',
    observacao: null,
    resolvido_em: new Date('2026-06-21T10:00:00Z'),
    ...overrides,
  };
}
