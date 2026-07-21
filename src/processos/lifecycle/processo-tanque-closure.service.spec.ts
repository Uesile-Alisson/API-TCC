import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  etapaencerramentotanque,
  Prisma,
  StatusAcoplamentoMangueira,
  statusencerramentotanque,
  statusprocesso,
  statussensor,
  statussubsistemaauxiliar,
  statustanqueprocesso,
  StatusValvula,
  tipobomba,
} from '@prisma/client';
import { CommandService } from '../../mqtt-hardware/commands/command.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoAuxiliarCommandService } from '../auxiliar/processo-auxiliar-command.service';
import { ProcessoAuxiliarSafetyAction } from '../interfaces';
import { ProcessoLogService } from '../logs';
import { ProcessosSocketGateway } from '../socket';
import { ProcessoTanqueClosureService } from './processo-tanque-closure.service';

const asyncMock = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();
type AsyncMock = ReturnType<typeof asyncMock>;

describe('ProcessoTanqueClosureService', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');
  let prisma: ReturnType<typeof makePrisma>;
  let commands: {
    fecharValvula: AsyncMock;
    abrirValvula: AsyncMock;
  };
  let auxiliaryCommands: { executeAutomaticCommand: AsyncMock };
  let logs: {
    registerSystemAction: AsyncMock;
    registerUserAction: AsyncMock;
  };
  let socket: { emitTankClosureUpdated: jest.Mock };
  let service: ProcessoTanqueClosureService;

  beforeEach(() => {
    prisma = makePrisma();
    commands = {
      fecharValvula: asyncMock(),
      abrirValvula: asyncMock(),
    };
    auxiliaryCommands = { executeAutomaticCommand: asyncMock() };
    logs = {
      registerSystemAction: asyncMock().mockResolvedValue({ created: true }),
      registerUserAction: asyncMock().mockResolvedValue({ created: true }),
    };
    socket = { emitTankClosureUpdated: jest.fn() };
    service = new ProcessoTanqueClosureService(
      prisma as unknown as PrismaService,
      commands as unknown as CommandService,
      auxiliaryCommands as unknown as ProcessoAuxiliarCommandService,
      logs as unknown as ProcessoLogService,
      socket as unknown as ProcessosSocketGateway,
    );
  });

  it('aceita inicio manual apenas com versao e evidencias elegiveis', async () => {
    const currentReadingAt = new Date();
    const waiting = makeContext({
      status_encerramento: statusencerramentotanque.AGUARDANDO_ACAO_MANUAL,
      encerramento_versao: 4,
      latestReadingAt: currentReadingAt,
    });
    const isolating = makeContext({
      status_encerramento: statusencerramentotanque.ISOLANDO,
      etapa_encerramento: etapaencerramentotanque.AGUARDANDO_AUXILIAR_SEGURO,
      encerramento_versao: 5,
      encerramento_tentativa: 1,
      latestReadingAt: currentReadingAt,
    });
    prisma.processostanques.findFirst
      .mockResolvedValueOnce(waiting)
      .mockResolvedValueOnce(isolating);
    prisma.processostanques.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.startManual({
      id_processo: 10,
      id_processo_tanque: 20,
      dto: { expected_version: 4, motivo: 'Validacao tecnica concluida.' },
      user: {
        sub: 7,
        login: 'tecnico',
        id_nivel_acesso: 2,
        nivel_acesso: 'TECNICO',
      },
    });

    expect(prisma.processostanques.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_encerramento: statusencerramentotanque.ISOLANDO,
          etapa_encerramento:
            etapaencerramentotanque.AGUARDANDO_AUXILIAR_SEGURO,
          encerramento_tentativa: { increment: 1 },
        }),
      }),
    );
    expect(logs.registerUserAction).toHaveBeenCalled();
    expect(socket.emitTankClosureUpdated).toHaveBeenCalled();
    expect(result.closure.status).toBe(statusencerramentotanque.ISOLANDO);
  });

  it('desliga a bomba e fecha a valvula auxiliar antes da principal', async () => {
    auxiliaryCommands.executeAutomaticCommand.mockResolvedValue({
      success: true,
    });
    prisma.processostanques.updateMany.mockResolvedValue({ count: 1 });
    prisma.processostanques.findFirst.mockResolvedValue(makeContext());

    await advance(
      service,
      makeContext({ auxiliaryPumpRunning: true, auxiliaryValveOpen: true }),
      now,
    );
    expect(auxiliaryCommands.executeAutomaticCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: ProcessoAuxiliarSafetyAction.DESLIGAR_BOMBA_AUXILIAR,
      }),
    );
    expect(commands.fecharValvula).not.toHaveBeenCalled();

    await advance(
      service,
      makeContext({ auxiliaryPumpRunning: false, auxiliaryValveOpen: true }),
      now,
    );
    expect(auxiliaryCommands.executeAutomaticCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: ProcessoAuxiliarSafetyAction.FECHAR_VALVULA_AUXILIAR,
        id_processo_tanque: 20,
      }),
    );

    await advance(
      service,
      makeContext({
        auxiliaryPumpRunning: false,
        auxiliaryValveOpen: false,
        auxiliaryCurrentTank: null,
      }),
      now,
    );
    expect(prisma.processostanques.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          etapa_encerramento:
            etapaencerramentotanque.FECHANDO_VALVULA_PRINCIPAL,
        }),
      }),
    );
  });

  it('fecha a valvula principal com ACK e aguarda leitura posterior', async () => {
    commands.fecharValvula.mockResolvedValue({
      correlation_id: 'closure-p10-t20-a1-close-main',
      ack_received_at: now,
    });
    prisma.processostanques.updateMany.mockResolvedValue({ count: 1 });
    prisma.processostanques.findFirst.mockResolvedValue(
      makeContext({
        status_encerramento: statusencerramentotanque.VERIFICANDO_RETENCAO,
        etapa_encerramento:
          etapaencerramentotanque.AGUARDANDO_LEITURA_ISOLAMENTO,
      }),
    );

    await advance(
      service,
      makeContext({
        etapa_encerramento: etapaencerramentotanque.FECHANDO_VALVULA_PRINCIPAL,
        auxiliaryPumpRunning: false,
        auxiliaryValveOpen: false,
        auxiliaryCurrentTank: null,
      }),
      now,
    );

    expect(commands.fecharValvula).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation_id: 'closure-p10-t20-a1-close-main',
      }),
      101,
      'VP-1',
      { id_tanque: 1, id_processo_tanque: 20 },
    );
    expect(prisma.processostanques.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_encerramento: statusencerramentotanque.VERIFICANDO_RETENCAO,
          etapa_encerramento:
            etapaencerramentotanque.AGUARDANDO_LEITURA_ISOLAMENTO,
          isolado_em: now,
        }),
      }),
    );
  });

  it('conclui somente o tanque quando a retencao e aprovada', async () => {
    const context = makeContext({
      status_encerramento: statusencerramentotanque.VERIFICANDO_RETENCAO,
      etapa_encerramento: etapaencerramentotanque.RETENDO,
      retencao_iniciada_em: new Date(now.getTime() - 31_000),
      vacuo_isolamento: -80,
      currentVacuum: -79,
    });
    prisma.processostanques.updateMany.mockResolvedValue({ count: 1 });
    prisma.alarmes.updateMany.mockResolvedValue({ count: 1 });
    prisma.processostanques.findFirst.mockResolvedValue(
      makeContext({
        status_encerramento: statusencerramentotanque.CONCLUIDO,
        etapa_encerramento: etapaencerramentotanque.CONCLUIDA,
      }),
    );

    await advance(service, context, now);

    expect(prisma.processostanques.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_tanque_processo: statustanqueprocesso.CONCLUIDO,
          status_encerramento: statusencerramentotanque.CONCLUIDO,
          etapa_encerramento: etapaencerramentotanque.CONCLUIDA,
        }),
      }),
    );
    expect(commands.abrirValvula).not.toHaveBeenCalled();
    expect(commands.fecharValvula).not.toHaveBeenCalled();
  });

  it('reprova a retencao e reabre apenas a valvula principal', async () => {
    prisma.processostanques.updateMany.mockResolvedValue({ count: 1 });
    prisma.processostanques.findFirst.mockResolvedValue(makeContext());

    await advance(
      service,
      makeContext({
        status_encerramento: statusencerramentotanque.VERIFICANDO_RETENCAO,
        etapa_encerramento: etapaencerramentotanque.RETENDO,
        retencao_iniciada_em: new Date(now.getTime() - 10_000),
        vacuo_isolamento: -80,
        currentVacuum: -75,
      }),
      now,
    );
    expect(prisma.processostanques.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_encerramento: statusencerramentotanque.BLOQUEADO,
          etapa_encerramento:
            etapaencerramentotanque.REABRINDO_VALVULA_PRINCIPAL,
        }),
      }),
    );

    commands.abrirValvula.mockResolvedValue({
      correlation_id: 'closure-p10-t20-a1-reopen-main',
      ack_received_at: now,
    });
    await advance(
      service,
      makeContext({
        status_encerramento: statusencerramentotanque.BLOQUEADO,
        etapa_encerramento: etapaencerramentotanque.REABRINDO_VALVULA_PRINCIPAL,
        auxiliaryValveOpen: false,
        auxiliaryCurrentTank: null,
      }),
      now,
    );

    expect(commands.abrirValvula).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation_id: 'closure-p10-t20-a1-reopen-main',
      }),
      101,
      'VP-1',
      { id_tanque: 1, id_processo_tanque: 20 },
    );
    expect(prisma.processostanques.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_tanque_processo: statustanqueprocesso.GERANDO_VACUO,
          status_encerramento: statusencerramentotanque.MONITORANDO,
          etapa_encerramento: etapaencerramentotanque.NENHUMA,
        }),
      }),
    );
  });

  it('marca falha quando a leitura fica obsoleta durante a retencao', async () => {
    prisma.processostanques.updateMany.mockResolvedValue({ count: 1 });
    prisma.processostanques.findFirst.mockResolvedValue(
      makeContext({
        status_encerramento: statusencerramentotanque.FALHA,
        etapa_encerramento: etapaencerramentotanque.FALHA,
      }),
    );

    await advance(
      service,
      makeContext({
        status_encerramento: statusencerramentotanque.VERIFICANDO_RETENCAO,
        etapa_encerramento: etapaencerramentotanque.RETENDO,
        latestReadingAt: new Date(now.getTime() - 3_000),
        retencao_iniciada_em: new Date(now.getTime() - 1_000),
        vacuo_isolamento: -80,
      }),
      now,
    );

    expect(prisma.processostanques.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_encerramento: statusencerramentotanque.FALHA,
          etapa_encerramento: etapaencerramentotanque.FALHA,
          motivo_bloqueio_encerramento: expect.stringContaining('timeout'),
        }),
      }),
    );
  });

  it('falha fechado quando a mangueira e desacoplada durante a retencao', async () => {
    prisma.processostanques.updateMany.mockResolvedValue({ count: 1 });
    prisma.processostanques.findFirst.mockResolvedValue(
      makeContext({
        status_encerramento: statusencerramentotanque.FALHA,
        etapa_encerramento: etapaencerramentotanque.FALHA,
      }),
    );

    await advance(
      service,
      makeContext({
        status_encerramento: statusencerramentotanque.VERIFICANDO_RETENCAO,
        etapa_encerramento: etapaencerramentotanque.RETENDO,
        hoseCoupled: false,
        retencao_iniciada_em: new Date(now.getTime() - 10_000),
        vacuo_isolamento: -80,
      }),
      now,
    );

    expect(prisma.processostanques.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_encerramento: statusencerramentotanque.FALHA,
          etapa_encerramento: etapaencerramentotanque.FALHA,
          motivo_bloqueio_encerramento: expect.stringContaining(
            'Mangueira desacoplada',
          ),
        }),
      }),
    );
    expect(commands.abrirValvula).not.toHaveBeenCalled();
  });

  it('nao conclui a retencao quando o sensor de vacuo entra em falha', async () => {
    prisma.processostanques.updateMany.mockResolvedValue({ count: 1 });
    prisma.processostanques.findFirst.mockResolvedValue(
      makeContext({
        status_encerramento: statusencerramentotanque.FALHA,
        etapa_encerramento: etapaencerramentotanque.FALHA,
      }),
    );

    await advance(
      service,
      makeContext({
        status_encerramento: statusencerramentotanque.VERIFICANDO_RETENCAO,
        etapa_encerramento: etapaencerramentotanque.RETENDO,
        sensorStatus: statussensor.FALHA,
        retencao_iniciada_em: new Date(now.getTime() - 31_000),
        vacuo_isolamento: -80,
      }),
      now,
    );

    expect(prisma.processostanques.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_encerramento: statusencerramentotanque.FALHA,
          etapa_encerramento: etapaencerramentotanque.FALHA,
          motivo_bloqueio_encerramento: expect.stringContaining(
            'Sensor de vacuo 40 indisponivel',
          ),
        }),
      }),
    );
  });

  it('repete ACK ausente e falha ao atingir o limite persistido', async () => {
    commands.fecharValvula.mockRejectedValue(new Error('ACK ausente'));
    prisma.processostanques.updateMany.mockResolvedValue({ count: 1 });
    prisma.processostanques.findFirst.mockResolvedValue(makeContext());

    await advance(
      service,
      makeContext({
        etapa_encerramento: etapaencerramentotanque.FECHANDO_VALVULA_PRINCIPAL,
        encerramento_comando_tentativas: 0,
      }),
      now,
    );
    expect(prisma.processostanques.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          encerramento_comando_tentativas: 1,
          encerramento_proxima_tentativa_em: new Date(now.getTime() + 5_000),
        }),
      }),
    );

    await advance(
      service,
      makeContext({
        etapa_encerramento: etapaencerramentotanque.FECHANDO_VALVULA_PRINCIPAL,
        encerramento_comando_tentativas: 2,
      }),
      now,
    );
    expect(prisma.processostanques.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status_encerramento: statusencerramentotanque.FALHA,
          etapa_encerramento: etapaencerramentotanque.FALHA,
        }),
      }),
    );
  });
});

function makePrisma() {
  const processostanques = {
    findFirst: asyncMock(),
    findMany: asyncMock(),
    updateMany: asyncMock(),
  };
  const alarmes = { updateMany: asyncMock() };
  const prisma = {
    processos: { findMany: asyncMock() },
    processostanques,
    alarmes,
    $transaction: jest.fn((operation: (tx: unknown) => unknown) =>
      Promise.resolve(operation({ processostanques, alarmes })),
    ),
  };
  return prisma;
}

function makeContext(
  input: {
    status_encerramento?: statusencerramentotanque;
    etapa_encerramento?: etapaencerramentotanque;
    encerramento_versao?: number;
    encerramento_tentativa?: number;
    encerramento_comando_tentativas?: number;
    auxiliaryPumpRunning?: boolean | null;
    auxiliaryValveOpen?: boolean;
    auxiliaryCurrentTank?: number | null;
    latestReadingAt?: Date;
    retencao_iniciada_em?: Date | null;
    vacuo_isolamento?: number | null;
    currentVacuum?: number;
    hoseCoupled?: boolean;
    sensorStatus?: statussensor;
  } = {},
) {
  const latestReadingAt =
    input.latestReadingAt ?? new Date('2026-07-16T12:00:00.000Z');
  const statusEncerramento =
    input.status_encerramento ?? statusencerramentotanque.ISOLANDO;
  const stage =
    input.etapa_encerramento ??
    etapaencerramentotanque.AGUARDANDO_AUXILIAR_SEGURO;

  return {
    id_processo_tanque: 20,
    id_processo: 10,
    id_tanque: 1,
    vacuo_alvo: new Prisma.Decimal(-80),
    vacuo_final: new Prisma.Decimal(input.currentVacuum ?? -80),
    status_tanque_processo: statustanqueprocesso.VACUO_ESTABILIZADO,
    status_encerramento: statusEncerramento,
    etapa_encerramento: stage,
    encerramento_iniciado_em: new Date('2026-07-16T11:59:00.000Z'),
    isolado_em:
      stage === etapaencerramentotanque.RETENDO
        ? new Date('2026-07-16T11:59:20.000Z')
        : null,
    retencao_iniciada_em: input.retencao_iniciada_em ?? null,
    retencao_finalizada_em: null,
    vacuo_isolamento:
      input.vacuo_isolamento === undefined || input.vacuo_isolamento === null
        ? null
        : new Prisma.Decimal(input.vacuo_isolamento),
    perda_vacuo_retencao: new Prisma.Decimal(0),
    motivo_bloqueio_encerramento: null,
    encerramento_versao: input.encerramento_versao ?? 1,
    encerramento_tentativa: input.encerramento_tentativa ?? 1,
    encerramento_comando_tentativas: input.encerramento_comando_tentativas ?? 0,
    encerramento_proxima_tentativa_em: null,
    estabilizacao_leituras_esperadas: 30,
    estabilizacao_leituras_observadas: 30,
    estabilizacao_cobertura_percentual: new Prisma.Decimal(100),
    estabilizacao_maior_intervalo_ms: 1000,
    processos: {
      status_processo: statusprocesso.EM_EXECUCAO,
      encerramento_automatico: true,
      encerramento_tolerancia_vacuo_percentual: new Prisma.Decimal(10),
      encerramento_limite_seguranca_vacuo: new Prisma.Decimal(-95),
      encerramento_tempo_estabilizacao_segundos: 30,
      encerramento_estabilizacao_cobertura_minima_percentual:
        new Prisma.Decimal(80),
      encerramento_timeout_leitura_sensor_ms: 2500,
      encerramento_tempo_retencao_segundos: 30,
      encerramento_perda_vacuo_maxima_retencao: new Prisma.Decimal(2),
      processosauxiliares: {
        status_subsistema: statussubsistemaauxiliar.OPERANDO,
        id_processo_tanque_atual:
          input.auxiliaryCurrentTank === undefined
            ? 20
            : input.auxiliaryCurrentTank,
        versao: 3,
      },
      alarmes: [],
    },
    processostanquesauxiliares: { versao: 2 },
    tanques: {
      nome: 'Tanque 1',
      sensoresacoplamentomangueiras: {
        ativo: true,
        status_acoplamento:
          input.hoseCoupled === false
            ? StatusAcoplamentoMangueira.DESACOPLADA
            : StatusAcoplamentoMangueira.ACOPLADA,
        sinal_detectado: input.hoseCoupled !== false,
        ultima_verificacao: latestReadingAt,
      },
      valvulas: [
        {
          id_valvula: 101,
          codigo_hardware: 'VP-1',
          status_valvula: StatusValvula.ABERTA,
          bombas: {
            id_bomba: 1,
            codigo_hardware: 'BP-1',
            tipo_bomba: tipobomba.PRINCIPAL,
            ligada_hardware: true,
            ultimo_status_hardware_em: latestReadingAt,
          },
        },
        {
          id_valvula: 201,
          codigo_hardware: 'VA-1',
          status_valvula:
            input.auxiliaryValveOpen === false
              ? StatusValvula.FECHADA
              : StatusValvula.ABERTA,
          bombas: {
            id_bomba: 2,
            codigo_hardware: 'BA-1',
            tipo_bomba: tipobomba.AUXILIAR,
            ligada_hardware:
              input.auxiliaryPumpRunning === undefined
                ? false
                : input.auxiliaryPumpRunning,
            ultimo_status_hardware_em: latestReadingAt,
          },
        },
      ],
    },
    processostanquessensores: [
      {
        id_processo_tanque_sensor: 30,
        id_sensor: 40,
        sensores: {
          status_sensor: input.sensorStatus ?? statussensor.ATIVO,
        },
        leiturasensores: [
          {
            id_leitura_sensor: 50,
            valor_vacuo: new Prisma.Decimal(input.currentVacuum ?? -80),
            valor: new Prisma.Decimal(input.currentVacuum ?? -80),
            leitura_em: latestReadingAt,
            recebido_em: latestReadingAt,
          },
        ],
      },
    ],
  };
}

function advance(
  service: ProcessoTanqueClosureService,
  context: ReturnType<typeof makeContext>,
  evaluatedAt: Date,
) {
  return service['advanceContext'](context, evaluatedAt);
}
