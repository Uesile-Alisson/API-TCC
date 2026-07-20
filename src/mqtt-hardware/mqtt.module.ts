import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProcessoLifecycleModule } from '../processos/lifecycle';
import { ProcessosModule } from '../processos/processos.module';
import { ProcessosSocketModule } from '../processos/socket';
import { MqttCoreModule } from './mqtt-core.module';
import { MqttController } from './mqtt.controller';
import { MqttService } from './mqtt.service';
import { MqttSocketGateway } from './socket/mqtt-socket.gateway';
import { MqttSocketService } from './socket/mqtt-socket.service';
import { BombaHardwareStatusService } from './bombas/bomba-hardware-status.service';
import { ValvulaHardwareStatusService } from './valvulas/valvula-hardware-status.service';
import { AcoplamentoMangueiraHandler } from './handlers/acoplamento-mangueira.handler';
import { AlarmsHandler } from './handlers/alarms.handler';
import { HandlersService } from './handlers/mqtt-handlers.service';
import { HeartbeatHandler } from './handlers/heartbeat.handler';
import { ReadingHandler } from './handlers/reading.handler';
import { StatusHandler } from './handlers/status.handler';
import { SensorIntegrityMonitorService } from './handlers/sensor-integrity-monitor.service';
import {
  ReadingContextCacheService,
  SystemConfigCacheService,
} from './events/cache';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    MqttCoreModule,
    ProcessosModule,
    ProcessoLifecycleModule,
    ProcessosSocketModule,
  ],
  controllers: [MqttController],
  providers: [
    MqttService,
    MqttSocketGateway,
    MqttSocketService,
    BombaHardwareStatusService,
    ValvulaHardwareStatusService,
    // Fluxo ativo que registra listeners no MqttClientService e roteia mensagens MQTT recebidas.
    HandlersService,
    ReadingHandler,
    SensorIntegrityMonitorService,
    StatusHandler,
    HeartbeatHandler,
    AlarmsHandler,
    AcoplamentoMangueiraHandler,
    SystemConfigCacheService,
    ReadingContextCacheService,
  ],

  exports: [
    MqttCoreModule,
    MqttService,
    SystemConfigCacheService,
    ReadingContextCacheService,
    MqttSocketGateway,
  ],
})
export class MqttModule {}
