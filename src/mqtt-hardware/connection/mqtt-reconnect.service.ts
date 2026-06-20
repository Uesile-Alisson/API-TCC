import { Injectable, Logger } from '@nestjs/common';
import { MqttClientService } from './mqtt-client.service';
import { MqttOperationResult } from '../interfaces/mqtt-operation-result.interface';

@Injectable()
export class MqttReconnectService {
  private readonly logger = new Logger(MqttReconnectService.name);
  private isReconnecting = false;
  constructor(private readonly mqttClientService: MqttClientService) {}

  async reconnectNow(): Promise<MqttOperationResult> {
    if (this.isReconnecting) {
      return {
        success: false,
        message: 'Reconexão MQTT já está em andamento.',
        timestamp: new Date(),
      };
    }

    this.isReconnecting = true;

    try {
      this.logger.warn('Iniciando reconexão MQTT manual.');

      const result = await this.mqttClientService.reconnect();

      if (result.success) {
        this.logger.log('Reconexão MQTT concluída com sucesso');
      } else {
        this.logger.warn(
          `Reconexão MQTT finalizada com falha: ${result.message}`,
        );
      }

      return result;
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      this.logger.error(`Erro durante reconexão MQTT manual: ${errorMessage}`);

      return {
        success: false,
        message: 'Erro durante reconexão MQTT manual.',
        error: errorMessage,
        timestamp: new Date(),
      };
    } finally {
      this.isReconnecting = false;
    }
  }

  getReconnectState(): {
    isReconnecting: boolean;
  } {
    return {
      isReconnecting: this.isReconnecting,
    };
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Erro desconhecido';
  }
}
