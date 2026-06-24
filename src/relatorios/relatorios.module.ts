import { Module } from '@nestjs/common';
import { MongoDbModule } from '../mongodb/mongodb.module';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AlarmPdfReportGenerator,
  PdfReportGenerator,
  ProcessPdfReportGenerator,
} from './generators/pdf';
import {
  ProcessXlsxReportGenerator,
  XlsxReportGenerator,
} from './generators/xlsx';
import {
  AlarmReportDataMapper,
  ProcessReportDataMapper,
  RelatorioMapper,
} from './mappers';
import { RelatoriosController } from './relatorios.controller';
import { RelatoriosService } from './relatorios.service';
import {
  RelatorioAlarmeDataRepository,
  RelatorioProcessoDataRepository,
  RelatoriosRepository,
} from './repositories';
import { GridFsReportStorageService, ReportFileService } from './storage';
import {
  RelatorioFileValidator,
  RelatorioGenerationValidator,
  RelatorioPermissionValidator,
  RelatorioQueryValidator,
} from './validators';

@Module({
  imports: [PrismaModule, MongoDbModule],
  controllers: [RelatoriosController],
  providers: [
    RelatoriosService,
    RelatoriosRepository,
    RelatorioProcessoDataRepository,
    RelatorioAlarmeDataRepository,
    RelatorioMapper,
    ProcessReportDataMapper,
    AlarmReportDataMapper,
    RelatorioQueryValidator,
    RelatorioGenerationValidator,
    RelatorioPermissionValidator,
    RelatorioFileValidator,
    PdfReportGenerator,
    ProcessPdfReportGenerator,
    AlarmPdfReportGenerator,
    XlsxReportGenerator,
    ProcessXlsxReportGenerator,
    ReportFileService,
    GridFsReportStorageService,
  ],
  exports: [RelatoriosService],
})
export class RelatoriosModule {}
