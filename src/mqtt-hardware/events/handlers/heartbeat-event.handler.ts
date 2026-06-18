import { Injectable, Logger } from '@nestjs/common';
import { CommandService } from '../../commands/command.service';
import { MqttSocketGateway } from '@/mqtt-hardware/socket/mqtt-socket.gateway';
import { HeartbeatAlarmClassifier } from '../classifiers/heartbeat-alarm.classifier';
import { EventProcessingStatus } from '../enums';
import { AlarmEventHandler } from './alarm-event.handler';
import type {
  AlarmClassificationResult,
  HeartbeatEventInput,
  HeartbeatTimeoutInput,
  EventResult,
} from '../interfaces';

@Injectable()
export class HeartbeatEventHandler {
  private readonly logger = new Logger(HeartbeatEventHandler.name);

  constructor(
    private readonly heatbeatAlarmClassifier: HeartbeatAlarmClassifier,
    private readonly alarmEventHandler: AlarmEventHandler,
    private readonly commandService: CommandService,
    private readonly mqttSocketGateway: MqttSocketGateway,
  ) {}

  async handleHeartbeatReceived(
    input: HeartbeatEventInput,
  ): Promise<EventResult> {
    try {
      const socketEmitted = this.emitHeartbeatReceived(input);
      const classification =
        this.heatbeatAlarmClassifier.classifyHeartbeatReceived(input);
      const alarmResult =
        await this.alarmEventHandler.handleClassification(classification);
      const emergencyStopSent = await this.requestEmergencyStopIfNeeded({
        classification,
        processoExecucao: false,
        idProcesso: null,
      });

      return {
        status: EventProcessingStatus.PROCESSED,
        message: this.buildHeartbeatReceivedMessage({
          input,
          classification,
          idAlarme: alarmResult.id_alarme ?? null,
        }),
        id_alarme: alarmResult.id_alarme,
        emergencyStopSent,
        socketEmitted: socketEmitted || alarmResult.socketEmitted,
        operationalLogCreated: alarmResult.operationalLogCreated,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao processar heartbeat recebido.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        status: EventProcessingStatus.FAILED,
        message: 'Falha ao processar heartbeat de heartbeat.',
        emergencyStopSent: false,
        socketEmitted: false,
        operationalLogCreated: false,
        error: message,
      };
    }
  }

  async handleHeartbeatTimeout(
    input: HeartbeatTimeoutInput,
  ): Promise<EventResult> {
    try {
      const socketEmitted = this.emitHeartbeatTimeout(input);
      const classification =
        this.heatbeatAlarmClassifier.classifyHeartbeatTimeout(input);
      const alarmResult =
        await this.alarmEventHandler.handleClassification(classification);
      const emergencyStopSent = await this.requestEmergencyStopIfNeeded({
        classification,
        processoExecucao: input.processo_em_execucao,
        idProcesso: input.processo_em_execucao ? input.id_processo : null,
      });

      return {
        status: EventProcessingStatus.PROCESSED,
        message: this.buildHeartbeatTimeoutMessage({
          input,
          classification,
          idAlarme: alarmResult.id_alarme ?? null,
          emergencyStopSent,
        }),
        id_alarme: alarmResult.id_alarme,
        emergencyStopSent,
        socketEmitted: socketEmitted || alarmResult.socketEmitted,
        operationalLogCreated: alarmResult.operationalLogCreated,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao processar timeout de heartbeat.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        status: EventProcessingStatus.FAILED,
        message: 'Falha ao processar timeout de heartbeat.',
        emergencyStopSent: false,
        socketEmitted: false,
        operationalLogCreated: false,
        error: message,
      };
    }
  }

  private emitHeartbeatReceived(input: HeartbeatEventInput): boolean {
    try {
      this.mqttSocketGateway.emitHeartbeat({
        id_mqtt_mensagem: input.id_mqtt_mensagem ?? null,
        esp32_online: input.esp32_online,
        uptime_ms: input.uptime_ms ?? null,
        firmware_version: input.firmware_version ?? null,
        receivedAt: input.receivedAt,
        enviado_em: new Date(),
        heartbeat_at: null,
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao emitir heartbeat via socket.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private emitHeartbeatTimeout(input: HeartbeatTimeoutInput): boolean {
    try {
      this.mqttSocketGateway.emitHeartbeat({
        id_mqtt_mensagem: null,
        esp32_online: false,
        uptime_ms: null,
        firmware_version: null,
        lastHeartbeatAt: input.lastHeartbeatAt ?? null,
        timeoutMs: input.timeoutMs,
        checkedAt: input.checkedAt,
        processo_em_execucao: input.processo_em_execucao,
        id_processo: input.processo_em_execucao ? input.id_processo : null,
        id_processo_tanque: input.processo_em_execucao
          ? (input.id_processo_tanque ?? null)
          : null,
        id_processo_tanque_sensor: input.processo_em_execucao
          ? (input.id_processo_tanque_sensor ?? null)
          : null,
        enviado_em: new Date(),
        heartbeat_at: null,
      });

      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro desconhecido ao emitir timeout via socket.';

      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private async requestEmergencyStopIfNeeded(params: {
    classification: AlarmClassificationResult;
    processoExecucao: boolean;
    idProcesso: number | null;
  }): Promise<boolean> {
    const { classification, processoExecucao, idProcesso } = params;

    if (!classification.shouldCreateAlarm) {
      return false;
    }

    if (!classification.shouldTriggerEmergencyStop) {
      return false;
    }

    if (!processoExecucao) {
      return false;
    }

    await this.commandService.paradaEmergencia({
      motivo:
        'Parada de emergência acionada por falha de heartbeat.' +
        `Motivo: ${classification.titulo}.` +
        `Processo: ${idProcesso ?? 'não informado'}.`,
    });

    this.logger.error(
      'Parada de emergência enviada por timeout de heartbeat.' +
        `Processo: ${idProcesso ?? 'não informado'}.`,
    );

    return true;
  }

  private buildHeartbeatReceivedMessage(params: {
    input: HeartbeatEventInput;
    classification: AlarmClassificationResult;
    idAlarme: number | null;
  }): string {
    const { input, classification, idAlarme } = params;

    if (!classification.shouldCreateAlarm) {
      return (
        'Heartbeat recebido.' +
        `ESP32 online: ${String(input.esp32_online)}` +
        `Resultado: ${classification.reason}`
      );
    }

    return (
      'Heartbeat recebido com condição de alarme.' +
      `ESP32 online: ${String(input.esp32_online)}` +
      `Alarme: ${idAlarme ?? 'não persistido'}.`
    );
  }

  private buildHeartbeatTimeoutMessage(params: {
    input: HeartbeatTimeoutInput;
    classification: AlarmClassificationResult;
    idAlarme: number | null;
    emergencyStopSent: boolean;
  }): string {
    const { input, classification, idAlarme, emergencyStopSent } = params;

    if (!classification.shouldCreateAlarm) {
      return (
        'Timeout de heartbeat processado sem alarme.' +
        `Resultado: ${classification.reason}`
      );
    }

    return (
      'Timeout heartbeat processado com sucesso.' +
      `Processo em execução: ${String(input.processo_em_execucao)}.` +
      `Alarme: ${idAlarme ?? 'não persistido'}.` +
      `Parada de emergência enviada: ${emergencyStopSent ? 'sim' : 'não'}.`
    );
  }
}
