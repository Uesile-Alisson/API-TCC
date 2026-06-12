import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { statusgeralsistema } from '@prisma/client';
import { MqttClientService } from './mqtt-client.service';
import { MqttConfigService } from '../config/mqtt-config.service';
import { HardwareState } from '../interfaces/hardware-state.interface';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { TopicMatcher } from '../topics/topic-matcher';

@Injectable()
export class MqttHealthService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(MqttHealthService.name);
  private readonly interval_comunicationMs = 1000;
  private timeout_heartbeat = 10000;
  private interval_comunication: ReturnType<typeof setInterval> | null = null;
  private state: HardwareState = {
    mqttConnected: false,
    esp32Online: false,
    lastHeartbeatAt: null,
    lastStatusAt: null,
    lastReadingAt: null,
    currentStatus: statusgeralsistema.ALERTA,
    lastError: 'Monitoramento MQTT/Hardware ainda não foi inicializado',
    updatedAt: new Date(),
  };
  private readonly messageListener = (message: MqttMessage): void => {
    this.handleMqttMessage(message);
  };

  constructor(
    private readonly mqttConfigService: MqttConfigService,
    private readonly mqttClientService: MqttClientService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadHealthConfig();

    this.mqttClientService.registerMessageListener(this.messageListener);

    this.startHealthMonitoring();
    this.logger.log('Monitoramento MQTT/Hardware iniciado.');
  }

  onModuleDestroy(): void {
    this.mqttClientService.removeMessageListener(this.messageListener);

    this.stopHealthMonitoring();
    this.logger.log('Monitoramento MQTT/Hardware finalizado.');
  }

  getCurrentState(): HardwareState {
    return {
      ...this.state,
    };
  }

  isEsp32Online(): boolean {
    return this.state.esp32Online;
  }

  isMqttConnected(): boolean {
    return this.state.mqttConnected;
  }

  getLastHeartbeatAt(): Date | null {
    return this.state.lastHeartbeatAt;
  }

  forceMarkEsp32Offline(reason: string): void {
    this.updateState({
      esp32Online: false,
      currentStatus: statusgeralsistema.FALHA,
      lastError: reason,
    });
  }

  async reloadHealthConfig(): Promise<void> {
    await this.loadHealthConfig();

    this.logger.log('Configuração de saúde MQTT/Hardware recarregada.');
  }

  private async loadHealthConfig(): Promise<void> {
    const config = await this.mqttConfigService.getConfig();

    if (!config) {
      throw new BadRequestException('MQTT broker não foi configurado.');
    }

    this.timeout_heartbeat = config.timeout_comunicacao;

    this.logger.log(
      `Timeout de heartbeat MQTT carregado: ${this.timeout_heartbeat} ms.`,
    );
  }

  private handleMqttMessage(message: MqttMessage): void {
    if (TopicMatcher.isHeartbeat(message.topic)) {
      this.handleHeartbeatMessage();
      return;
    }

    if (TopicMatcher.isStatus(message.topic)) {
      this.handleStatusMessage();
      return;
    }

    if (TopicMatcher.isAlarme(message.topic)) {
      this.handleAlarmeMessage();
      return;
    }

    if (TopicMatcher.isLeitura(message.topic)) {
      this.handleReadingMessage();
      return;
    }
  }

  private handleHeartbeatMessage(): void {
    this.updateState({
      mqttConnected: this.mqttClientService.getConnectionState(),
      esp32Online: true,
      currentStatus: statusgeralsistema.OPERACIONAL,
      lastReadingAt: new Date(),
      lastError: null,
    });
  }

  private handleStatusMessage(): void {
    this.updateState({
      mqttConnected: this.mqttClientService.getConnectionState(),
      esp32Online: true,
      currentStatus: statusgeralsistema.OPERACIONAL,
      lastReadingAt: new Date(),
      lastError: null,
    });
  }

  private handleReadingMessage(): void {
    this.updateState({
      mqttConnected: this.mqttClientService.getConnectionState(),
      esp32Online: true,
      lastReadingAt: new Date(),
      lastError: null,
    });
  }

  private handleAlarmeMessage(): void {
    this.updateState({
      mqttConnected: this.mqttClientService.getConnectionState(),
      esp32Online: true,
      currentStatus: statusgeralsistema.ALERTA,
    });
  }

  private startHealthMonitoring(): void {
    if (this.interval_comunication) {
      this.logger.warn('Monitoramento MQTT/Hardware já tinha sido iniciado.');
      return;
    }

    this.interval_comunication = setInterval(() => {
      this.checkHardwareHealth();
    }, this.interval_comunicationMs);

    this.logger.log('Monitoramento MQTT/Hardware iniciado.');
  }

  private stopHealthMonitoring(): void {
    if (!this.interval_comunication) {
      this.logger.warn('Monitoramento MQTT/Hardware já estava parado.');
      return;
    }

    clearInterval(this.interval_comunication);
    this.interval_comunication = null;

    this.logger.log('Monitoramento MQTT/Hardware parado.');
  }

  private checkHardwareHealth(): void {
    const mqttConnected = this.mqttClientService.getConnectionState();

    if (!mqttConnected) {
      this.updateState({
        mqttConnected: false,
        esp32Online: false,
        currentStatus: statusgeralsistema.FALHA,
        lastError: 'Cliente MQTT desconectado do broker.',
      });

      return;
    }

    const heartbeatTimedOut = this.hasHeartbeatTimedOut(this.timeout_heartbeat);

    if (heartbeatTimedOut) {
      this.updateState({
        mqttConnected: true,
        esp32Online: false,
        currentStatus: statusgeralsistema.FALHA,
        lastError: `Timeout de heartbeat do ESP32. Limite: ${this.timeout_heartbeat} ms.`,
      });

      return;
    }

    this.updateState({
      mqttConnected: true,
      esp32Online: true,
      currentStatus: this.resolveOperationalStatus(),
      lastError: null,
    });
  }

  private hasHeartbeatTimedOut(timeoutMs: number): boolean {
    if (!this.state.lastHeartbeatAt) {
      return true;
    }

    const now = Date.now();
    const heartbeatlast = this.state.lastHeartbeatAt.getTime();

    return now - heartbeatlast > timeoutMs;
  }

  private resolveOperationalStatus(): statusgeralsistema {
    if (!this.state.mqttConnected) {
      return statusgeralsistema.FALHA;
    }

    if (!this.state.esp32Online) {
      return statusgeralsistema.FALHA;
    }

    if (this.state.currentStatus === statusgeralsistema.BLOQUEADO) {
      return statusgeralsistema.BLOQUEADO;
    }

    return statusgeralsistema.OPERACIONAL;
  }

  private updateState(partialState: Partial<HardwareState>): void {
    this.state = {
      ...this.state,
      ...partialState,
      updatedAt: new Date(),
    };
  }
}
