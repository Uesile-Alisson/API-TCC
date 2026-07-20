import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProcessoLifecycleService } from './processo-lifecycle.service';
import { ProcessoTanqueMonitorService } from './processo-tanque-monitor.service';
import { ProcessoTanqueStagnationService } from './processo-tanque-stagnation.service';

@Module({
  imports: [PrismaModule],
  providers: [
    ProcessoLifecycleService,
    ProcessoTanqueMonitorService,
    ProcessoTanqueStagnationService,
  ],
  exports: [
    ProcessoLifecycleService,
    ProcessoTanqueMonitorService,
    ProcessoTanqueStagnationService,
  ],
})
export class ProcessoLifecycleModule {}
