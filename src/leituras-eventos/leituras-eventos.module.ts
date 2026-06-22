import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { LeiturasAnalyticsService } from './analytics';
import { LeiturasEventosController } from './leituras-eventos.controller';
import { LeiturasEventosService } from './leituras-eventos.service';
import {
  EventoMapper,
  GraficoVacuoMapper,
  LeituraMapper,
  TimelineMapper,
} from './mappers';
import { EventosRepository, LeiturasRepository } from './repositories';
import { ProcessoTimelineService } from './timeline';
import {
  LeiturasEventosQueryValidator,
  ProcessoLeituraValidator,
} from './validators';

@Module({
  imports: [PrismaModule],
  controllers: [LeiturasEventosController],
  providers: [
    LeiturasEventosService,
    LeiturasRepository,
    EventosRepository,
    LeituraMapper,
    EventoMapper,
    TimelineMapper,
    GraficoVacuoMapper,
    LeiturasAnalyticsService,
    ProcessoTimelineService,
    LeiturasEventosQueryValidator,
    ProcessoLeituraValidator,
  ],
  exports: [LeiturasEventosService, LeiturasRepository, EventosRepository],
})
export class LeiturasEventosModule {}
