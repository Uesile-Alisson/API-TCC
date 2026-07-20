import { BadRequestException } from '@nestjs/common';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { TopicMatcher } from '../topics/topic-matcher';
import { Esp32AlarmDTO } from '../dto/esp32-alarm.dto';
import { Esp32HeartbeatDTO } from '../dto/esp32-heartbeat.dto';
import { Esp32ReadingDTO } from '../dto/esp32-reading.dto';
import {
  Esp32StatusDTO,
  Esp32StatusPumpDTO,
  Esp32StatusValveDTO,
} from '../dto/esp32-status.dto';
import { Esp32AcoplamentoDTO } from '../dto/esp32-acoplamento.dto';
import { Esp32CommandAckDTO } from '../dto/esp32-command-ack.dto';

export class MqttPayloadValidator {
  static validateByTopic(
    message: MqttMessage,
  ):
    | Esp32AlarmDTO
    | Esp32HeartbeatDTO
    | Esp32ReadingDTO
    | Esp32StatusDTO
    | Esp32AcoplamentoDTO
    | Esp32CommandAckDTO {
    if (TopicMatcher.isLeitura(message.topic)) {
      return this.validateDto(Esp32ReadingDTO, message.payload);
    }

    if (TopicMatcher.isStatus(message.topic)) {
      return this.validateStatus(message.payload);
    }

    if (TopicMatcher.isAlarme(message.topic)) {
      return this.validateDto(Esp32AlarmDTO, message.payload);
    }

    if (TopicMatcher.isHeartbeat(message.topic)) {
      return this.validateDto(Esp32HeartbeatDTO, message.payload);
    }

    if (TopicMatcher.isAcoplamento(message.topic)) {
      return this.validateDto(Esp32AcoplamentoDTO, message.payload);
    }

    if (TopicMatcher.isAck(message.topic)) {
      return this.validateDto(Esp32CommandAckDTO, message.payload);
    }

    throw new BadRequestException(
      `Tópico MQTT não reconhecido: ${message.topic}`,
    );
  }

  static validateReading(payload: Record<string, unknown>): Esp32ReadingDTO {
    const dto = this.validateDto(Esp32ReadingDTO, payload);
    const modo = dto.modo ?? 'PROCESSO';
    const isDiagnostic = modo === 'DIAGNOSTICO';
    const hasSensorReference =
      typeof dto.codigo_hardware === 'string' ||
      Number.isInteger(dto.id_sensor);
    const hasValue =
      typeof dto.valor_vacuo === 'number' || typeof dto.valor === 'number';
    const hasUnit =
      typeof dto.unidade_medida === 'string' || typeof dto.unidade === 'string';

    if (isDiagnostic && !hasSensorReference) {
      throw new BadRequestException({
        message: 'Payload MQTT invÃ¡lido.',
        errors: ['Leitura diagnÃ³stica exige codigo_hardware ou id_sensor.'],
      });
    }

    if (!isDiagnostic && !Number.isInteger(dto.id_processo_tanque_sensor)) {
      throw new BadRequestException({
        message: 'Payload MQTT invÃ¡lido.',
        errors: ['Leitura de processo exige id_processo_tanque_sensor.'],
      });
    }

    if (!hasValue) {
      throw new BadRequestException({
        message: 'Payload MQTT invÃ¡lido.',
        errors: ['Leitura MQTT exige valor_vacuo ou valor.'],
      });
    }

    if (!hasUnit) {
      throw new BadRequestException({
        message: 'Payload MQTT invÃ¡lido.',
        errors: ['Leitura MQTT exige unidade_medida ou unidade.'],
      });
    }

    return dto;
  }

  static validateAlarm(payload: Record<string, unknown>): Esp32AlarmDTO {
    return this.validateDto(Esp32AlarmDTO, payload);
  }

  static validateStatus(payload: Record<string, unknown>): Esp32StatusDTO {
    const dto = this.validateDto(Esp32StatusDTO, payload);

    if (dto.schema_version === 2) {
      if (dto.tipo !== 'HARDWARE_STATUS') {
        throw new BadRequestException({
          message: 'Payload MQTT invÃ¡lido.',
          errors: ['Status MQTT v2 exige tipo igual a HARDWARE_STATUS.'],
        });
      }

      if (!Array.isArray(dto.valvulas)) {
        throw new BadRequestException({
          message: 'Payload MQTT invÃ¡lido.',
          errors: ['Status MQTT v2 exige valvulas como lista.'],
        });
      }

      if (!Array.isArray(dto.bombas)) {
        throw new BadRequestException({
          message: 'Payload MQTT invÃ¡lido.',
          errors: ['Status MQTT v2 exige bombas como lista.'],
        });
      }
    }

    if (Array.isArray(dto.valvulas)) {
      dto.valvulas = dto.valvulas.map((valvula) =>
        this.validateDto(
          Esp32StatusValveDTO,
          valvula as unknown as Record<string, unknown>,
        ),
      );
    }

    if (Array.isArray(dto.bombas)) {
      dto.bombas = dto.bombas.map((bomba) =>
        this.validateDto(
          Esp32StatusPumpDTO,
          bomba as unknown as Record<string, unknown>,
        ),
      );
    }

    return dto;
  }

  static validateHeartbeat(
    payload: Record<string, unknown>,
  ): Esp32HeartbeatDTO {
    return this.validateDto(Esp32HeartbeatDTO, payload);
  }

  static validateAcoplamentos(
    payload: Record<string, unknown>,
  ): Esp32AcoplamentoDTO {
    return this.validateDto(Esp32AcoplamentoDTO, payload);
  }

  static validateCommandAck(
    payload: Record<string, unknown>,
  ): Esp32CommandAckDTO {
    return this.validateDto(Esp32CommandAckDTO, payload);
  }

  private static validateDto<T extends object>(
    dtoClass: ClassConstructor<T>,
    payload: Record<string, unknown>,
  ): T {
    const dtoInstance = plainToInstance(dtoClass, payload);

    const erros = validateSync(dtoInstance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });

    if (erros.length > 0) {
      throw new BadRequestException({
        message: 'Payload MQTT inválido.',
        errors: this.formatValidationErrors(erros),
      });
    }

    return dtoInstance;
  }

  private static formatValidationErrors(erros: ValidationError[]): string[] {
    return erros.flatMap((error) => {
      const constraints = error.constraints
        ? Object.values(error.constraints)
        : [];

      const children = error.children?.length
        ? this.formatValidationErrors(error.children)
        : [];

      return [...constraints, ...children];
    });
  }
}
