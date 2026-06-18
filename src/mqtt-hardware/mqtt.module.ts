import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MqttController } from './mqtt.controller';
import { MqttService } from './mqtt.service';
import { MqttConfigService } from './config/mqtt-config.service';
import { MqttClientService } from './connection/mqtt-client.service';
import { MqttHealthService } from './connection/mqtt-health.service';
import { MqttSocketGateway } from './socket/mqtt-socket.gateway';
import { CommandService } from './commands/command.service';
import {
  AcoplamentoContextCacheService,
  ReadingContextCacheService,
  SystemConfigCacheService,
} from './events/cache';
import {
  AcoplamentoAlarmClassifier,
  HardwareStatusAlarmClassifier,
  HeartbeatAlarmClassifier,
  ReadingAlarmClassifier,
} from './events/classifiers';
import {
  AcoplamentoEventHandler,
  AlarmEventHandler,
  HardwareStatusEventHandler,
  HeartbeatEventHandler,
  ReadingEventHandler,
} from './events/handlers';

@Module({
  imports: [PrismaModule],
  controllers: [MqttController],
  providers: [
    MqttService,
    MqttConfigService,
    MqttClientService,
    MqttHealthService,
    MqttSocketGateway,
    CommandService,
    SystemConfigCacheService,
    ReadingContextCacheService,
    AcoplamentoContextCacheService,
    AcoplamentoAlarmClassifier,
    ReadingAlarmClassifier,
    HardwareStatusAlarmClassifier,
    HeartbeatAlarmClassifier,
    AlarmEventHandler,
    AcoplamentoEventHandler,
    HardwareStatusEventHandler,
    HeartbeatEventHandler,
    ReadingEventHandler,
  ],

  exports: [
    MqttService,
    MqttConfigService,
    MqttClientService,
    MqttHealthService,
    MqttSocketGateway,
    CommandService,
    AlarmEventHandler,
    AcoplamentoEventHandler,
    HardwareStatusEventHandler,
    HeartbeatEventHandler,
    ReadingEventHandler,
  ],
})
export class MqttModule {}
