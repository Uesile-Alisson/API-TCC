import { BadRequestException } from '@nestjs/common';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { TopicMatcher } from '../topics/topic-matcher';
import { Esp32AlarmDTO } from '../dto/esp32-alarm.dto';
import { Esp32HeartbeatDTO } from '../dto/esp32-heartbeat.dto';
import { Esp32ReadingDTO } from '../dto/esp32-reading.dto';
import { Esp32StatusDTO } from '../dto/esp32-status.dto';

export class MqttPayloadValidator {
    static validateByTopic(message: MqttMessage): Esp32AlarmDTO | Esp32HeartbeatDTO | Esp32ReadingDTO | Esp32StatusDTO {
        if (TopicMatcher.isLeitura(message.topic)) {
            return this.va
        }
    }

    
}