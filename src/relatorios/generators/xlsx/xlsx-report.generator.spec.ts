import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { XlsxReportGenerator } from './xlsx-report.generator';

interface Row {
  nome: string;
  ativo: boolean;
}

describe('XlsxReportGenerator', () => {
  let generator: XlsxReportGenerator;

  beforeEach(() => {
    generator = new XlsxReportGenerator();
  });

  it('cria workbook e worksheet com nome seguro', () => {
    const workbook = generator.createWorkbook();
    const worksheet = generator.addWorksheet(
      workbook,
      'Aba:/*?[] muito longa para teste',
    );

    expect(workbook.creator).toBe('TSEA');
    expect(worksheet.name.length).toBeLessThanOrEqual(31);
    expect(worksheet.name).not.toMatch(/[:\\/?*[\]]/);
  });

  it('formata Date e Boolean', () => {
    expect(generator.formatDateTime(new Date('2026-01-02T03:04:05'))).toMatch(
      /^02\/01\/2026 03:04:05$/,
    );
    expect(generator.formatBoolean(true)).toBe('Sim');
    expect(generator.formatBoolean(false)).toBe('Não');
  });

  it('adiciona tabela com linhas e mensagem vazia', () => {
    const workbook = generator.createWorkbook();
    const worksheet = generator.addWorksheet(workbook, 'Resumo');

    generator.addTable<Row>(worksheet, {
      columns: [
        { header: 'Nome', key: 'nome' },
        { header: 'Ativo', key: 'ativo' },
      ],
      rows: [{ nome: 'Linha', ativo: true }],
    });
    generator.addTable<Row>(worksheet, {
      columns: [{ header: 'Nome', key: 'nome' }],
      rows: [],
      emptyMessage: 'Nada encontrado.',
    });

    expect(worksheet.rowCount).toBeGreaterThan(0);
    expect(worksheet.getCell('A5').value).toBe('Nada encontrado.');
  });

  it('writeWorkbookToBuffer retorna Buffer sem salvar em disco', async () => {
    const workbook = generator.createWorkbook();
    const worksheet = generator.addWorksheet(workbook, 'Resumo');

    generator.addTitleRow(worksheet, 'Relatório');

    const buffer = await generator.writeWorkbookToBuffer(workbook);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
