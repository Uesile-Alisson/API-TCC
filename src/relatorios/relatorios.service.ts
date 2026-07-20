import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  formatorelatorio,
  nivelacesso,
  Prisma,
  tiporelatorio,
} from '@prisma/client';
import {
  RELATORIO_DEFAULT_LIMIT,
  RELATORIO_DEFAULT_PAGE,
  RELATORIO_MAX_LIMIT,
  RELATORIO_MESSAGES,
} from './constants';
import type {
  GenerateAlarmReportDto,
  GenerateProcessReportDto,
  ListRelatoriosQueryDto,
} from './dto';
import type {
  GeneratedReportFile,
  RelatorioGenerationContext,
  RelatorioGenerationResult,
  RelatorioListResponse,
  RelatorioResponse,
  ReportDownloadResult,
  ReportPreviewResult,
  SingleRelatorioGenerationResult,
} from './interfaces';
import {
  AlarmReportDataMapper,
  ProcessReportDataMapper,
  RelatorioMapper,
} from './mappers';
import {
  RelatorioAlarmeDataRepository,
  RelatorioProcessoDataRepository,
  RelatoriosRepository,
} from './repositories';
import type {
  CompleteAlarmReportSource,
  CompleteProcessReportSource,
  RelatorioFileMetadataRecord,
} from './repositories';
import {
  AlarmPdfReportGenerator,
  ProcessPdfReportGenerator,
} from './generators/pdf';
import { ProcessXlsxReportGenerator } from './generators/xlsx';
import { GridFsReportStorageService } from './storage';
import {
  RelatorioFileValidator,
  RelatorioGenerationValidator,
  RelatorioPermissionValidator,
  RelatorioQueryValidator,
} from './validators';

const SYSTEM_GENERATOR_NAME = 'Sistema TSEA';
const REPORT_PERSISTENCE_ERROR_MESSAGE = 'Falha ao persistir relatorio gerado.';
const REPORT_GENERATION_ERROR_MESSAGE = 'Falha ao gerar relatorio.';
const REPORT_ORPHAN_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export interface AuthenticatedRelatoriosUser {
  id_usuario: number;
  nome?: string | null;
  nivel_acesso: nivelacesso;
}

interface BuildGenerationContextParams {
  user: AuthenticatedRelatoriosUser;
  observacao?: string | null;
  gerado_em: Date;
}

interface PersistGeneratedReportParams {
  generatedFile: GeneratedReportFile;
  tipo_relatorio: tiporelatorio;
  formato_relatorio: formatorelatorio;
  id_usuario: number;
  id_processo?: number | null;
  id_alarme?: number | null;
  titulo: string;
  descricao?: string | null;
  gerado_em: Date;
}

@Injectable()
export class RelatoriosService {
  private readonly logger = new Logger(RelatoriosService.name);

  constructor(
    private readonly relatoriosRepository: RelatoriosRepository,
    private readonly relatorioProcessoDataRepository: RelatorioProcessoDataRepository,
    private readonly relatorioAlarmeDataRepository: RelatorioAlarmeDataRepository,
    private readonly relatorioMapper: RelatorioMapper,
    private readonly processReportDataMapper: ProcessReportDataMapper,
    private readonly alarmReportDataMapper: AlarmReportDataMapper,
    private readonly relatorioQueryValidator: RelatorioQueryValidator,
    private readonly relatorioGenerationValidator: RelatorioGenerationValidator,
    private readonly relatorioPermissionValidator: RelatorioPermissionValidator,
    private readonly relatorioFileValidator: RelatorioFileValidator,
    private readonly processPdfReportGenerator: ProcessPdfReportGenerator,
    private readonly alarmPdfReportGenerator: AlarmPdfReportGenerator,
    private readonly processXlsxReportGenerator: ProcessXlsxReportGenerator,
    private readonly gridFsReportStorageService: GridFsReportStorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'relatorios-gridfs-orphan-reconciliation',
    waitForCompletion: true,
    disabled: process.env.NODE_ENV === 'test',
  })
  async reconcileOrphanedReportFiles(
    now: Date = new Date(),
  ): Promise<{
    scanned: number;
    preserved: number;
    deleted: number;
    failed: number;
  }> {
    const uploadedBefore = new Date(
      now.getTime() - REPORT_ORPHAN_GRACE_PERIOD_MS,
    );
    const candidates =
      await this.gridFsReportStorageService.findManagedFilesUploadedBefore(
        uploadedBefore,
      );
    const result = {
      scanned: candidates.length,
      preserved: 0,
      deleted: 0,
      failed: 0,
    };

    for (const candidate of candidates) {
      try {
        const isReferenced =
          await this.relatoriosRepository.existsByGridFsFileId(
            candidate.gridfs_file_id,
          );

        if (isReferenced) {
          result.preserved += 1;
          continue;
        }

        const deletion = await this.gridFsReportStorageService.deleteReportFile(
          {
            gridfs_file_id: candidate.gridfs_file_id,
            bucket_name: candidate.bucket_name,
          },
        );

        if (deletion.deleted) {
          result.deleted += 1;
        }
      } catch (error) {
        result.failed += 1;
        this.logger.error(
          `Falha ao reconciliar arquivo de relatório ${candidate.gridfs_file_id}.`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return result;
  }

  async listRelatorios(
    query: ListRelatoriosQueryDto,
    user: AuthenticatedRelatoriosUser,
  ): Promise<RelatorioListResponse> {
    this.relatorioPermissionValidator.validateCanList(user.nivel_acesso);
    this.relatorioQueryValidator.validateListQuery(query);
    this.relatorioQueryValidator.validateRestrictedFilters({
      query,
      nivel_acesso: user.nivel_acesso,
    });

    const result = await this.relatoriosRepository.findMany(query);

    return this.relatorioMapper.toListResponse({
      records: result.data,
      total: result.total,
      page: this.resolvePage(query.page),
      limit: this.resolveLimit(query.limit),
    });
  }

  async getRelatorioById(
    id_relatorio: number,
    user: AuthenticatedRelatoriosUser,
  ): Promise<RelatorioResponse> {
    this.relatorioPermissionValidator.validateCanView(user.nivel_acesso);

    const record = await this.relatoriosRepository.findById(id_relatorio);

    if (!record) {
      throw new NotFoundException(RELATORIO_MESSAGES.GENERAL.NOT_FOUND);
    }

    return this.relatorioMapper.toResponse(record);
  }

  async generateProcessReports(
    id_processo: number,
    dto: GenerateProcessReportDto,
    user: AuthenticatedRelatoriosUser,
  ): Promise<RelatorioGenerationResult> {
    this.relatorioPermissionValidator.validateCanGenerateProcessReport(
      user.nivel_acesso,
    );

    const formatos = this.resolveProcessReportFormats(dto);
    const source =
      await this.relatorioProcessoDataRepository.findCompleteProcessReportSource(
        id_processo,
      );
    const duplicatedFormats = await this.findDuplicatedProcessFormats(
      id_processo,
      formatos,
    );

    this.relatorioGenerationValidator.validateProcessReportGeneration({
      source,
      formatos,
      duplicatedFormats,
    });

    const processoSource = this.requireProcessSource(source);
    const geradoEm = new Date();
    const contextoGeracao = this.buildGenerationContext({
      user,
      observacao: dto.observacao ?? null,
      gerado_em: geradoEm,
    });
    const reportData = this.processReportDataMapper.toReportData({
      source: processoSource,
      contexto_geracao: contextoGeracao,
    });
    const relatorios: RelatorioResponse[] = [];

    for (const formato of formatos) {
      const generatedFile = await this.generateProcessReportFile(
        formato,
        reportData,
      );
      const relatorio = await this.persistGeneratedReport({
        generatedFile,
        tipo_relatorio: tiporelatorio.PROCESSO,
        formato_relatorio: formato,
        id_usuario: user.id_usuario,
        id_processo,
        id_alarme: null,
        titulo: this.buildProcessReportTitle(id_processo, formato),
        descricao: dto.observacao ?? null,
        gerado_em: geradoEm,
      });

      relatorios.push(relatorio);
    }

    return {
      relatorios,
      total_gerados: relatorios.length,
      formatos_gerados: formatos,
    };
  }

  async generateAlarmReport(
    id_alarme: number,
    dto: GenerateAlarmReportDto,
    user: AuthenticatedRelatoriosUser,
  ): Promise<SingleRelatorioGenerationResult> {
    this.relatorioPermissionValidator.validateCanGenerateAlarmReport(
      user.nivel_acesso,
    );

    const formato = this.resolveAlarmReportFormat(dto);
    const source =
      await this.relatorioAlarmeDataRepository.findCompleteAlarmReportSource(
        id_alarme,
      );
    const alreadyExists =
      await this.relatoriosRepository.existsByAlarmAndFormat(
        id_alarme,
        formato,
      );

    this.relatorioGenerationValidator.validateAlarmReportGeneration({
      source,
      formato,
      alreadyExists,
    });

    const alarmeSource = this.requireAlarmSource(source);
    const geradoEm = new Date();
    const contextoGeracao = this.buildGenerationContext({
      user,
      observacao: dto.observacao ?? null,
      gerado_em: geradoEm,
    });
    const reportData = this.alarmReportDataMapper.toReportData({
      source: alarmeSource,
      contexto_geracao: contextoGeracao,
    });
    const generatedFile = await this.generateAlarmReportFile(reportData);
    const relatorio = await this.persistGeneratedReport({
      generatedFile,
      tipo_relatorio: tiporelatorio.ALARME,
      formato_relatorio: formatorelatorio.PDF,
      id_usuario: user.id_usuario,
      id_processo: alarmeSource.alarme.id_processo ?? null,
      id_alarme,
      titulo: this.buildAlarmReportTitle(id_alarme),
      descricao: dto.observacao ?? null,
      gerado_em: geradoEm,
    });

    return {
      relatorio,
      formato_gerado: formatorelatorio.PDF,
    };
  }

  async previewRelatorio(
    id_relatorio: number,
    user: AuthenticatedRelatoriosUser,
  ): Promise<ReportPreviewResult> {
    this.relatorioPermissionValidator.validateCanPreview(user.nivel_acesso);

    const record =
      await this.relatoriosRepository.findFileMetadataById(id_relatorio);

    this.relatorioFileValidator.validatePreviewMetadata(record);

    const metadata = this.requireFileMetadata(record);
    const file = await this.gridFsReportStorageService.readReportFile({
      gridfs_file_id: this.requireStoredFileId(metadata.gridfs_file_id),
      nome_arquivo: this.requireStoredFilename(metadata.nome_arquivo),
      content_type: metadata.content_type,
      bucket_name: metadata.bucket_name,
      tamanho_bytes: this.bigIntToNumber(metadata.tamanho_bytes),
    });

    return {
      stream: file.stream,
      filename: file.nome_arquivo,
      content_type: file.content_type,
      content_length: file.content_length,
      disposition: this.buildPreviewDisposition(file.nome_arquivo),
    };
  }

  async downloadRelatorio(
    id_relatorio: number,
    user: AuthenticatedRelatoriosUser,
  ): Promise<ReportDownloadResult> {
    this.relatorioPermissionValidator.validateCanDownload(user.nivel_acesso);

    const record =
      await this.relatoriosRepository.findFileMetadataById(id_relatorio);

    this.relatorioFileValidator.validateDownloadMetadata(record);

    const metadata = this.requireFileMetadata(record);
    const file = await this.gridFsReportStorageService.readReportFile({
      gridfs_file_id: this.requireStoredFileId(metadata.gridfs_file_id),
      nome_arquivo: this.requireStoredFilename(metadata.nome_arquivo),
      content_type: metadata.content_type,
      bucket_name: metadata.bucket_name,
      tamanho_bytes: this.bigIntToNumber(metadata.tamanho_bytes),
    });

    return {
      stream: file.stream,
      filename: file.nome_arquivo,
      content_type: file.content_type,
      content_length: file.content_length,
      disposition: this.buildDownloadDisposition(file.nome_arquivo),
    };
  }

  private resolveProcessReportFormats(
    dto: GenerateProcessReportDto,
  ): formatorelatorio[] {
    if (!dto.formatos || dto.formatos.length === 0) {
      return [formatorelatorio.PDF, formatorelatorio.XLSX];
    }

    return [...dto.formatos];
  }

  private resolveAlarmReportFormat(
    dto: GenerateAlarmReportDto,
  ): formatorelatorio {
    return dto.formato ?? formatorelatorio.PDF;
  }

  private buildGenerationContext(
    params: BuildGenerationContextParams,
  ): RelatorioGenerationContext {
    return {
      id_usuario: params.user.id_usuario,
      nome_usuario: this.getCurrentUserName(params.user),
      observacao: params.observacao ?? null,
      gerado_em: params.gerado_em,
    };
  }

  private async findDuplicatedProcessFormats(
    id_processo: number,
    formatos: readonly formatorelatorio[],
  ): Promise<formatorelatorio[]> {
    const duplicatedFormats: formatorelatorio[] = [];

    for (const formato of formatos) {
      const exists = await this.relatoriosRepository.existsByProcessAndFormat(
        id_processo,
        formato,
      );

      if (exists) {
        duplicatedFormats.push(formato);
      }
    }

    return duplicatedFormats;
  }

  private async persistGeneratedReport(
    params: PersistGeneratedReportParams,
  ): Promise<RelatorioResponse> {
    this.relatorioFileValidator.validateGeneratedFile({
      bufferSize: params.generatedFile.size_bytes,
      contentType: params.generatedFile.mime_type,
      formato: params.formato_relatorio,
      filename: params.generatedFile.filename,
    });

    const storageResult = await this.gridFsReportStorageService.saveReportFile({
      buffer: params.generatedFile.buffer,
      tipo_relatorio: params.tipo_relatorio,
      formato_relatorio: params.formato_relatorio,
      id_usuario: params.id_usuario,
      id_processo: params.id_processo ?? null,
      id_alarme: params.id_alarme ?? null,
      filename: params.generatedFile.filename,
      observacao: params.descricao ?? null,
      gerado_em: params.gerado_em,
      metadata: {
        titulo: params.titulo,
        descricao: params.descricao ?? null,
        hash_arquivo: params.generatedFile.hash_arquivo,
        origem: 'RELATORIOS_MODULE',
      },
    });

    try {
      const createdRecord = await this.relatoriosRepository.create({
        id_usuario: params.id_usuario,
        id_processo: params.id_processo ?? null,
        id_alarme: params.id_alarme ?? null,
        tipo_relatorio: params.tipo_relatorio,
        formato_relatorio: params.formato_relatorio,
        titulo: params.titulo,
        descricao: params.descricao ?? null,
        nome_arquivo: storageResult.nome_arquivo,
        hash_arquivo: storageResult.hash_arquivo,
        tamanho_bytes: storageResult.tamanho_bytes,
        gridfs_file_id: storageResult.gridfs_file_id,
        content_type: storageResult.content_type,
        bucket_name: storageResult.bucket_name,
        storage_provider: storageResult.storage_provider,
        gerado_em: params.gerado_em,
      });

      return this.relatorioMapper.toResponse(createdRecord);
    } catch (error) {
      await this.rollbackStoredReportFile(
        storageResult.gridfs_file_id,
        storageResult.bucket_name,
      );

      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          RELATORIO_MESSAGES.GENERATION.DUPLICATED_REPORT,
        );
      }

      throw new InternalServerErrorException(REPORT_PERSISTENCE_ERROR_MESSAGE);
    }
  }

  private async rollbackStoredReportFile(
    gridfsFileId: string,
    bucketName: string,
  ): Promise<boolean> {
    try {
      const result = await this.gridFsReportStorageService.deleteReportFile({
        gridfs_file_id: gridfsFileId,
        bucket_name: bucketName,
      });

      return result.deleted;
    } catch (error) {
      this.logger.error(
        `Falha ao compensar arquivo de relatório ${gridfsFileId}; a reconciliação periódica tentará novamente.`,
        error instanceof Error ? error.stack : undefined,
      );

      return false;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return true;
    }

    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private async generateProcessReportFile(
    formato: formatorelatorio,
    reportData: Parameters<ProcessPdfReportGenerator['generate']>[0],
  ): Promise<GeneratedReportFile> {
    try {
      if (formato === formatorelatorio.PDF) {
        return await this.processPdfReportGenerator.generate(reportData);
      }

      if (formato === formatorelatorio.XLSX) {
        return await this.processXlsxReportGenerator.generate(reportData);
      }
    } catch {
      throw new InternalServerErrorException(REPORT_GENERATION_ERROR_MESSAGE);
    }

    throw new InternalServerErrorException(REPORT_GENERATION_ERROR_MESSAGE);
  }

  private async generateAlarmReportFile(
    reportData: Parameters<AlarmPdfReportGenerator['generate']>[0],
  ): Promise<GeneratedReportFile> {
    try {
      return await this.alarmPdfReportGenerator.generate(reportData);
    } catch {
      throw new InternalServerErrorException(REPORT_GENERATION_ERROR_MESSAGE);
    }
  }

  private buildProcessReportTitle(
    id_processo: number,
    formato: formatorelatorio,
  ): string {
    return `Relatório operacional do processo #${id_processo} - ${formato}`;
  }

  private buildAlarmReportTitle(id_alarme: number): string {
    return `Relatório técnico do alarme #${id_alarme}`;
  }

  private getCurrentUserName(user: AuthenticatedRelatoriosUser): string {
    const normalizedName = user.nome?.trim();

    return normalizedName && normalizedName.length > 0
      ? normalizedName
      : SYSTEM_GENERATOR_NAME;
  }

  private resolvePage(page?: number): number {
    return Number.isInteger(page) && page !== undefined && page >= 1
      ? page
      : RELATORIO_DEFAULT_PAGE;
  }

  private resolveLimit(limit?: number): number {
    if (!Number.isInteger(limit) || limit === undefined || limit < 1) {
      return RELATORIO_DEFAULT_LIMIT;
    }

    return Math.min(limit, RELATORIO_MAX_LIMIT);
  }

  private requireProcessSource(
    source: CompleteProcessReportSource | null,
  ): CompleteProcessReportSource {
    if (!source) {
      throw new NotFoundException(RELATORIO_MESSAGES.PROCESS.PROCESS_NOT_FOUND);
    }

    return source;
  }

  private requireAlarmSource(
    source: CompleteAlarmReportSource | null,
  ): CompleteAlarmReportSource {
    if (!source) {
      throw new NotFoundException(RELATORIO_MESSAGES.ALARM.ALARM_NOT_FOUND);
    }

    return source;
  }

  private requireFileMetadata(
    record: RelatorioFileMetadataRecord | null,
  ): RelatorioFileMetadataRecord {
    if (!record) {
      throw new NotFoundException(RELATORIO_MESSAGES.STORAGE.FILE_NOT_FOUND);
    }

    return record;
  }

  private requireStoredFileId(value: string | null | undefined): string {
    const normalizedValue = value?.trim();

    if (!normalizedValue) {
      throw new NotFoundException(RELATORIO_MESSAGES.STORAGE.FILE_NOT_FOUND);
    }

    return normalizedValue;
  }

  private requireStoredFilename(value: string | null | undefined): string {
    const normalizedValue = value?.trim();

    if (!normalizedValue) {
      throw new NotFoundException(RELATORIO_MESSAGES.STORAGE.FILE_NOT_FOUND);
    }

    return normalizedValue;
  }

  private bigIntToNumber(
    value: bigint | number | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private buildPreviewDisposition(filename: string): 'inline' {
    this.gridFsReportStorageService.buildPreviewDisposition(filename);

    return 'inline';
  }

  private buildDownloadDisposition(filename: string): 'attachment' {
    this.gridFsReportStorageService.buildDownloadDisposition(filename);

    return 'attachment';
  }
}
