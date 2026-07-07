import { Injectable, Logger } from '@nestjs/common';
import {
  leiturasensores,
  Prisma,
  sensores,
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

    if (this.isDiagnosticReading(dto)) {
      return await this.handleDiagnosticReading(dto, message);
    }

    const processoTanqueSensor = await this.findProcessTankSensor(
      this.getRequiredProcessTankSensorId(dto),
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

  private async findSensorByDiagnosticReference(
    dto: Esp32ReadingDTO,
  ): Promise<sensores | null> {
    if (Number.isInteger(dto.id_sensor)) {
      return await this.prisma.sensores.findUnique({
        where: {
          id_sensor: dto.id_sensor,
        },
      });
    }

    if (dto.codigo_hardware) {
      return await this.prisma.sensores.findUnique({
        where: {
          codigo_hardware: dto.codigo_hardware,
        },
      });
    }

    return null;
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
    const valor_vacuo = this.resolveVacuumValue(dto);
    const id_processo_tanque_sensor = this.getRequiredProcessTankSensorId(dto);

    return await this.prisma.$transaction(async (tx) => {
      const leitura = await tx.leiturasensores.create({
        data: {
          id_processo_tanque_sensor,
          tipo_leitura: tipoleiturasensor.VACUO,
          valor: valor_vacuo,
          valor_vacuo,
          unidade_medida: this.resolveReadingUnit(dto),
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

  private async handleDiagnosticReading(
    dto: Esp32ReadingDTO,
    message: MqttMessage,
  ): Promise<null> {
    const sensor = await this.findSensorByDiagnosticReference(dto);

    if (!sensor) {
      this.logIgnoredReading(
        `Sensor diagnÃ³stico nÃ£o encontrado. codigo_hardware=${dto.codigo_hardware ?? 'ausente'}; id_sensor=${dto.id_sensor ?? 'ausente'}`,
        message.topic,
      );

      return null;
    }

    if (sensor.excluido_em) {
      this.logIgnoredReading(
        `Sensor diagnÃ³stico ${sensor.id_sensor} estÃ¡ excluÃ­do.`,
        message.topic,
      );

      return null;
    }

    const leitura_em = this.resolveReadingDate(dto, message);
    const valor_vacuo = this.resolveVacuumValue(dto);

    await this.prisma.sensores.update({
      where: {
        id_sensor: sensor.id_sensor,
      },
      data: {
        ultimo_valor_lido: valor_vacuo,
        ultima_leitura: leitura_em,
        status_sensor: statussensor.ATIVO,
      },
    });

    this.logger.debug(
      `Leitura diagnÃ³stica MQTT registrada no estado do sensor. ` +
        `TÃ³pico: ${message.topic}. ` +
        `Sensor: ${sensor.id_sensor}. ` +
        `CÃ³digo hardware: ${sensor.codigo_hardware ?? 'nÃ£o informado'}. ` +
        `Valor: ${valor_vacuo.toString()}. ` +
        `Leitura em: ${leitura_em.toISOString()}.`,
    );

    return null;
  }

  private resolveReadingDate(dto: Esp32ReadingDTO, message: MqttMessage): Date {
    const value = dto.leitura_em ?? dto.timestamp;

    if (!value) {
      return message.receivedAt;
    }

    return value instanceof Date ? value : new Date(value);
  }

  private resolveVacuumValue(dto: Esp32ReadingDTO): Prisma.Decimal {
    return new Prisma.Decimal(dto.valor_vacuo ?? dto.valor ?? 0);
  }

  private resolveReadingUnit(dto: Esp32ReadingDTO): string {
    return dto.unidade_medida ?? dto.unidade ?? 'kPa';
  }

  private isDiagnosticReading(dto: Esp32ReadingDTO): boolean {
    return dto.modo === 'DIAGNOSTICO';
  }

  private getRequiredProcessTankSensorId(dto: Esp32ReadingDTO): number {
    const idProcessoTanqueSensor = dto.id_processo_tanque_sensor;

    if (!Number.isInteger(idProcessoTanqueSensor)) {
      throw new Error(
        'Leitura de processo sem id_processo_tanque_sensor apÃ³s validaÃ§Ã£o.',
      );
    }

    return idProcessoTanqueSensor as number;
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
