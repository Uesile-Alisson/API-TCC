import { Injectable, Logger } from '@nestjs/common';
import { Prisma, statusgeralsistema } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessoGeneralClosureService } from '../../processos/lifecycle';
import { BombaHardwareStatusService } from '../bombas/bomba-hardware-status.service';
import { MqttConfigService } from '../config/mqtt-config.service';
import { Esp32StatusDTO } from '../dto/esp32-status.dto';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';
import { ValvulaHardwareStatusService } from '../valvulas/valvula-hardware-status.service';
import { MqttMessageHandler } from './interfaces/mqtt-message-handler.interface';
import { MqttStatusHandlerResult } from './interfaces/mqtt-handler-results.interfaces';

type CurrentSystemConfig = {
  id_configuracao_sistema: number;
  status_geral_sistema: statusgeralsistema;
};

// Retained MQTT status is a cached snapshot, not proof that the device was
// observed after a new safety command. Epoch keeps it usable as state while
// making it ineligible for freshness-based physical confirmation.
const UNCONFIRMED_RETAINED_OBSERVATION_AT = new Date(0);

@Injectable()
export class StatusHandler implements MqttMessageHandler<MqttStatusHandlerResult | null> {
  private readonly logger = new Logger(StatusHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqttConfigService: MqttConfigService,
    private readonly bombaHardwareStatusService: BombaHardwareStatusService,
    private readonly valvulaHardwareStatusService: ValvulaHardwareStatusService,
    private readonly processoGeneralClosureService: ProcessoGeneralClosureService,
  ) {}

  async handle(message: MqttMessage): Promise<MqttStatusHandlerResult | null> {
    const dto = this.validatePayload(message);
    const statusAt = this.resolveStatusDate(dto, message);
    const hardwareObservationAt = message.retain
      ? UNCONFIRMED_RETAINED_OBSERVATION_AT
      : message.receivedAt;

    await this.updateMqttLastSync();
    const [bombas, valvulas] = await Promise.all([
      this.bombaHardwareStatusService.processStatusPayload(
        dto.bombas,
        hardwareObservationAt,
      ),
      this.valvulaHardwareStatusService.processStatusPayload(
        dto.valvulas,
        hardwareObservationAt,
      ),
    ]);
    let emergencyStopReconciled = false;
    if (!message.retain) {
      await this.mqttConfigService.registerHardwareStatusSnapshot({
        topic: message.topic,
        payload: this.buildCanonicalSnapshotPayload(dto, statusAt),
        receivedAt: message.receivedAt,
        statusAt,
      });
      if (dto.emergencia_ativa === true) {
        emergencyStopReconciled = Boolean(
          await this.processoGeneralClosureService.reconcileControllerEmergency(
            {
              motivo:
                `Latch de emergencia reportado pelo controlador ${dto.device_id ?? 'nao identificado'}. ` +
                `Erro atual: ${dto.erro_atual ?? 'nao informado'}.`,
            },
          ),
        );
      }
    }
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
      bombas,
      valvulas,
      emergencyStopReconciled,
    });
  }

  private buildStatusHandlerResult(params: {
    dto: Esp32StatusDTO;
    message: MqttMessage;
    statusAt: Date;
    statusChanged: boolean;
    bombas: MqttStatusHandlerResult['bombas'];
    valvulas: MqttStatusHandlerResult['valvulas'];
    emergencyStopReconciled: boolean;
  }): MqttStatusHandlerResult {
    const {
      dto,
      message,
      statusAt,
      statusChanged,
      bombas,
      valvulas,
      emergencyStopReconciled,
    } = params;

    return {
      esp32_online: dto.esp32_on,
      status_geral_sistema: dto.status_geral,
      mensagem: dto.mensagem ?? null,
      device_id: dto.device_id ?? null,
      emergencia_ativa: dto.emergencia_ativa ?? false,
      erro_atual: dto.erro_atual ?? null,
      emergency_stop_reconciled: emergencyStopReconciled,
      status_em: statusAt,
      receivedAt: message.receivedAt,
      topic: message.topic,
      status_changed: statusChanged,
      bombas,
      valvulas,
    };
  }

  private validatePayload(message: MqttMessage): Esp32StatusDTO {
    return MqttPayloadValidator.validateStatus(message.payload);
  }

  private buildCanonicalSnapshotPayload(
    dto: Esp32StatusDTO,
    statusAt: Date,
  ): Prisma.InputJsonObject {
    return JSON.parse(
      JSON.stringify({
        ...dto,
        tipo: 'HARDWARE_STATUS',
        enviado_em: statusAt.toISOString(),
      }),
    ) as Prisma.InputJsonObject;
  }

  private resolveStatusDate(dto: Esp32StatusDTO, message: MqttMessage): Date {
    const value = dto.enviado_em;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = new Date(value);

      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return message.receivedAt;
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
