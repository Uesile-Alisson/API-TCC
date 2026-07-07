import { BadRequestException } from '@nestjs/common';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { TopicMatcher } from '../topics/topic-matcher';
import { Esp32AlarmDTO } from '../dto/esp32-alarm.dto';
import { Esp32HeartbeatDTO } from '../dto/esp32-heartbeat.dto';
import { Esp32ReadingDTO } from '../dto/esp32-reading.dto';
import { Esp32StatusDTO } from '../dto/esp32-status.dto';
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
      return this.validateDto(Esp32StatusDTO, message.payload);
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
    return this.validateDto(Esp32ReadingDTO, payload);
  }

  static validateAlarm(payload: Record<string, unknown>): Esp32AlarmDTO {
    return this.validateDto(Esp32AlarmDTO, payload);
  }

  static validateStatus(payload: Record<string, unknown>): Esp32StatusDTO {
    return this.validateDto(Esp32StatusDTO, payload);
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
