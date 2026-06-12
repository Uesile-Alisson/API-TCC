import { Injectable, Logger } from '@nestjs/common';
import { StatusAcoplamentoMangueira } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';
import { MqttMessageHandler } from './interfaces/mqtt-message-handler.interface';
import { MqttAcoplamentoMangueiraHandlerResult } from './interfaces/mqtt-handler-results.interfaces';
import { Esp32AcoplamentoDTO } from '../dto/esp32-acoplamento.dto';

@Injectable()
export class AcoplamentoMangueiraHandler implements MqttMessageHandler<MqttAcoplamentoMangueiraHandlerResult | null> {
  private readonly logger = new Logger(AcoplamentoMangueiraHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(
    message: MqttMessage,
  ): Promise<MqttAcoplamentoMangueiraHandlerResult | null> {
    const dto = MqttPayloadValidator.validateAcoplamentos(message.payload);

    const novoStatus = this.resolveStatusAcoplamento(dto.sinal_detectado);
    const verificadoEm = dto.verificado_em ?? message.receivedAt;

    const sensorAcoplamento =
      await this.prisma.sensoresacoplamentomangueiras.findUnique({
        where: {
          id_sensor: dto.id_sensor,
        },
      });

    if (!sensorAcoplamento) {
      this.logger.warn(
        `Mensagem de acoplamento ignorada. Sensor ${dto.id_sensor} não está cadastrado em SensoresAcoplamentoMangueira.`,
      );

      return null;
    }

    if (!sensorAcoplamento.ativo) {
      this.logger.warn(
        `Mensagem de acoplamento ignorada. Sensor ${dto.id_sensor} está inativo.`,
      );

      return null;
    }

    if (sensorAcoplamento.id_tanque !== dto.id_tanque) {
      this.logger.warn(
        `Mensagem de acoplamento ignorada por divergência de tanque.` +
          `Sensor ${dto.id_sensor}. Banco: tanque ${sensorAcoplamento.id_tanque}` +
          `Payload: tanque ${dto.id_tanque}`,
      );

      return null;
    }

    const statusAnterior = sensorAcoplamento.status_acoplamento;
    const statusMudou = statusAnterior !== novoStatus;

    await this.prisma.sensoresacoplamentomangueiras.update({
      where: {
        id_sensor: dto.id_sensor,
      },
      data: {
        sinal_detectado: dto.sinal_detectado,
        status_acoplamento: novoStatus,
        ultima_verificacao: verificadoEm,
        ultimo_evento_em: statusMudou ? verificadoEm : undefined,
        atualizado_em: new Date(),
      },
    });

    this.logStatusUpdate({
      idSensor: dto.id_sensor,
      idTanque: dto.id_tanque,
      sinalDetectado: dto.sinal_detectado,
      statusAnterior,
      novoStatus,
      statusMudou,
    });

    return this.buildAcoplamentoHandlerResult({
      dto,
      novoStatus,
      verificadoEm,
      message,
      statusMudou,
      statusAnterior,
    });
  }

  private buildAcoplamentoHandlerResult(params: {
    dto: Esp32AcoplamentoDTO;
    novoStatus: StatusAcoplamentoMangueira;
    statusAnterior: StatusAcoplamentoMangueira;
    verificadoEm: Date;
    message: MqttMessage;
    statusMudou: boolean;
  }): MqttAcoplamentoMangueiraHandlerResult {
    const {
      dto,
      novoStatus,
      verificadoEm,
      message,
      statusAnterior,
      statusMudou,
    } = params;

    return {
      id_sensor: dto.id_sensor,
      id_tanque: dto.id_tanque,
      sinal_detectado: dto.sinal_detectado,
      status_acoplamento: novoStatus,
      verificado_em: verificadoEm,
      topic: message.topic,
      receivedAt: message.receivedAt,
      status_anterior: statusAnterior,
      status_mudou: statusMudou,
    };
  }

  private resolveStatusAcoplamento(
    sinalDetectado: boolean,
  ): StatusAcoplamentoMangueira {
    return sinalDetectado
      ? StatusAcoplamentoMangueira.ACOPLADA
      : StatusAcoplamentoMangueira.DESACOPLADA;
  }

  private logStatusUpdate(params: {
    idSensor: number;
    idTanque: number;
    sinalDetectado: boolean;
    statusAnterior: StatusAcoplamentoMangueira;
    novoStatus: StatusAcoplamentoMangueira;
    statusMudou: boolean;
  }): void {
    const {
      idSensor,
      idTanque,
      sinalDetectado,
      statusAnterior,
      novoStatus,
      statusMudou,
    } = params;

    if (statusMudou) {
      this.logger.warn(
        `Status de acoplamento alterado. Sensor ${idSensor}, tanque${idTanque}:` +
          `${statusAnterior} -> ${novoStatus}. Sinal detectado: ${sinalDetectado}`,
      );

      return;
    }

    this.logger.debug(
      `Acoplamento verificado sem alteração.Sensor ${idSensor}, tanque${idTanque}:` +
        `${statusAnterior} -> ${novoStatus}. Sinal detectado: ${sinalDetectado}`,
    );
  }
}
