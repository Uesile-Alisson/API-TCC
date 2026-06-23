import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  HistoricoAnalyticsService,
  HistoricoDashboardAnalyticsService,
} from './analytics';
import { HistoricoController } from './historico.controller';
import { HistoricoService } from './historico.service';
import {
  HistoricoAlarmeMapper,
  HistoricoDashboardMapper,
  HistoricoEventoMapper,
  HistoricoProcessoMapper,
  HistoricoRelatorioMapper,
  HistoricoTanqueComparisonMapper,
  HistoricoTanqueMapper,
  HistoricoVacuoChartMapper,
} from './mappers';
import {
  HistoricoDashboardRepository,
  HistoricoRepository,
} from './repositories';
import {
  HistoricoPermissionValidator,
  HistoricoProcessoValidator,
  HistoricoQueryValidator,
} from './validators';

@Module({
  imports: [PrismaModule],
  controllers: [HistoricoController],
  providers: [
    HistoricoService,
    HistoricoRepository,
    HistoricoDashboardRepository,
    HistoricoProcessoMapper,
    HistoricoTanqueMapper,
    HistoricoAlarmeMapper,
    HistoricoEventoMapper,
    HistoricoRelatorioMapper,
    HistoricoDashboardMapper,
    HistoricoVacuoChartMapper,
    HistoricoTanqueComparisonMapper,
    HistoricoAnalyticsService,
    HistoricoDashboardAnalyticsService,
    HistoricoQueryValidator,
    HistoricoProcessoValidator,
    HistoricoPermissionValidator,
  ],
  exports: [
    HistoricoService,
    HistoricoRepository,
    HistoricoDashboardRepository,
  ],
})
export class HistoricoModule {}
