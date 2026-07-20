import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MODULE_METADATA } from '@nestjs/common/constants';
import {
  statusbomba,
  statusestagnacao,
  statusencerramentotanque,
  statusgeralsistema,
  statustanqueprocesso,
  StatusValvula,
  tipobomba,
} from '@prisma/client';
import { ProcessoTanqueMonitorService } from '../../processos/lifecycle';
import { ProcessosSocketGateway } from '../../processos/socket';
import { MqttClientService } from '../connection/mqtt-client.service';
import { MqttModule } from '../mqtt.module';
import { ReadingContextCacheService } from '../events/cache';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { HardwareStatusSocketPayload } from '../interfaces/mqtt-socket-events.interface';
import { MqttSocketService } from '../socket/mqtt-socket.service';
import { AcoplamentoMangueiraHandler } from './acoplamento-mangueira.handler';
import { AlarmsHandler } from './alarms.handler';
import { CommandAckHandler } from './command-ack.handler';
import { HandlersService } from './mqtt-handlers.service';
import { HeartbeatHandler } from './heartbeat.handler';
import { ReadingHandler } from './reading.handler';
import { StatusHandler } from './status.handler';
import { MqttStatusHandlerResult } from './interfaces/mqtt-handler-results.interfaces';

describe('MqttModule - cadeia unica de mensagens', () => {
  it('registra somente o orquestrador MQTT ativo no runtime', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      MqttModule,
    ) as Array<{ name?: string }>;
    const providerNames = providers.map((provider) => provider.name);

    expect(providers).toContain(HandlersService);
    expect(providerNames).not.toEqual(
      expect.arrayContaining([
        'AlarmEventHandler',
        'AcoplamentoEventHandler',
        'HardwareStatusEventHandler',
        'HeartbeatEventHandler',
        'ReadingEventHandler',
      ]),
    );
  });
});

describe('HandlersService - transporte do lifecycle por tanque', () => {
  const readingHandler = { handle: jest.fn() };
  const mqttSocket = {
    publishedSensorReadingCreated: jest.fn(),
    publishMqttError: jest.fn(),
  };
  const monitor = { monitorReading: jest.fn() };
  const cache = { invalidate: jest.fn() };
  const processSocket = { emitTankUpdated: jest.fn() };
  let service: HandlersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HandlersService(
      {} as MqttClientService,
      mqttSocket as unknown as MqttSocketService,
      readingHandler as unknown as ReadingHandler,
      {} as StatusHandler,
      {} as HeartbeatHandler,
      {} as AlarmsHandler,
      {} as AcoplamentoMangueiraHandler,
      {} as CommandAckHandler,
      monitor as unknown as ProcessoTanqueMonitorService,
      cache as unknown as ReadingContextCacheService,
      processSocket as unknown as ProcessosSocketGateway,
    );
  });

  it('devolve a promise do processamento ao pipeline MQTT', async () => {
    let resolveReading!: (value: null) => void;
    const pendingReading = new Promise<null>((resolve) => {
      resolveReading = resolve;
    });
    readingHandler.handle.mockReturnValue(pendingReading);
    const listener = (
      service as unknown as {
        messageListener: (message: MqttMessage) => Promise<void>;
      }
    ).messageListener;
    let settled = false;

    const processing = listener(makeReadingMessage()).then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);

    resolveReading(null);
    await processing;

    expect(settled).toBe(true);
  });

  it('emite process:tank-updated depois do monitor processar a leitura', async () => {
    const leituraEm = new Date('2026-07-16T12:00:00.000Z');
    const recebidoEm = new Date('2026-07-16T12:00:01.000Z');
    readingHandler.handle.mockResolvedValue({
      id_leitura_sensor: 50,
      id_processo_tanque_sensor: 30,
      id_processo: 10,
      id_processo_tanque: 20,
      id_tanque: 1,
      id_sensor: 3,
      valor_vacuo: -76,
      leitura_em: leituraEm,
      recebido_em: recebidoEm,
      topic: 'tsea/leituras',
    });
    monitor.monitorReading.mockResolvedValue({
      processed: true,
      reason: 'Lifecycle individual do tanque atualizado.',
      id_processo: 10,
      id_processo_tanque: 20,
      status_anterior: statustanqueprocesso.GERANDO_VACUO,
      status_atual: statustanqueprocesso.VACUO_ATINGIDO,
      status_mudou: true,
      encerramento_mudou: true,
      encerramento_status_anterior: statusencerramentotanque.MONITORANDO,
      encerramento_status_atual:
        statusencerramentotanque.AGUARDANDO_ESTABILIZACAO,
      estagnacao_mudou: true,
      estagnacao_status_anterior: statusestagnacao.NORMAL,
      estagnacao_status_atual: statusestagnacao.SUSPEITA,
      tank_state: {
        id_processo_tanque: 20,
        id_tanque: 1,
        nome_tanque: 'Tanque 1',
        status_tanque_processo: statustanqueprocesso.VACUO_ATINGIDO,
        vacuo_atingido: true,
        vacuo_estabilizado: false,
        vacuo_alvo: -80,
        vacuo_atual: -76,
        vacuo_inicial: -5,
        vacuo_final: -76,
        vacuo_medio: -40,
        eficiencia: 95,
        iniciado_em: new Date('2026-07-16T11:59:00.000Z'),
        finalizado_em: null,
        ultima_leitura_em: leituraEm,
        ultima_leitura_recebida_em: recebidoEm,
        total_sensores: 1,
        total_leituras: 2,
        encerramento: {
          status: statusencerramentotanque.AGUARDANDO_ESTABILIZACAO,
        },
        estagnacao: {
          status: statusestagnacao.SUSPEITA,
          suspeita: true,
          detectada: false,
          iniciada_em: recebidoEm,
          detectada_em: null,
          ultima_avaliacao_em: recebidoEm,
          duracao_segundos: 0,
          variacao_vacuo: 0.4,
          janela_segundos: 60,
          variacao_minima_esperada: 2,
          leituras_janela: 6,
          leituras_minimas: 5,
          janelas_sem_progresso: 1,
          janelas_consecutivas_necessarias: 2,
          id_alarme_ativo: null,
          mensagem: 'Progresso abaixo do minimo.',
        },
      },
      latest_reading: {
        id_leitura_sensor: 50,
        id_processo_tanque_sensor: 30,
        id_tanque: 1,
        id_sensor: 3,
        valor_vacuo: -76,
        leitura_em: leituraEm,
        recebido_em: recebidoEm,
      },
    });

    await getInternalHandler(service).handleMqttMessage(makeReadingMessage());

    expect(mqttSocket.publishedSensorReadingCreated).toHaveBeenCalled();
    expect(monitor.monitorReading).toHaveBeenCalledWith({
      id_leitura_sensor: 50,
      id_processo: 10,
      id_processo_tanque: 20,
      id_processo_tanque_sensor: 30,
    });
    expect(processSocket.emitTankUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        id_processo: 10,
        id_processo_tanque: 20,
        id_tanque: 1,
        lifecycle_changed: true,
        previous_status: statustanqueprocesso.GERANDO_VACUO,
        closure_changed: true,
        previous_closure_status: statusencerramentotanque.MONITORANDO,
        stagnation_changed: true,
        previous_stagnation_status: statusestagnacao.NORMAL,
        tank: expect.objectContaining({
          status_tanque_processo: statustanqueprocesso.VACUO_ATINGIDO,
        }),
        reading: expect.objectContaining({
          id_leitura_sensor: 50,
          valor_vacuo: -76,
        }),
      }),
    );
    expect(cache.invalidate).toHaveBeenCalledWith(30);
    expect(monitor.monitorReading.mock.invocationCallOrder[0]).toBeLessThan(
      processSocket.emitTankUpdated.mock.invocationCallOrder[0],
    );
  });

  it('nao emite estado de tanque quando o monitor ignora a leitura', async () => {
    readingHandler.handle.mockResolvedValue({
      id_leitura_sensor: 50,
      id_processo_tanque_sensor: 30,
      id_processo: 10,
      id_processo_tanque: 20,
      id_tanque: 1,
      id_sensor: 3,
      valor_vacuo: -76,
      leitura_em: new Date(),
      recebido_em: new Date(),
      topic: 'tsea/leituras',
    });
    monitor.monitorReading.mockResolvedValue({
      processed: false,
      reason: 'Processo nÃ£o estÃ¡ em execuÃ§Ã£o.',
      id_processo: 10,
      id_processo_tanque: 20,
    });

    await getInternalHandler(service).handleMqttMessage(makeReadingMessage());

    expect(processSocket.emitTankUpdated).not.toHaveBeenCalled();
  });

  it('transporta a telemetria fisica detalhada das bombas no hardware:status', () => {
    const statusAt = new Date('2026-07-16T12:00:00.000Z');
    const payload = getInternalStatusAdapter(
      service,
    ).toHardwareStatusSocketPayload({
      esp32_online: true,
      status_geral_sistema: statusgeralsistema.OPERACIONAL,
      mensagem: null,
      device_id: 'ESP32_TSEA_01',
      status_em: statusAt,
      receivedAt: statusAt,
      topic: 'tsea/status',
      status_changed: false,
      bombas: [
        {
          id_bomba: 1,
          codigo_hardware: 'BOMBA_PRINCIPAL',
          tipo_bomba: tipobomba.PRINCIPAL,
          ligada: true,
          disponivel: true,
          falha: false,
          atualizado: true,
          status_em: statusAt,
        },
        {
          id_bomba: 2,
          codigo_hardware: 'BOMBA_AUXILIAR',
          tipo_bomba: tipobomba.AUXILIAR,
          ligada: false,
          disponivel: false,
          falha: true,
          atualizado: true,
          status_em: statusAt,
        },
      ],
      valvulas: [
        {
          id_valvula: 12,
          status_valvula: StatusValvula.FECHADA,
          ack: true,
          falha: false,
          atualizado: true,
        },
      ],
    });

    expect(payload.status_bomba_principal).toBe(statusbomba.ATIVA);
    expect(payload.status_bomba_auxiliar).toBe(statusbomba.FALHA);
    expect(payload.status_bombas).toEqual([
      expect.objectContaining({
        id_bomba: 1,
        ligada: true,
        disponivel: true,
      }),
      expect.objectContaining({
        id_bomba: 2,
        ligada: false,
        falha: true,
      }),
    ]);
    expect(payload.status_valvulas).toEqual([
      {
        id_valvula: 12,
        status_valvula: StatusValvula.FECHADA,
      },
    ]);
  });

  function getInternalHandler(input: HandlersService): {
    handleMqttMessage(message: MqttMessage): Promise<void>;
  } {
    return input as unknown as {
      handleMqttMessage(message: MqttMessage): Promise<void>;
    };
  }

  function getInternalStatusAdapter(input: HandlersService): {
    toHardwareStatusSocketPayload: (
      result: MqttStatusHandlerResult,
    ) => HardwareStatusSocketPayload;
  } {
    return input as unknown as {
      toHardwareStatusSocketPayload: (
        result: MqttStatusHandlerResult,
      ) => HardwareStatusSocketPayload;
    };
  }

  function makeReadingMessage(): MqttMessage {
    return {
      topic: 'tsea/leituras',
      payload: {},
      qos: 1,
      retain: false,
      receivedAt: new Date('2026-07-16T12:00:01.000Z'),
    };
  }
});
