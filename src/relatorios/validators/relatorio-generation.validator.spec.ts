import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { formatorelatorio, statusalarme, statusprocesso } from '@prisma/client';
import { beforeEach, describe, expect, it } from '@jest/globals';
import type {
  CompleteAlarmReportSource,
  CompleteProcessReportSource,
} from '../repositories';
import { RelatorioGenerationValidator } from './relatorio-generation.validator';

function processSource(status: statusprocesso): CompleteProcessReportSource {
  return {
    processo: { status_processo: status },
    leituras: [],
    eventos: [],
    alarmes: [],
  } as unknown as CompleteProcessReportSource;
}

function alarmSource(status: statusalarme): CompleteAlarmReportSource {
  return {
    alarme: { status_alarme: status },
    leituras: [],
    eventos: [],
  } as unknown as CompleteAlarmReportSource;
}

describe('RelatorioGenerationValidator', () => {
  let validator: RelatorioGenerationValidator;

  beforeEach(() => {
    validator = new RelatorioGenerationValidator();
  });

  it('bloqueia processo null e permite status finais', () => {
    expect(() =>
      validator.validateProcessReportGeneration({
        source: null,
        formatos: [formatorelatorio.PDF],
      }),
    ).toThrow(NotFoundException);

    for (const status of [
      statusprocesso.CONCLUIDO,
      statusprocesso.INTERROMPIDO,
      statusprocesso.FALHA,
    ]) {
      expect(() =>
        validator.validateProcessReportGeneration({
          source: processSource(status),
          formatos: [formatorelatorio.PDF],
        }),
      ).not.toThrow();
    }
  });

  it('bloqueia processo em status nao final', () => {
    for (const status of [
      statusprocesso.CONFIGURADO,
      statusprocesso.EM_EXECUCAO,
      statusprocesso.PAUSADO,
    ]) {
      expect(() => validator.validateProcessFinalStatus(status)).toThrow(
        ConflictException,
      );
    }
  });

  it('valida formatos de processo', () => {
    expect(() =>
      validator.validateProcessReportFormats([formatorelatorio.PDF]),
    ).not.toThrow();
    expect(() =>
      validator.validateProcessReportFormats([formatorelatorio.XLSX]),
    ).not.toThrow();
    expect(() => validator.validateProcessReportFormats([])).toThrow(
      BadRequestException,
    );
    expect(() =>
      validator.validateProcessReportFormats([
        formatorelatorio.PDF,
        formatorelatorio.PDF,
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.validateProcessReportFormats(['CSV' as formatorelatorio]),
    ).toThrow(BadRequestException);
  });

  it('bloqueia formato de processo ja existente', () => {
    expect(() =>
      validator.validateDuplicatedProcessFormats({
        requestedFormats: [formatorelatorio.PDF, formatorelatorio.XLSX],
        duplicatedFormats: [formatorelatorio.XLSX],
      }),
    ).toThrow(ConflictException);
  });

  it('valida geracao de alarme PDF-only e status resolvido', () => {
    expect(() =>
      validator.validateAlarmReportGeneration({
        source: null,
        formato: formatorelatorio.PDF,
      }),
    ).toThrow(NotFoundException);
    expect(() =>
      validator.validateAlarmReportFormat(formatorelatorio.PDF),
    ).not.toThrow();
    expect(() =>
      validator.validateAlarmReportFormat(formatorelatorio.XLSX),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.validateAlarmResolvedStatus(statusalarme.ATIVO),
    ).toThrow(ConflictException);
    expect(() =>
      validator.validateAlarmResolvedStatus(statusalarme.RESOLVIDO),
    ).not.toThrow();
  });

  it('bloqueia alarme duplicado', () => {
    expect(() =>
      validator.validateAlarmReportGeneration({
        source: alarmSource(statusalarme.RESOLVIDO),
        formato: formatorelatorio.PDF,
        alreadyExists: true,
      }),
    ).toThrow(ConflictException);
  });
});
