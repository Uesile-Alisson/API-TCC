import { BadRequestException } from '@nestjs/common';
import { formatorelatorio, tiporelatorio } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { ReportFileService } from './report-file.service';

describe('ReportFileService', () => {
  let service: ReportFileService;
  const buffer = Buffer.from('arquivo-teste');
  const generatedAt = new Date('2026-01-01T12:00:00.000Z');

  beforeEach(() => {
    service = new ReportFileService();
  });

  it('prepara arquivo PDF com nome seguro, content type, extensão, hash e tamanho', () => {
    const result = service.prepareReportFile({
      buffer,
      tipo_relatorio: tiporelatorio.PROCESSO,
      formato_relatorio: formatorelatorio.PDF,
      id_processo: 10,
      generatedAt,
    });

    expect(result.nome_arquivo).toContain('tsea-processo-10-relatorio-pdf');
    expect(result.content_type).toBe('application/pdf');
    expect(result.extension).toBe('pdf');
    expect(result.hash_arquivo).toBe(
      createHash('sha256').update(buffer).digest('hex'),
    );
    expect(result.tamanho_bytes).toBe(buffer.length);
  });

  it('prepara arquivo XLSX com content type e extensão corretos', () => {
    const result = service.prepareReportFile({
      buffer,
      tipo_relatorio: tiporelatorio.PROCESSO,
      formato_relatorio: formatorelatorio.XLSX,
      id_processo: 10,
      generatedAt,
    });

    expect(result.content_type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(result.extension).toBe('xlsx');
  });

  it('gera filenames para processo PDF/XLSX e alarme PDF', () => {
    expect(
      service.buildReportFilename({
        tipo_relatorio: tiporelatorio.PROCESSO,
        formato_relatorio: formatorelatorio.PDF,
        id_processo: 10,
        generatedAt,
      }),
    ).toMatch(/^tsea-processo-10-relatorio-pdf-\d{8}-\d{6}\.pdf$/);
    expect(
      service.buildReportFilename({
        tipo_relatorio: tiporelatorio.PROCESSO,
        formato_relatorio: formatorelatorio.XLSX,
        id_processo: 10,
        generatedAt,
      }),
    ).toMatch(/^tsea-processo-10-relatorio-xlsx-\d{8}-\d{6}\.xlsx$/);
    expect(
      service.buildReportFilename({
        tipo_relatorio: tiporelatorio.ALARME,
        formato_relatorio: formatorelatorio.PDF,
        id_alarme: 20,
        generatedAt,
      }),
    ).toMatch(/^tsea-alarme-20-relatorio-pdf-\d{8}-\d{6}\.pdf$/);
  });

  it('rejeita ids obrigatórios ausentes, buffer vazio e filename inseguro', () => {
    expect(() =>
      service.buildReportFilename({
        tipo_relatorio: tiporelatorio.PROCESSO,
        formato_relatorio: formatorelatorio.PDF,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.buildReportFilename({
        tipo_relatorio: tiporelatorio.ALARME,
        formato_relatorio: formatorelatorio.PDF,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.prepareReportFile({
        buffer: Buffer.from(''),
        tipo_relatorio: tiporelatorio.PROCESSO,
        formato_relatorio: formatorelatorio.PDF,
        id_processo: 10,
      }),
    ).toThrow(BadRequestException);
    expect(() => service.assertSafeFilename('../relatorio.pdf')).toThrow(
      BadRequestException,
    );
  });

  it('monta Content-Disposition inline e attachment', () => {
    expect(
      service.buildContentDisposition({
        filename: 'relatorio.pdf',
        disposition: 'inline',
      }),
    ).toBe('inline; filename="relatorio.pdf"');
    expect(
      service.buildContentDisposition({
        filename: 'relatorio.xlsx',
        disposition: 'attachment',
      }),
    ).toBe('attachment; filename="relatorio.xlsx"');
  });
});
