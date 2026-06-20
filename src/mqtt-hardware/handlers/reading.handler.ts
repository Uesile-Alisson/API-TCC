import { Injectable, Logger } from '@nestjs/common';
import {
  leiturasensores,
  Prisma,
  statussensor,
  tipoleiturasensor,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Esp32ReadingDTO } from '../dto/esp32-reading.dto';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttPayloadValidator } from '../validators/mqtt-payload.validator';
import { MqttMessageHandler } from './interfaces/mqtt-message-handler.interface';
import { MqttReadingHandlerResult } from './interfaces/mqtt-handler-results.interfaces';

type ProcessoTanqueSensorWithRelations =
  Prisma.processostanquessensoresGetPayload<{
    include: {
      sensores: true;
      processostanques: {
        include: {
          processos: true;
          tanques: true;
        };
      };
    };
  }>;

@Injectable()
export class ReadingHandler implements MqttMessageHandler<MqttReadingHandlerResult | null> {
  private readonly logger = new Logger(ReadingHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(message: MqttMessage): Promise<MqttReadingHandlerResult | null> {
    const dto = this.validatePayload(message);

    const processoTanqueSensor = await this.findProcessTankSensor(
      dto.id_processo_tanque_sensor,
    );

    if (!processoTanqueSensor) {
      this.logIgnoredReading(
        `Vínculo processo/tanque/sensor ${dto.id_processo_tanque_sensor} não encontrado.`,
        message.topic,
      );

      return null;
    }

    if (!this.canRegisterReading(processoTanqueSensor, message.topic)) {
      return null;
    }

    const leitura = await this.createReadingAndUpdateSensor(
      dto,
      message,
      processoTanqueSensor,
    );

    this.logReadingCreated(leitura, processoTanqueSensor, dto, message.topic);
    return this.buildReadingHandlerResult(
      leitura,
      processoTanqueSensor,
      message.topic,
    );
  }

  private buildReadingHandlerResult(
    leitura: leiturasensores,
    processoTanqueSensor: ProcessoTanqueSensorWithRelations,
    topic: string,
  ): MqttReadingHandlerResult {
    return {
      id_leitura_sensor: leitura.id_leitura_sensor,
      id_processo_tanque_sensor: leitura.id_processo_tanque_sensor,
      id_processo: processoTanqueSensor.processostanques.id_processo,
      id_tanque: processoTanqueSensor.processostanques.id_tanque,
      id_sensor: processoTanqueSensor.id_sensor,
      valor_vacuo: this.decimalToNumber(leitura.valor_vacuo),
      leitura_em: leitura.leitura_em,
      recebido_em: leitura.recebido_em,
      topic,
    };
  }

  private validatePayload(message: MqttMessage): Esp32ReadingDTO {
    return MqttPayloadValidator.validateReading(message.payload);
  }

  private async findProcessTankSensor(
    id_processo_tanque_sensor: number,
  ): Promise<ProcessoTanqueSensorWithRelations | null> {
    return await this.prisma.processostanquessensores.findUnique({
      where: {
        id_processo_tanque_sensor,
      },
      include: {
        sensores: true,
        processostanques: {
          include: {
            processos: true,
            tanques: true,
          },
        },
      },
    });
  }

  private canRegisterReading(
    processoTanqueSensor: ProcessoTanqueSensorWithRelations,
    topic: string,
  ): boolean {
    if (!processoTanqueSensor.ativo) {
      this.logIgnoredReading(
        `Vínculo processo/tanque/sensor ${processoTanqueSensor.id_processo_tanque_sensor} está inativo.`,
        topic,
      );

      return false;
    }

    if (processoTanqueSensor.removido_em) {
      this.logIgnoredReading(
        `Vínculo processo/tanque/sensor ${processoTanqueSensor.id_processo_tanque_sensor} está removido.`,
        topic,
      );

      return false;
    }

    if (processoTanqueSensor.sensores.excluido_em) {
      this.logIgnoredReading(
        `Sensor: ${processoTanqueSensor.id_sensor} está excluído.`,
        topic,
      );

      return false;
    }

    return true;
  }

  private async createReadingAndUpdateSensor(
    dto: Esp32ReadingDTO,
    message: MqttMessage,
    processoTanqueSensor: ProcessoTanqueSensorWithRelations,
  ): Promise<leiturasensores> {
    const leitura_em = this.resolveReadingDate(dto, message);
    const recebido_em = message.receivedAt;
    const valor_vacuo = this.resolveVacuumValue(dto.valor_vacuo);

    return await this.prisma.$transaction(async (tx) => {
      const leitura = await tx.leiturasensores.create({
        data: {
          id_processo_tanque_sensor: dto.id_processo_tanque_sensor,
          tipo_leitura: tipoleiturasensor.VACUO,
          valor: valor_vacuo,
          valor_vacuo,
          unidade_medida: dto.unidade_medida,
          leitura_em,
          recebido_em,
        },
      });

      await tx.sensores.update({
        where: {
          id_sensor: processoTanqueSensor.id_sensor,
        },
        data: {
          ultimo_valor_lido: valor_vacuo,
          ultima_leitura: leitura_em,
          status_sensor: statussensor.ATIVO,
        },
      });

      return leitura;
    });
  }

  private resolveReadingDate(dto: Esp32ReadingDTO, message: MqttMessage): Date {
    return dto.leitura_em ?? message.receivedAt;
  }

  private resolveVacuumValue(valorVacuo: number): Prisma.Decimal {
    return new Prisma.Decimal(valorVacuo);
  }

  private decimalToNumber(value: Prisma.Decimal | number | null): number {
    if (value === null) {
      throw new Error('Valor de vácuo obrigatório não informado.');
    }

    if (typeof value === 'number') {
      return value;
    }

    return value.toNumber();
  }

  private logReadingCreated(
    leitura: leiturasensores,
    processoTanqueSensor: ProcessoTanqueSensorWithRelations,
    dto: Esp32ReadingDTO,
    topic: string,
  ): void {
    this.logger.debug(
      `Leitura MQTT registrada. ` +
        `ID leitura: ${leitura.id_leitura_sensor}. ` +
        `Tópico: ${topic}. ` +
        `Processo/tanque/sensor: ${dto.id_processo_tanque_sensor}. ` +
        `Processo: ${processoTanqueSensor.processostanques.id_processo}. ` +
        `Tanque: ${processoTanqueSensor.processostanques.id_tanque}. ` +
        `Sensor: ${processoTanqueSensor.id_sensor}. ` +
        `Valor vácuo: ${this.decimalToNumber(leitura.valor_vacuo)}. ` +
        `Leitura em: ${leitura.leitura_em.toISOString()}. ` +
        `Recebido em: ${leitura.recebido_em.toISOString()}.`,
    );
  }

  private logIgnoredReading(reason: string, topic: string): void {
    this.logger.warn(
      `Leitura MQTT ignorada. Motivo: ${reason}. Tópico: ${topic}.`,
    );
  }
}
