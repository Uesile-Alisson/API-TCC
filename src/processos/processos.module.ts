import { Module } from '@nestjs/common';
import { MqttCoreModule } from '../mqtt-hardware/mqtt-core.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProcessoEventService } from './events';
import { ProcessoAuxiliarCommandService } from './auxiliar/processo-auxiliar-command.service';
import { ProcessoAuxiliarRepository } from './auxiliar/processo-auxiliar.repository';
import { ProcessoAuxiliarSchedulerService } from './auxiliar/processo-auxiliar-scheduler.service';
import {
  ProcessoLifecycleModule,
  ProcessoGeneralClosureService,
  ProcessoTanqueClosureService,
} from './lifecycle';
import { ProcessoLogService } from './logs';
import { ProcessoMetricsService } from './metrics';
import {
  ProcessoMqttOrchestratorService,
  ProcessoStartupService,
} from './mqtt';
import { ProcessoPrecheckService } from './precheck';
import { ProcessosController } from './processos.controller';
import { ProcessosRepository } from './processos.repository';
import { ProcessosService } from './processos.service';
import { ProcessosSocketModule } from './socket';
import {
  ProcessoConfigValidator,
  ProcessoAuxiliarSafetyValidator,
  ProcessoSafetyValidator,
  ProcessoStartValidator,
  ProcessoStateValidator,
} from './validators';

@Module({
  imports: [
    PrismaModule,
    MqttCoreModule,
    ProcessoLifecycleModule,
    ProcessosSocketModule,
  ],
  controllers: [ProcessosController],
  providers: [
    ProcessosService,
    ProcessoAuxiliarCommandService,
    ProcessoAuxiliarRepository,
    ProcessoAuxiliarSchedulerService,
    ProcessoTanqueClosureService,
    ProcessoGeneralClosureService,
    ProcessosRepository,
    ProcessoEventService,
    ProcessoLogService,
    ProcessoMetricsService,
    ProcessoMqttOrchestratorService,
    ProcessoStartupService,
    ProcessoPrecheckService,
    ProcessoConfigValidator,
    ProcessoAuxiliarSafetyValidator,
    ProcessoStateValidator,
    ProcessoSafetyValidator,
    ProcessoStartValidator,
  ],
  exports: [
    ProcessosService,
    ProcessoAuxiliarCommandService,
    ProcessoAuxiliarSchedulerService,
    ProcessoTanqueClosureService,
    ProcessoGeneralClosureService,
    ProcessosRepository,
    ProcessoEventService,
    ProcessoLifecycleModule,
    ProcessoLogService,
    ProcessoMetricsService,
    ProcessoMqttOrchestratorService,
    ProcessoStartupService,
    ProcessoPrecheckService,
    ProcessosSocketModule,
    ProcessoConfigValidator,
    ProcessoAuxiliarSafetyValidator,
    ProcessoStateValidator,
    ProcessoSafetyValidator,
    ProcessoStartValidator,
  ],
})
export class ProcessosModule {}
