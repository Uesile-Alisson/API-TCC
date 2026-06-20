import { Module } from '@nestjs/common';
import { MqttModule } from '../mqtt-hardware/mqtt.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProcessoEventService } from './events';
import { ProcessoLifecycleService } from './lifecycle';
import { ProcessoLogService } from './logs';
import { ProcessoMetricsService } from './metrics';
import { ProcessoMqttOrchestratorService } from './mqtt';
import { ProcessosController } from './processos.controller';
import { ProcessosRepository } from './processos.repository';
import { ProcessosService } from './processos.service';
import { ProcessosSocketGateway } from './socket';
import {
  ProcessoConfigValidator,
  ProcessoSafetyValidator,
  ProcessoStartValidator,
  ProcessoStateValidator,
} from './validators';

@Module({
  imports: [PrismaModule, MqttModule],
  controllers: [ProcessosController],
  providers: [
    ProcessosService,
    ProcessosRepository,
    ProcessoEventService,
    ProcessoLifecycleService,
    ProcessoLogService,
    ProcessoMetricsService,
    ProcessoMqttOrchestratorService,
    ProcessosSocketGateway,
    ProcessoConfigValidator,
    ProcessoStateValidator,
    ProcessoSafetyValidator,
    ProcessoStartValidator,
  ],
  exports: [
    ProcessosService,
    ProcessosRepository,
    ProcessoEventService,
    ProcessoLifecycleService,
    ProcessoLogService,
    ProcessoMetricsService,
    ProcessoMqttOrchestratorService,
    ProcessosSocketGateway,
    ProcessoConfigValidator,
    ProcessoStateValidator,
    ProcessoSafetyValidator,
    ProcessoStartValidator,
  ],
})
export class ProcessosModule {}
