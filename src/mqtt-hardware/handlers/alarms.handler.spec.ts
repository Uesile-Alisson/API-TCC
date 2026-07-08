import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  origemalarme,
  origemlogoperacional,
  resultadooperacao,
  severidadealarme,
  statusalarme,
  tipoalarme,
  tipologoperacional,
} from '@prisma/client';
import type { Mock } from 'jest-mock';
import { PrismaService } from '../../prisma/prisma.service';
import type { MqttMessage } from '../interfaces/mqtt-message.interface';
import { AlarmsHandler } from './alarms.handler';

type AsyncMock<T = unknown> = Mock<(...args: unknown[]) => Promise<T>>;

type PrismaMock = {
  alarmes: {
    create: AsyncMock;
  };
  logsoperacionais: {
    create: AsyncMock;
  };
  processos: {
    count: AsyncMock<number>;
  };
  processostanques: {
    count: AsyncMock<number>;
  };
  processostanquessensores: {
    count: AsyncMock<number>;
  };
};

const asyncMock = <T = unknown>(): AsyncMock<T> =>
  jest.fn<(...args: unknown[]) => Promise<T>>();

describe('AlarmsHandler', () => {
  let handler: AlarmsHandler;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      alarmes: {
        create: asyncMock(),
      },
      logsoperacionais: {
        create: asyncMock(),
      },
      processos: {
        count: asyncMock<number>(),
      },
      processostanques: {
        count: asyncMock<number>(),
      },
      processostanquessensores: {
        count: asyncMock<number>(),
      },
    };

    prisma.processos.count.mockResolvedValue(1);
    prisma.processostanques.count.mockResolvedValue(0);
    prisma.processostanquessensores.count.mockResolvedValue(0);
    prisma.logsoperacionais.create.mockResolvedValue({});

    handler = new AlarmsHandler(prisma as unknown as PrismaService);
  });

  it('registra INFO como log operacional sem criar alarme', async () => {
    const result = await handler.handle(
      makeMessage({
        severidade: severidadealarme.INFO,
        titulo: 'ESP32 sincronizado',
      }),
    );

    expect(result).toBeNull();
    expect(prisma.alarmes.create).not.toHaveBeenCalled();
    expect(prisma.logsoperacionais.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id_processo: 10,
        tipo_log: tipologoperacional.ALARME,
        acao: 'ALARME_INFO_MQTT_RECEBIDO',
        origem: origemlogoperacional.MQTT,
        resultado: resultadooperacao.SUCESSO,
      }),
    });
  });

  it('mantem MEDIO como alarme operacional ativo', async () => {
    prisma.alarmes.create.mockResolvedValue(makeAlarmRecord());

    const result = await handler.handle(
      makeMessage({
        severidade: severidadealarme.MEDIO,
        titulo: 'Vacuo fora da faixa',
      }),
    );

    expect(prisma.logsoperacionais.create).not.toHaveBeenCalled();
    expect(prisma.alarmes.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id_processo: 10,
        severidade: severidadealarme.MEDIO,
        status_alarme: statusalarme.ATIVO,
      }),
    });
    expect(result).toMatchObject({
      id_alarme: 99,
      severidade: severidadealarme.MEDIO,
      status_alarme: statusalarme.ATIVO,
    });
  });
});

function makeMessage(
  overrides: Partial<Record<string, unknown>> = {},
): MqttMessage {
  return {
    topic: 'tsea/alarmes',
    payload: {
      id_processo: 10,
      tipo_alarme: tipoalarme.PROCESSO,
      origem_alarme: origemalarme.ESP32,
      severidade: severidadealarme.MEDIO,
      titulo: 'Alarme de teste',
      descricao: 'Payload de teste.',
      valor_detectado: 1,
      unidade: 'flag',
      ocorrido_em: '2026-07-08T12:00:00.000Z',
      ...overrides,
    },
    qos: 0,
    retain: false,
    receivedAt: new Date('2026-07-08T12:00:00Z'),
  };
}

function makeAlarmRecord() {
  return {
    id_alarme: 99,
    id_mqtt_mensagem: null,
    id_usuario_responsavel: null,
    titulo: 'Vacuo fora da faixa',
    descricao: 'Payload de teste.',
    tipo_alarme: tipoalarme.PROCESSO,
    severidade: severidadealarme.MEDIO,
    status_alarme: statusalarme.ATIVO,
    origem_alarme: origemalarme.ESP32,
    valor_detectado: { toNumber: () => 1 },
    unidade: 'flag',
    ocorrido_em: new Date('2026-07-08T12:00:00Z'),
    normalizado_em: null,
    resolvido_em: null,
    motivo_resolucao: null,
    tentativas_recuperacao: 0,
    ultima_tentativa_recuperacao_em: null,
    ultima_validacao_em: null,
    bloqueante: false,
    requer_intervencao: false,
    recuperacao_automatica: false,
    excluido_em: null,
    id_processo: 10,
    id_processo_tanque: null,
    id_processo_tanque_sensor: null,
  };
}
