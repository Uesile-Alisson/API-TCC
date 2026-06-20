import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MqttController } from './mqtt.controller';
import { MqttService } from './mqtt.service';
import { MqttConfigService } from './config/mqtt-config.service';
import { MqttClientService } from './connection/mqtt-client.service';
import { MqttHealthService } from './connection/mqtt-health.service';
import { MqttSocketGateway } from './socket/mqtt-socket.gateway';
import { MqttSocketService } from './socket/mqtt-socket.service';
import { CommandService } from './commands/command.service';
import { AcoplamentoMangueiraHandler } from './handlers/acoplamento-mangueira.handler';
import { AlarmsHandler } from './handlers/alarms.handler';
import { HandlersService } from './handlers/mqtt-handlers.service';
import { HeartbeatHandler } from './handlers/heartbeat.handler';
import { ReadingHandler } from './handlers/reading.handler';
import { StatusHandler } from './handlers/status.handler';
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
    MqttSocketService,
    CommandService,
    // Fluxo ativo que registra listeners no MqttClientService e roteia mensagens MQTT recebidas.
    HandlersService,
    ReadingHandler,
    StatusHandler,
    HeartbeatHandler,
    AlarmsHandler,
    AcoplamentoMangueiraHandler,
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
