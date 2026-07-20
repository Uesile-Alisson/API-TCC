import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  severidadealarme,
  statusbomba,
  statusconexaomqtt,
  tipobomba,
} from '@prisma/client';
import { ProcessoTanqueMonitorService } from '../../processos/lifecycle';
import { ProcessosSocketGateway } from '../../processos/socket';
import { MqttClientService } from '../connection/mqtt-client.service';
import { ReadingContextCacheService } from '../events/cache';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import {
  AlarmCreatedSocketPayload,
  HardwareStatusSocketPayload,
  HeartbeatSocketPayload,
  SensorAcoplamentoSocketPayload,
  SensorReadingSocketPayload,
} from '../interfaces/mqtt-socket-events.interface';
import { MqttSocketService } from '../socket/mqtt-socket.service';
import { TopicMatcher } from '../topics/topic-matcher';
import { AcoplamentoMangueiraHandler } from './acoplamento-mangueira.handler';
import { AlarmsHandler } from './alarms.handler';
import { CommandAckHandler } from './command-ack.handler';
import { HeartbeatHandler } from './heartbeat.handler';
import {
  MqttAcoplamentoMangueiraHandlerResult,
  MqttAlarmHandlerResult,
  MqttHeartbeatHandlerResult,
  MqttReadingHandlerResult,
  MqttStatusHandlerResult,
} from './interfaces/mqtt-handler-results.interfaces';
import { ReadingHandler } from './reading.handler';
import { StatusHandler } from './status.handler';

@Injectable()
export class HandlersService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(HandlersService.name);

  private readonly messageListener = (message: MqttMessage): Promise<void> =>
    this.handleMqttMessage(message);
  private readonly connectionStatusListener = (
    status: statusconexaomqtt,
    error?: string,
  ): void => {
    this.handleConnectionStatusChange(status, error);
  };

  constructor(
    private readonly mqttClientService: MqttClientService,
    private readonly mqttSocketService: MqttSocketService,
    private readonly readingHandler: ReadingHandler,
    private readonly statusHandler: StatusHandler,
    private readonly heartbeatHandler: HeartbeatHandler,
    private readonly alarmsHandler: AlarmsHandler,
    private readonly acoplamentoHandler: AcoplamentoMangueiraHandler,
    private readonly commandAckHandler: CommandAckHandler,
    private readonly processoTanqueMonitorService: ProcessoTanqueMonitorService,
    private readonly readingContextCacheService: ReadingContextCacheService,
    private readonly processosSocketGateway: ProcessosSocketGateway,
  ) {}

  onModuleInit(): void {
    this.mqttClientService.registerMessageListener(this.messageListener);

    this.mqttClientService.registerConnectionStatusListener(
      this.connectionStatusListener,
    );

    this.mqttSocketService.publishedCurrentHardwareSatate();
    this.logger.log('Serviço de handlers MQTT iniciado.');
  }

  onModuleDestroy(): void {
    this.mqttClientService.removeMessageListener(this.messageListener);

    this.mqttClientService.removeConnectionStatusListener(
      this.connectionStatusListener,
    );

    this.logger.log('Serviço de handlers MQTT finalizado.');
  }

  private async handleMqttMessage(message: MqttMessage): Promise<void> {
    try {
      if (TopicMatcher.isAcoplamento(message.topic)) {
        await this.handleAcoplamentoMessage(message);
        return;
      }

      if (TopicMatcher.isAck(message.topic)) {
        await this.handleCommandAckMessage(message);
        return;
      }

      if (TopicMatcher.isAlarme(message.topic)) {
        await this.handleAlarmMessage(message);
        return;
      }

      if (TopicMatcher.isHeartbeat(message.topic)) {
        await this.handleHeartbeatMessage(message);
        return;
      }

      if (TopicMatcher.isLeitura(message.topic)) {
        await this.handleReadingMessage(message);
        return;
      }

      if (TopicMatcher.isStatus(message.topic)) {
        await this.handleStatusMessage(message);
        return;
      }

      this.logUnknownTopic(message);
    } catch (error) {
      this.handleMessageProcessingError(message, error);
    }
  }

  private async handleHeartbeatMessage(message: MqttMessage): Promise<void> {
    const result = await this.heartbeatHandler.handle(message);

    this.mqttSocketService.publishedHeartbeatUpdated(
      this.toHeartbeatSocketPayload(result),
    );
  }

  private async handleReadingMessage(message: MqttMessage): Promise<void> {
    const result = await this.readingHandler.handle(message);

    if (!result) {
      return;
    }

    this.mqttSocketService.publishedSensorReadingCreated(
      this.toSensorReadingSocketPayload(result),
    );

    await this.monitorProcessTankReading(result);
  }

  private async monitorProcessTankReading(
    result: MqttReadingHandlerResult,
  ): Promise<void> {
    try {
      const monitorResult =
        await this.processoTanqueMonitorService.monitorReading({
          id_leitura_sensor: result.id_leitura_sensor,
          id_processo: result.id_processo,
          id_processo_tanque: result.id_processo_tanque,
          id_processo_tanque_sensor: result.id_processo_tanque_sensor,
        });

      if (monitorResult.processed && monitorResult.status_mudou) {
        this.readingContextCacheService.invalidate(
          result.id_processo_tanque_sensor,
        );
      }

      if (
        monitorResult.processed &&
        monitorResult.status_anterior &&
        monitorResult.tank_state &&
        monitorResult.latest_reading
      ) {
        this.processosSocketGateway.emitTankUpdated({
          id_processo: monitorResult.id_processo,
          id_processo_tanque: monitorResult.id_processo_tanque,
          id_tanque: monitorResult.tank_state.id_tanque,
          lifecycle_changed: monitorResult.status_mudou ?? false,
          previous_status: monitorResult.status_anterior,
          closure_changed: monitorResult.encerramento_mudou ?? false,
          previous_closure_status:
            monitorResult.encerramento_status_anterior ??
            monitorResult.tank_state.encerramento.status,
          stagnation_changed: monitorResult.estagnacao_mudou ?? false,
          previous_stagnation_status:
            monitorResult.estagnacao_status_anterior ??
            monitorResult.tank_state.estagnacao.status,
          tank: monitorResult.tank_state,
          reading: monitorResult.latest_reading,
          emitted_at: new Date(),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro desconhecido.';

      this.logger.error(
        `Leitura ${result.id_leitura_sensor} foi persistida, mas o monitor ` +
          `do processo/tanque ${result.id_processo_tanque} falhou: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async handleStatusMessage(message: MqttMessage): Promise<void> {
    const result = await this.statusHandler.handle(message);

    if (!result) {
      return;
    }

    this.mqttSocketService.publishedHardwareStatusUpdated(
      this.toHardwareStatusSocketPayload(result),
    );
  }

  private async handleAlarmMessage(message: MqttMessage): Promise<void> {
    const result = await this.alarmsHandler.handle(message);

    if (!result) {
      return;
    }

    this.mqttSocketService.publishedAlarmCreated(
      this.toAlarmSocketPayload(result),
    );
  }

  private async handleAcoplamentoMessage(message: MqttMessage): Promise<void> {
    const result = await this.acoplamentoHandler.handle(message);

    if (!result) {
      return;
    }

    this.mqttSocketService.publishedSensorAcoplamentoUpdated(
      this.toSensorAcoplamentoSocketPayload(result),
    );
  }

  private async handleCommandAckMessage(message: MqttMessage): Promise<void> {
    await this.commandAckHandler.handleAndPersist(message);
  }

  private toHeartbeatSocketPayload(
    result: MqttHeartbeatHandlerResult,
  ): HeartbeatSocketPayload {
    return {
      esp32_online: result.esp32_online,
      receivedAt: result.receivedAt,
      lastHeartbeatAt: result.heartbeat_at,
      device_id: result.device_id,
      heartbeat_at: result.heartbeat_at,
    };
  }

  private toSensorReadingSocketPayload(
    result: MqttReadingHandlerResult,
  ): SensorReadingSocketPayload {
    return {
      id_mqtt_mensagem: null,
      id_leitura_sensor: result.id_leitura_sensor,
      id_processo_tanque_sensor: result.id_processo_tanque_sensor,
      id_sensor: result.id_sensor,
      id_tanque: result.id_tanque,
      valor_vacuo: result.valor_vacuo,
      leitura_em: result.leitura_em,
      recebido_em: result.recebido_em,
    };
  }

  private toHardwareStatusSocketPayload(
    result: MqttStatusHandlerResult,
  ): HardwareStatusSocketPayload {
    const bombaPrincipal = result.bombas.find(
      (bomba) => bomba.tipo_bomba === tipobomba.PRINCIPAL,
    );
    const bombaAuxiliar = result.bombas.find(
      (bomba) => bomba.tipo_bomba === tipobomba.AUXILIAR,
    );

    return {
      id_mqtt_mensagem: null,
      esp32_online: result.esp32_online,
      status_bomba_principal: this.toLegacyPumpStatus(bombaPrincipal),
      status_bomba_auxiliar: this.toLegacyPumpStatus(bombaAuxiliar),
      status_bombas: result.bombas.map((bomba) => ({
        id_bomba: bomba.id_bomba,
        codigo_hardware: bomba.codigo_hardware,
        tipo_bomba: bomba.tipo_bomba,
        ligada: bomba.ligada,
        disponivel: bomba.disponivel,
        falha: bomba.falha,
        status_em: bomba.status_em,
      })),
      status_valvulas: result.valvulas
        .filter((valvula) => valvula.id_valvula > 0)
        .map((valvula) => ({
          id_valvula: valvula.id_valvula,
          status_valvula: valvula.status_valvula,
        })),
      status_geral_sistema: result.status_geral_sistema,
      processo_em_execucao: false,
      id_processo: null,
      id_processo_tanque: null,
      id_processo_tanque_sensor: null,
      erro: null,
      recebido_em: result.receivedAt,
      enviado_em: new Date(),
      mensagem: result.mensagem,
      device_id: result.device_id,
    };
  }

  private toLegacyPumpStatus(
    bomba: MqttStatusHandlerResult['bombas'][number] | undefined,
  ): statusbomba | null {
    if (!bomba) {
      return null;
    }

    if (bomba.falha) {
      return statusbomba.FALHA;
    }

    return bomba.disponivel ? statusbomba.ATIVA : statusbomba.INATIVA;
  }

  private toAlarmSocketPayload(
    result: MqttAlarmHandlerResult,
  ): AlarmCreatedSocketPayload {
    return {
      id_alarme: result.id_alarme,
      titulo: result.titulo,
      descricao: result.descricao,
      tipo_alarme: result.tipo_alarme,
      severidade: result.severidade,
      status_alarme: result.status_alarme,
      origem_alarme: result.origem_alarme,
      valor_detectado: result.valor_detectado,
      unidade: result.unidade,
      ocorrido_em: result.ocorrido_em,
      resolvido_em: result.resolvido_em,
      id_processo: result.id_processo,
      id_processo_tanque: result.id_processo_tanque,
      id_processo_tanque_sensor: result.id_processo_tanque_sensor,
      id_mqtt_mensagem: null,
      topic: result.topic,
      shouldTriggerEmergencyStop:
        result.severidade === severidadealarme.CRITICO,
    };
  }

  private toSensorAcoplamentoSocketPayload(
    result: MqttAcoplamentoMangueiraHandlerResult,
  ): SensorAcoplamentoSocketPayload {
    return {
      id_sensor: result.id_sensor,
      id_tanque: result.id_tanque,
      id_processo_tanque_sensor: null,
      id_processo: null,
      id_processo_tanque: null,
      sinal_detectado: result.sinal_detectado,
      status_anterior: result.status_anterior,
      status_acoplamento: result.status_acoplamento,
      status_mudou: result.status_mudou,
      processo_em_execucao: false,
      ultima_verificacao: result.verificado_em,
      verificado_em: result.verificado_em,
      topic: result.topic,
      receivedAt: result.receivedAt,
    };
  }

  private handleConnectionStatusChange(
    status: statusconexaomqtt,
    error?: string,
  ): void {
    this.mqttSocketService.publishedConnectionStatus(status, error);

    if (status !== statusconexaomqtt.CONECTADO) {
      this.commandAckHandler.rejectAllPending(
        error ??
          `Conexao MQTT alterada para ${String(status)} enquanto a API aguardava ACK do ESP32.`,
      );
    }

    if (error) {
      this.logger.warn(
        `Status de conexão MQTT alterado para ${String(status)}. Erro: ${error}`,
      );

      return;
    }

    this.logger.debug(`Status de conexão MQTT alterado para ${String(status)}`);
  }

  private handleMessageProcessingError(
    message: MqttMessage,
    error: unknown,
  ): void {
    const errorMessage = this.rsolveErrorMessage(error);

    this.logger.error(
      `Erro ao processar mensagem MQTT.` +
        `Tópico: ${message.topic}.` +
        `Erro: ${errorMessage}`,
      error instanceof Error ? error.stack : undefined,
    );

    this.mqttSocketService.publishMqttError(
      `Erro ao processar mensagem MQTT no tópico ${message.topic}: ${errorMessage}`,
    );
  }

  private logUnknownTopic(message: MqttMessage): void {
    this.logger.warn(
      `Mqnsagem MQTT ignorada: tópico não reconhecido.` +
        `Tópico: ${message.topic}.`,
    );
  }

  private rsolveErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Erro desconhecido.';
  }
}
