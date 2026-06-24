import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { formatorelatorio, statusalarme, statusprocesso } from '@prisma/client';

import { RELATORIO_MESSAGES } from '../constants';
import type {
  CompleteAlarmReportSource,
  CompleteProcessReportSource,
} from '../repositories';

export interface ValidateProcessReportGenerationParams {
  source: CompleteProcessReportSource | null;
  formatos: readonly formatorelatorio[];
  duplicatedFormats?: readonly formatorelatorio[];
}

export interface ValidateAlarmReportGenerationParams {
  source: CompleteAlarmReportSource | null;
  formato: formatorelatorio;
  alreadyExists?: boolean;
}

export interface ValidateDuplicatedProcessFormatsParams {
  requestedFormats: readonly formatorelatorio[];
  duplicatedFormats: readonly formatorelatorio[];
}

const PROCESS_FINAL_STATUSES = [
  statusprocesso.CONCLUIDO,
  statusprocesso.INTERROMPIDO,
  statusprocesso.FALHA,
] as const;

const PROCESS_REPORT_FORMATS = [
  formatorelatorio.PDF,
  formatorelatorio.XLSX,
] as const;

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

@Injectable()
export class RelatorioGenerationValidator {
  validateProcessReportGeneration(
    params: ValidateProcessReportGenerationParams,
  ): void {
    if (!params.source?.processo) {
      throw new NotFoundException(RELATORIO_MESSAGES.PROCESS.PROCESS_NOT_FOUND);
    }

    this.validateProcessReportFormats(params.formatos);
    this.validateProcessFinalStatus(params.source.processo.status_processo);
    this.validateDuplicatedProcessFormats({
      requestedFormats: params.formatos,
      duplicatedFormats: params.duplicatedFormats ?? [],
    });
  }

  validateAlarmReportGeneration(
    params: ValidateAlarmReportGenerationParams,
  ): void {
    if (!params.source?.alarme) {
      throw new NotFoundException(RELATORIO_MESSAGES.ALARM.ALARM_NOT_FOUND);
    }

    this.validateAlarmReportFormat(params.formato);
    this.validateAlarmResolvedStatus(params.source.alarme.status_alarme);
    this.validateDuplicatedAlarmReport(params.alreadyExists);
  }

  validateProcessReportFormats(formatos: unknown): void {
    if (!isUnknownArray(formatos)) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.PROCESS.PROCESS_INVALID_FORMAT,
      );
    }

    if (formatos.length === 0 || formatos.length > 2) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.PROCESS.PROCESS_INVALID_FORMAT,
      );
    }

    const uniqueFormats = new Set(formatos);

    if (uniqueFormats.size !== formatos.length) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.PROCESS.PROCESS_INVALID_FORMAT,
      );
    }

    const allFormatsAreSupported = formatos.every((formato) =>
      this.isProcessReportFormat(formato),
    );

    if (!allFormatsAreSupported) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.PROCESS.PROCESS_INVALID_FORMAT,
      );
    }
  }

  validateAlarmReportFormat(formato: formatorelatorio): void {
    if (formato !== formatorelatorio.PDF) {
      throw new BadRequestException(
        RELATORIO_MESSAGES.ALARM.ALARM_INVALID_FORMAT,
      );
    }
  }

  validateProcessFinalStatus(status: statusprocesso): void {
    const isFinalStatus = PROCESS_FINAL_STATUSES.some(
      (allowedStatus) => allowedStatus === status,
    );

    if (!isFinalStatus) {
      throw new ConflictException(
        RELATORIO_MESSAGES.PROCESS.PROCESS_NOT_FINALIZED,
      );
    }
  }

  validateAlarmResolvedStatus(status: statusalarme): void {
    if (status !== statusalarme.RESOLVIDO) {
      throw new ConflictException(
        RELATORIO_MESSAGES.ALARM.ALARM_MUST_BE_RESOLVED,
      );
    }
  }

  validateDuplicatedProcessFormats(
    params: ValidateDuplicatedProcessFormatsParams,
  ): void {
    const duplicatedFormats = new Set(params.duplicatedFormats);
    const hasDuplicatedFormat = params.requestedFormats.some((formato) =>
      duplicatedFormats.has(formato),
    );

    if (hasDuplicatedFormat) {
      throw new ConflictException(
        RELATORIO_MESSAGES.GENERATION.DUPLICATED_REPORT,
      );
    }
  }

  validateDuplicatedAlarmReport(alreadyExists?: boolean): void {
    if (alreadyExists === true) {
      throw new ConflictException(
        RELATORIO_MESSAGES.GENERATION.DUPLICATED_REPORT,
      );
    }
  }

  private isProcessReportFormat(formato: unknown): formato is formatorelatorio {
    return PROCESS_REPORT_FORMATS.some(
      (supportedFormat) => supportedFormat === formato,
    );
  }
}
