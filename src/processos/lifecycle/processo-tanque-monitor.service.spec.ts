import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  Prisma,
  statusencerramentotanque,
  statusestagnacao,
  statusprocesso,
  statustanqueprocesso,
  tipoeventoprocesso,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoLifecycleService } from './processo-lifecycle.service';
import { ProcessoTanqueMonitorService } from './processo-tanque-monitor.service';
import { ProcessoTanqueStagnationService } from './processo-tanque-stagnation.service';

describe('ProcessoTanqueMonitorService', () => {
  const transaction = jest.fn();
  const tx = {
    processostanquessensores: {
      findUnique: jest.fn(),
    },
    configuracoessistema: {
      findFirst: jest.fn(),
    },
    leiturasensores: {
      aggregate: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    eventos: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    processostanques: {
      updateMany: jest.fn(),
    },
    alarmes: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: ProcessoTanqueMonitorService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    service = new ProcessoTanqueMonitorService(
      { $transaction: transaction } as unknown as PrismaService,
      new ProcessoLifecycleService(),
      new ProcessoTanqueStagnationService(),
    );
    tx.alarmes.findFirst.mockResolvedValue(null);
    tx.leiturasensores.findMany.mockResolvedValue([]);
  });

  it('atualiza somente o tanque da leitura e registra VACUO_ALVO_ATINGIDO', async () => {
    tx.processostanquessensores.findUnique.mockResolvedValue(
      makeContext(statustanqueprocesso.GERANDO_VACUO),
    );
    tx.configuracoessistema.findFirst.mockResolvedValue({
      tolerancia_vacuo_percentual: decimal(10),
      estagnacao_janela_segundos: 60,
      estagnacao_variacao_minima: decimal(2),
      estagnacao_leituras_minimas: 5,
      estagnacao_janelas_consecutivas: 2,
    });
    tx.leiturasensores.aggregate.mockResolvedValue({
      _avg: { valor_vacuo: decimal(-40) },
      _count: { _all: 2 },
    });
    tx.leiturasensores.findFirst
      .mockResolvedValueOnce(makeReading(-5, '2026-07-16T12:00:00.000Z'))
      .mockResolvedValueOnce(makeReading(-76, '2026-07-16T12:00:40.000Z'));
    tx.eventos.findFirst.mockResolvedValue(null);
    tx.processostanques.updateMany.mockResolvedValue({ count: 1 });
    tx.eventos.create.mockResolvedValue({ id_evento_processo: 90 });

    const result = await service.monitorReading({
      id_leitura_sensor: 50,
      id_processo: 10,
      id_processo_tanque: 20,
      id_processo_tanque_sensor: 30,
    });

    expect(result).toMatchObject({
      processed: true,
      id_processo_tanque: 20,
      status_anterior: statustanqueprocesso.GERANDO_VACUO,
      status_atual: statustanqueprocesso.VACUO_ATINGIDO,
      vacuo_inicial: -5,
      vacuo_final: -76,
      vacuo_medio: -40,
      tank_state: expect.objectContaining({
        id_processo_tanque: 20,
        id_tanque: 1,
        nome_tanque: 'Tanque 1',
        vacuo_atingido: true,
        total_sensores: 1,
        total_leituras: 2,
      }),
      latest_reading: expect.objectContaining({
        id_leitura_sensor: 50,
        id_processo_tanque_sensor: 30,
        id_sensor: 3,
        valor_vacuo: -76,
      }),
    });
    expect(tx.processostanques.updateMany).toHaveBeenCalledWith({
      where: {
        id_processo_tanque: 20,
        status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
        status_estagnacao: statusestagnacao.NORMAL,
        encerramento_versao: 0,
        processos: { status_processo: statusprocesso.EM_EXECUCAO },
      },
      data: expect.objectContaining({
        status_tanque_processo: statustanqueprocesso.VACUO_ATINGIDO,
        vacuo_atingido: true,
        vacuo_estabilizado: false,
      }),
    });
    expect(tx.eventos.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id_processo: 10,
        id_processo_tanque_sensor: 30,
        tipo_evento: tipoeventoprocesso.VACUO_ALVO_ATINGIDO,
      }),
    });
  });

  it('ignora leitura quando o processo não está em execução', async () => {
    tx.processostanquessensores.findUnique.mockResolvedValue(
      makeContext(statustanqueprocesso.GERANDO_VACUO, statusprocesso.PAUSADO),
    );

    const result = await service.monitorReading({
      id_leitura_sensor: 50,
      id_processo: 10,
      id_processo_tanque: 20,
      id_processo_tanque_sensor: 30,
    });

    expect(result).toMatchObject({
      processed: false,
      reason: 'Processo não está em execução.',
    });
    expect(tx.processostanques.updateMany).not.toHaveBeenCalled();
  });

  it('marca VACUO_ESTABILIZADO após janela contínua e leituras suficientes', async () => {
    tx.processostanquessensores.findUnique.mockResolvedValue(
      makeContext(statustanqueprocesso.VACUO_ATINGIDO),
    );
    tx.configuracoessistema.findFirst.mockResolvedValue({
      tolerancia_vacuo_percentual: decimal(10),
      estagnacao_janela_segundos: 60,
      estagnacao_variacao_minima: decimal(2),
      estagnacao_leituras_minimas: 5,
      estagnacao_janelas_consecutivas: 2,
    });
    tx.leiturasensores.aggregate.mockResolvedValue({
      _avg: { valor_vacuo: decimal(-70) },
      _count: { _all: 3 },
    });
    tx.leiturasensores.findFirst
      .mockResolvedValueOnce(makeReading(-5, '2026-07-16T11:59:00.000Z'))
      .mockResolvedValueOnce(makeReading(-80, '2026-07-16T12:00:40.000Z'));
    const targetReachedAt = new Date('2026-07-16T12:00:09.000Z');
    tx.eventos.findFirst.mockResolvedValue({ ocorrido_em: targetReachedAt });
    tx.leiturasensores.findMany.mockResolvedValue(
      Array.from({ length: 31 }, (_, index) => ({
        recebido_em: new Date(targetReachedAt.getTime() + index * 1000),
      })),
    );
    tx.processostanques.updateMany.mockResolvedValue({ count: 1 });
    tx.eventos.create.mockResolvedValue({ id_evento_processo: 91 });

    const result = await service.monitorReading({
      id_leitura_sensor: 51,
      id_processo: 10,
      id_processo_tanque: 20,
      id_processo_tanque_sensor: 30,
    });

    expect(result).toMatchObject({
      processed: true,
      status_anterior: statustanqueprocesso.VACUO_ATINGIDO,
      status_atual: statustanqueprocesso.VACUO_ESTABILIZADO,
    });
    expect(tx.eventos.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo_evento: tipoeventoprocesso.TANQUE_ESTABILIZADO,
      }),
    });
  });

  it('confirma estagnacao, cria alarme e devolve diagnostico ao socket', async () => {
    const context = makeContext(statustanqueprocesso.GERANDO_VACUO);
    Object.assign(context.processostanques, {
      status_estagnacao: statusestagnacao.SUSPEITA,
      estagnacao_iniciada_em: new Date('2026-07-16T11:59:00.000Z'),
      estagnacao_ultima_avaliacao_em: new Date('2026-07-16T12:00:00.000Z'),
      estagnacao_variacao_vacuo: decimal(0.4),
      estagnacao_leituras_janela: 6,
      estagnacao_janelas_sem_progresso: 1,
    });
    tx.processostanquessensores.findUnique.mockResolvedValue(context);
    tx.configuracoessistema.findFirst.mockResolvedValue({
      tolerancia_vacuo_percentual: decimal(10),
      estagnacao_janela_segundos: 60,
      estagnacao_variacao_minima: decimal(2),
      estagnacao_leituras_minimas: 5,
      estagnacao_janelas_consecutivas: 2,
    });
    tx.leiturasensores.aggregate.mockResolvedValue({
      _avg: { valor_vacuo: decimal(-40.25) },
      _count: { _all: 12 },
    });
    tx.leiturasensores.findFirst
      .mockResolvedValueOnce(makeReading(-5, '2026-07-16T11:55:00.000Z'))
      .mockResolvedValueOnce(makeReading(-40.5, '2026-07-16T12:01:00.000Z'));
    tx.leiturasensores.findMany.mockResolvedValue(
      [-40, -40.1, -40.2, -40.3, -40.4, -40.5].map((value, index) =>
        makeReading(
          value,
          new Date(
            new Date('2026-07-16T12:00:00.000Z').getTime() + index * 12_000,
          ).toISOString(),
        ),
      ),
    );
    tx.eventos.findFirst.mockResolvedValue(null);
    tx.processostanques.updateMany.mockResolvedValue({ count: 1 });
    tx.eventos.create.mockResolvedValue({ id_evento_processo: 92 });
    tx.alarmes.create.mockResolvedValue({ id_alarme: 99 });

    const result = await service.monitorReading({
      id_leitura_sensor: 60,
      id_processo: 10,
      id_processo_tanque: 20,
      id_processo_tanque_sensor: 30,
    });

    expect(result).toMatchObject({
      processed: true,
      estagnacao_mudou: true,
      estagnacao_status_anterior: statusestagnacao.SUSPEITA,
      estagnacao_status_atual: statusestagnacao.DETECTADA,
      tank_state: {
        estagnacao: expect.objectContaining({
          status: statusestagnacao.DETECTADA,
          detectada: true,
          id_alarme_ativo: 99,
          janelas_sem_progresso: 2,
        }),
      },
    });
    expect(tx.alarmes.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo_alarme: 'ESTAGNACAO',
        status_alarme: 'ATIVO',
        id_processo_tanque: 20,
      }),
      select: { id_alarme: true },
    });
  });

  it('normaliza alarme de estagnacao quando o tanque atinge o alvo', async () => {
    const context = makeContext(statustanqueprocesso.GERANDO_VACUO);
    Object.assign(context.processostanques, {
      status_estagnacao: statusestagnacao.DETECTADA,
      estagnacao_iniciada_em: new Date('2026-07-16T11:58:00.000Z'),
      estagnacao_detectada_em: new Date('2026-07-16T11:59:00.000Z'),
      estagnacao_ultima_avaliacao_em: new Date('2026-07-16T12:00:00.000Z'),
      estagnacao_variacao_vacuo: decimal(0.4),
      estagnacao_leituras_janela: 6,
      estagnacao_janelas_sem_progresso: 2,
    });
    tx.processostanquessensores.findUnique.mockResolvedValue(context);
    tx.configuracoessistema.findFirst.mockResolvedValue({
      tolerancia_vacuo_percentual: decimal(10),
      estagnacao_janela_segundos: 60,
      estagnacao_variacao_minima: decimal(2),
      estagnacao_leituras_minimas: 5,
      estagnacao_janelas_consecutivas: 2,
    });
    tx.leiturasensores.aggregate.mockResolvedValue({
      _avg: { valor_vacuo: decimal(-50) },
      _count: { _all: 10 },
    });
    tx.leiturasensores.findFirst
      .mockResolvedValueOnce(makeReading(-5, '2026-07-16T11:55:00.000Z'))
      .mockResolvedValueOnce(makeReading(-76, '2026-07-16T12:01:00.000Z'));
    tx.eventos.findFirst.mockResolvedValue(null);
    tx.alarmes.findFirst.mockResolvedValue({ id_alarme: 99 });
    tx.processostanques.updateMany.mockResolvedValue({ count: 1 });
    tx.eventos.create.mockResolvedValue({ id_evento_processo: 93 });
    tx.alarmes.update.mockResolvedValue({ id_alarme: 99 });

    const result = await service.monitorReading({
      id_leitura_sensor: 61,
      id_processo: 10,
      id_processo_tanque: 20,
      id_processo_tanque_sensor: 30,
    });

    expect(result.tank_state?.estagnacao).toMatchObject({
      status: statusestagnacao.NORMAL,
      detectada: false,
      id_alarme_ativo: null,
    });
    expect(tx.alarmes.update).toHaveBeenCalledWith({
      where: { id_alarme: 99 },
      data: expect.objectContaining({
        status_alarme: 'NORMALIZADO',
        motivo_resolucao: 'AUTO_RECUPERADO',
      }),
    });
  });

  function makeContext(
    tankStatus: statustanqueprocesso,
    processStatus: statusprocesso = statusprocesso.EM_EXECUCAO,
  ) {
    return {
      ativo: true,
      removido_em: null,
      processostanques: {
        id_processo_tanque: 20,
        id_processo: 10,
        id_tanque: 1,
        vacuo_alvo: decimal(-80),
        status_tanque_processo: tankStatus,
        status_encerramento: statusencerramentotanque.MONITORANDO,
        encerramento_iniciado_em: new Date('2026-07-16T11:59:00.000Z'),
        isolado_em: null,
        retencao_iniciada_em: null,
        retencao_finalizada_em: null,
        vacuo_isolamento: null,
        perda_vacuo_retencao: null,
        motivo_bloqueio_encerramento: null,
        encerramento_versao: 0,
        status_estagnacao: statusestagnacao.NORMAL,
        estagnacao_iniciada_em: null,
        estagnacao_detectada_em: null,
        estagnacao_ultima_avaliacao_em: null,
        estagnacao_variacao_vacuo: null,
        estagnacao_leituras_janela: 0,
        estagnacao_janelas_sem_progresso: 0,
        iniciado_em: new Date('2026-07-16T11:59:00.000Z'),
        finalizado_em: null,
        tanques: {
          nome: 'Tanque 1',
          sensoresacoplamentomangueiras: null,
        },
        _count: {
          processostanquessensores: 1,
        },
        processos: {
          status_processo: processStatus,
          retomado_em: null,
          encerramento_automatico: true,
          encerramento_tolerancia_vacuo_percentual: decimal(10),
          encerramento_limite_seguranca_vacuo: decimal(-95),
          encerramento_tempo_estabilizacao_segundos: 30,
          encerramento_estabilizacao_cobertura_minima_percentual: decimal(80),
          encerramento_intervalo_leitura_esperado_ms: 1000,
          encerramento_timeout_leitura_sensor_ms: 2500,
          encerramento_tempo_retencao_segundos: 30,
          encerramento_perda_vacuo_maxima_retencao: decimal(2),
        },
      },
    };
  }

  function makeReading(value: number, recebidoEm: string) {
    return {
      id_leitura_sensor: 50,
      id_processo_tanque_sensor: 30,
      valor_vacuo: decimal(value),
      valor: decimal(value),
      leitura_em: new Date(recebidoEm),
      recebido_em: new Date(recebidoEm),
      processostanquessensores: {
        id_sensor: 3,
      },
    };
  }

  function decimal(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value);
  }
});
