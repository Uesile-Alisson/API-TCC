import { Injectable, Logger } from '@nestjs/common';
import { statusgeralsistema } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MqttConfigService } from '../config/mqtt-config.service';
import { Esp32StatusDTO } from '../dto/esp32-status.dto';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';
import { MqttMessageHandler } from './interfaces/mqtt-message-handler.interface';
import { MqttStatusHandlerResult } from './interfaces/mqtt-handler-results.interfaces';

type CurrentSystemConfig = {
  id_configuracao_sistema: number;
  status_geral_sistema: statusgeralsistema;
};

@Injectable()
export class StatusHandler implements MqttMessageHandler<MqttStatusHandlerResult | null> {
  private readonly logger = new Logger(StatusHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttConfigService: MqttConfigService,
  ) {}

  async handle(message: MqttMessage): Promise<MqttStatusHandlerResult | null> {
    const dto = this.validatePayload(message);
    const statusAt = this.resolveStatusDate(dto, message);

    await this.updateMqttLastSync();
    const currentSystemConfig = await this.findcurrentSystemConfig();

    if (!currentSystemConfig) {
      this.logIgnoredStatus(
        `Nenhuma configuração do sistema foi encontrada para atualizar o status geral.`,
        message.topic,
      );

      return null;
    }

    const statusChanged = await this.updateSystemStatusIfNeeded(
      currentSystemConfig,
      dto.status_geral,
    );

    this.logStatusProcessed({
      dto,
      topic: message.topic,
      receivedAt: message.receivedAt,
      statusAt,
      previousStatus: currentSystemConfig.status_geral_sistema,
      statusChanged,
    });

    return this.buildStatusHandlerResult({
      dto,
      message,
      statusAt,
      statusChanged,
    });
  }

  private buildStatusHandlerResult(params: {
    dto: Esp32StatusDTO;
    message: MqttMessage;
    statusAt: Date;
    statusChanged: boolean;
  }): MqttStatusHandlerResult {
    const { dto, message, statusAt, statusChanged } = params;

    return {
      status_geral_sistema: dto.status_geral,
      mensagem: dto.mensagem ?? null,
      device_id: dto.device_id ?? null,
      status_em: statusAt,
      receivedAt: message.receivedAt,
      topic: message.topic,
      status_changed: statusChanged,
    };
  }

  private validatePayload(message: MqttMessage): Esp32StatusDTO {
    return MqttPayloadValidator.validateStatus(message.payload);
  }

  private resolveStatusDate(dto: Esp32StatusDTO, message: MqttMessage): Date {
    return dto.enviado_em ?? message.receivedAt;
  }

  private async updateMqttLastSync(): Promise<void> {
    await this.mqttConfigService.updateLastSync();
  }

  private async findcurrentSystemConfig(): Promise<CurrentSystemConfig | null> {
    return await this.prisma.configuracoessistema.findFirst({
      orderBy: {
        id_configuracao_sistema: 'desc',
      },
      select: {
        id_configuracao_sistema: true,
        status_geral_sistema: true,
      },
    });
  }

  private async updateSystemStatusIfNeeded(
    currentSystemConfig: CurrentSystemConfig,
    newStatus: statusgeralsistema | undefined,
  ): Promise<boolean> {
    if (currentSystemConfig.status_geral_sistema === newStatus) {
      return false;
    }

    await this.prisma.configuracoessistema.update({
      where: {
        id_configuracao_sistema: currentSystemConfig.id_configuracao_sistema,
      },
      data: {
        status_geral_sistema: newStatus,
        atualizado_em: new Date(),
      },
    });

    return true;
  }

  private logStatusProcessed(params: {
    dto: Esp32StatusDTO;
    topic: string;
    receivedAt: Date;
    statusAt: Date;
    previousStatus: statusgeralsistema;
    statusChanged: boolean;
  }): void {
    const { dto, topic, receivedAt, statusAt, previousStatus, statusChanged } =
      params;

    if (statusChanged) {
      this.logger.warn(
        `Status geral do sistema atualizado via MQTT. ` +
          `Tópico: ${topic}. ` +
          `Status anterior: ${String(previousStatus)}. ` +
          `Novo status: ${String(dto.status_geral)}. ` +
          `Mensagem: ${dto.mensagem ?? 'não informada'}. ` +
          `Dispositivo: ${dto.device_id ?? 'não informado'}. ` +
          `Status em: ${statusAt.toISOString()}. ` +
          `Recebido em: ${receivedAt.toISOString()}.`,
      );

      return;
    }

    this.logger.debug(
      `Status geral recebido sem alteração. ` +
        `Tópico: ${topic}. ` +
        `Status: ${String(dto.status_geral)}. ` +
        `Mensagem: ${dto.mensagem ?? 'não informada'}. ` +
        `Dispositivo: ${dto.device_id ?? 'não informado'}. ` +
        `Status em: ${statusAt.toISOString()}. ` +
        `Recebido em: ${receivedAt.toISOString()}.`,
    );
  }

  private logIgnoredStatus(reason: string, topic: string): void {
    this.logger.warn(
      `Status MQTT ignorado. Motivo: ${reason}. Tópico: ${topic}.`,
    );
  }
}
