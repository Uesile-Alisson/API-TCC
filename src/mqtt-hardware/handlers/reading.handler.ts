import { Injectable, Logger } from '@nestjs/common';
import {
  leiturasensores,
  Prisma,
  sensores,
  statussensor,
  statusintegridadesensor,
  statuspartidaprocesso,
  statusprocesso,
  tipoleiturasensor,
  tiposensor,
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
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

    const assessed = await this.assessProcessReading(
      dto,
      message,
      processoTanqueSensor,
    );
    if (!assessed.valid) {
      await this.markSensorFault(
        processoTanqueSensor,
        assessed.status,
        assessed.reason,
        message.receivedAt,
      );
      this.logIgnoredReading(assessed.reason, message.topic);
      return null;
    }

    const leitura = await this.createReadingAndUpdateSensor(
      dto,
      message,
      processoTanqueSensor,
      assessed.rawValue,
      assessed.calibratedValue,
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
      id_processo_tanque:
        processoTanqueSensor.processostanques.id_processo_tanque,
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

    const sensor = processoTanqueSensor.sensores;
    if (
      (sensor.status_sensor !== undefined &&
        sensor.status_sensor !== statussensor.ATIVO) ||
      (sensor.status_integridade !== undefined &&
        sensor.status_integridade !== statusintegridadesensor.VALIDO) ||
      sensor.modo_calibracao_ativo ||
      (sensor.tipo_sensor === tiposensor.VACUO &&
        (sensor.calibrado_em === null ||
          (sensor.calibracao_valida_ate !== null &&
            sensor.calibracao_valida_ate <= new Date())))
    ) {
      this.logIgnoredReading(
        `Sensor ${sensor.id_sensor} nao esta calibrado, liberado e operacional.`,
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
    rawValue: Prisma.Decimal,
    calibratedValue: Prisma.Decimal,
  ): Promise<leiturasensores> {
    const leitura_em = this.resolveReadingDate(dto, message);
    const recebido_em = message.receivedAt;
    const valor_vacuo = calibratedValue;
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
          ultimo_valor_bruto: rawValue,
          ultima_leitura: leitura_em,
          integridade_validada_em: recebido_em,
          integridade_ultimo_erro: null,
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

    if (sensor.modo_calibracao_ativo === false) {
      this.logIgnoredReading(
        `Sensor diagnostico ${sensor.id_sensor} nao esta em modo de calibracao.`,
        message.topic,
      );
      return null;
    }

    const activeProcess = await this.prisma.processos?.findFirst?.({
      where: {
        OR: [
          {
            status_processo: {
              in: [statusprocesso.EM_EXECUCAO, statusprocesso.PAUSADO],
            },
          },
          { status_partida: statuspartidaprocesso.EM_ANDAMENTO },
        ],
      },
      select: { id_processo: true },
    });
    if (activeProcess) {
      this.logIgnoredReading(
        `Leitura diagnostica bloqueada pelo processo ativo ${activeProcess.id_processo}.`,
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
        ultimo_valor_bruto: valor_vacuo,
        ultima_leitura: leitura_em,
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

  private async assessProcessReading(
    dto: Esp32ReadingDTO,
    message: MqttMessage,
    link: ProcessoTanqueSensorWithRelations,
  ): Promise<ReadingIntegrityAssessment> {
    const sensor = link.sensores;
    const rawValue = this.resolveVacuumValue(dto);
    const calibratedValue = rawValue
      .mul(sensor.fator_calibracao ?? 1)
      .add(sensor.offset_calibracao ?? 0);
    const value = calibratedValue.toNumber();
    const raw = rawValue.toNumber();

    if (!Number.isFinite(raw) || !Number.isFinite(value)) {
      return this.invalidAssessment(
        rawValue,
        calibratedValue,
        statusintegridadesensor.LEITURA_IMPOSSIVEL,
        'Leitura impossivel: valor bruto ou calibrado nao finito.',
      );
    }

    const minimum = sensor.limite_minimo_operacional?.toNumber() ?? -110;
    const maximum = sensor.limite_maximo_operacional?.toNumber() ?? 10;
    if (value < minimum || value > maximum) {
      return this.invalidAssessment(
        rawValue,
        calibratedValue,
        statusintegridadesensor.FORA_FAIXA,
        `Leitura ${value} fora da faixa fisica configurada [${minimum}, ${maximum}].`,
      );
    }

    const readingAt = this.resolveReadingDate(dto, message);
    if (sensor.ultima_leitura && sensor.ultimo_valor_lido) {
      const elapsedSeconds =
        (readingAt.getTime() - sensor.ultima_leitura.getTime()) / 1000;
      const maximumRate = sensor.variacao_maxima_por_segundo?.toNumber() ?? 25;
      if (
        elapsedSeconds > 0.2 &&
        elapsedSeconds <= 30 &&
        Math.abs(value - sensor.ultimo_valor_lido.toNumber()) / elapsedSeconds >
          maximumRate
      ) {
        return this.invalidAssessment(
          rawValue,
          calibratedValue,
          statusintegridadesensor.MUDANCA_ABRUPTA,
          `Mudanca abrupta acima de ${maximumRate} unidades por segundo.`,
        );
      }
    }

    const stuckSeconds = Math.max(5, sensor.tempo_travado_segundos ?? 60);
    const recent = this.prisma.leiturasensores?.findMany
      ? await this.prisma.leiturasensores.findMany({
          where: {
            processostanquessensores: { id_sensor: sensor.id_sensor },
            tipo_leitura: tipoleiturasensor.VACUO,
            recebido_em: {
              gte: new Date(readingAt.getTime() - stuckSeconds * 1000),
              lte: readingAt,
            },
          },
          orderBy: [{ recebido_em: 'asc' }, { id_leitura_sensor: 'asc' }],
          take: 20,
          select: { valor_vacuo: true, valor: true, recebido_em: true },
        })
      : [];
    const values = recent
      .map((item) => (item.valor_vacuo ?? item.valor).toNumber())
      .concat(value);
    const precision = Math.max(sensor.precisao?.toNumber() ?? 0.01, 0.001);
    const coverageSeconds = recent.length
      ? (readingAt.getTime() - recent[0].recebido_em.getTime()) / 1000
      : 0;
    if (
      values.length >= 5 &&
      coverageSeconds >= stuckSeconds * 0.8 &&
      Math.max(...values) - Math.min(...values) <= precision
    ) {
      return this.invalidAssessment(
        rawValue,
        calibratedValue,
        statusintegridadesensor.TRAVADO,
        `Sensor sem variacao alem da precisao por ${Math.floor(coverageSeconds)}s.`,
      );
    }

    const oscillationThreshold = sensor.oscilacao_maxima?.toNumber() ?? 5;
    const tail = values.slice(-7);
    let directionChanges = 0;
    let previousDirection = 0;
    for (let index = 1; index < tail.length; index += 1) {
      const delta = tail[index] - tail[index - 1];
      const direction = Math.abs(delta) <= precision ? 0 : Math.sign(delta);
      if (
        direction !== 0 &&
        previousDirection !== 0 &&
        direction !== previousDirection
      ) {
        directionChanges += 1;
      }
      if (direction !== 0) {
        previousDirection = direction;
      }
    }
    if (
      tail.length >= 6 &&
      directionChanges >= 3 &&
      Math.max(...tail) - Math.min(...tail) >= oscillationThreshold
    ) {
      return this.invalidAssessment(
        rawValue,
        calibratedValue,
        statusintegridadesensor.OSCILANDO,
        `Oscilacao excessiva detectada (amplitude >= ${oscillationThreshold}).`,
      );
    }

    return { valid: true, rawValue, calibratedValue };
  }

  private invalidAssessment(
    rawValue: Prisma.Decimal,
    calibratedValue: Prisma.Decimal,
    status: InvalidIntegrityStatus,
    reason: string,
  ): ReadingIntegrityAssessment {
    return { valid: false, rawValue, calibratedValue, status, reason };
  }

  private async markSensorFault(
    link: ProcessoTanqueSensorWithRelations,
    status: InvalidIntegrityStatus,
    reason: string,
    occurredAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.sensores.update({
        where: { id_sensor: link.id_sensor },
        data: {
          status_sensor: statussensor.FALHA,
          status_integridade: status,
          integridade_ultimo_erro: reason,
          integridade_validada_em: occurredAt,
          liberado_em: null,
          id_usuario_liberacao: null,
        },
      });

      const activeAlarm = await tx.alarmes.findFirst({
        where: {
          id_processo: link.processostanques.id_processo,
          id_processo_tanque: link.id_processo_tanque,
          id_processo_tanque_sensor: link.id_processo_tanque_sensor,
          tipo_alarme: tipoalarme.SENSOR,
          status_alarme: statusalarme.ATIVO,
          excluido_em: null,
        },
        select: { id_alarme: true },
      });
      if (!activeAlarm) {
        await tx.alarmes.create({
          data: {
            id_processo: link.processostanques.id_processo,
            id_processo_tanque: link.id_processo_tanque,
            id_processo_tanque_sensor: link.id_processo_tanque_sensor,
            titulo: `Falha de integridade do sensor ${link.id_sensor}`,
            descricao: reason,
            tipo_alarme: tipoalarme.SENSOR,
            severidade: severidadealarme.CRITICO,
            status_alarme: statusalarme.ATIVO,
            origem_alarme: origemalarme.BACKEND,
            ocorrido_em: occurredAt,
            bloqueante: true,
            requer_intervencao: true,
            recuperacao_automatica: false,
          },
        });
      }
    });
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

type InvalidIntegrityStatus = Exclude<
  statusintegridadesensor,
  'VALIDO' | 'PENDENTE_CALIBRACAO'
>;

type ReadingIntegrityAssessment =
  | {
      valid: true;
      rawValue: Prisma.Decimal;
      calibratedValue: Prisma.Decimal;
    }
  | {
      valid: false;
      rawValue: Prisma.Decimal;
      calibratedValue: Prisma.Decimal;
      status: InvalidIntegrityStatus;
      reason: string;
    };
