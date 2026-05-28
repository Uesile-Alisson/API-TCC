import { CreateMqttConfigDTO } from './create-mqtt-config.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateMqttConfigDTO extends PartialType(CreateMqttConfigDTO) {}
