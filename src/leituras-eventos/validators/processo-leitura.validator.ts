import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { LEITURAS_EVENTOS_MESSAGES } from '../constants';

export interface ProcessoContext {
  id_processo: number | null;
}

export interface ProcessoTanqueContext {
  id_processo_tanque: number;
  id_processo: number | null;
}

export interface ProcessoTanqueSensorContext {
  id_processo_tanque_sensor: number;
  id_processo_tanque?: number | null;
  id_processo?: number | null;
  processo_tanque?: ProcessoTanqueContext | null;
}

export interface LeituraProcessoContext {
  id_leitura_sensor: number;
  id_processo_tanque_sensor: number;
  id_processo?: number | null;
  processo_tanque_sensor?: ProcessoTanqueSensorContext | null;
}

export interface EventoProcessoContext {
  id_evento_processo: number;
  id_processo: number;
  id_processo_tanque_sensor?: number | null;
  processo_tanque_sensor?: ProcessoTanqueSensorContext | null;
}

@Injectable()
export class ProcessoLeituraValidator {
  validateLeituraExists(
    leitura: LeituraProcessoContext | null | undefined,
  ): asserts leitura is LeituraProcessoContext {
    if (!leitura) {
      throw new NotFoundException(LEITURAS_EVENTOS_MESSAGES.LEITURA_NOT_FOUND);
    }
  }

  validateEventoExists(
    evento: EventoProcessoContext | null | undefined,
  ): asserts evento is EventoProcessoContext {
    if (!evento) {
      throw new NotFoundException(LEITURAS_EVENTOS_MESSAGES.EVENTO_NOT_FOUND);
    }
  }

  validateProcessSensorExists(
    processSensor: ProcessoTanqueSensorContext | null | undefined,
  ): asserts processSensor is ProcessoTanqueSensorContext {
    if (!processSensor) {
      throw new NotFoundException(
        LEITURAS_EVENTOS_MESSAGES.PROCESS_SENSOR_NOT_FOUND,
      );
    }
  }

  validateLeituraBelongsToProcess(
    leitura: LeituraProcessoContext | null | undefined,
    id_processo: number,
  ): void {
    this.validateLeituraExists(leitura);

    const leituraProcessId = this.extractProcessIdFromLeitura(leitura);

    if (
      !this.isPositiveInt(id_processo) ||
      leituraProcessId === null ||
      leituraProcessId !== id_processo
    ) {
      throw new ConflictException(
        LEITURAS_EVENTOS_MESSAGES.LEITURA_DOES_NOT_BELONG_TO_PROCESS,
      );
    }
  }

  validateEventoBelongsToProcess(
    evento: EventoProcessoContext | null | undefined,
    id_processo: number,
  ): void {
    this.validateEventoExists(evento);

    if (
      !this.isPositiveInt(id_processo) ||
      evento.id_processo !== id_processo
    ) {
      throw new ConflictException(
        LEITURAS_EVENTOS_MESSAGES.EVENTO_DOES_NOT_BELONG_TO_PROCESS,
      );
    }
  }

  validateProcessSensorBelongsToProcess(
    processSensor: ProcessoTanqueSensorContext | null | undefined,
    id_processo: number,
  ): void {
    this.validateProcessSensorExists(processSensor);

    const processSensorProcessId =
      this.extractProcessIdFromProcessSensor(processSensor);

    if (
      !this.isPositiveInt(id_processo) ||
      processSensorProcessId === null ||
      processSensorProcessId !== id_processo
    ) {
      throw new ConflictException(
        LEITURAS_EVENTOS_MESSAGES.PROCESS_SENSOR_NOT_FOUND,
      );
    }
  }

  extractProcessIdFromLeitura(leitura: LeituraProcessoContext): number | null {
    if (this.isPositiveInt(leitura.id_processo)) {
      return leitura.id_processo;
    }

    const processSensor = leitura.processo_tanque_sensor;

    if (this.isPositiveInt(processSensor?.id_processo)) {
      return processSensor.id_processo;
    }

    if (this.isPositiveInt(processSensor?.processo_tanque?.id_processo)) {
      return processSensor.processo_tanque.id_processo;
    }

    return null;
  }

  extractProcessIdFromProcessSensor(
    processSensor: ProcessoTanqueSensorContext,
  ): number | null {
    if (this.isPositiveInt(processSensor.id_processo)) {
      return processSensor.id_processo;
    }

    if (this.isPositiveInt(processSensor.processo_tanque?.id_processo)) {
      return processSensor.processo_tanque.id_processo;
    }

    return null;
  }

  isPositiveInt(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }
}
