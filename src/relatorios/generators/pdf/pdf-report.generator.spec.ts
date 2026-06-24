import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { PdfReportGenerator } from './pdf-report.generator';

describe('PdfReportGenerator', () => {
  let generator: PdfReportGenerator;

  beforeEach(() => {
    generator = new PdfReportGenerator();
  });

  it('buildKeyValueTable trata null como hífen', () => {
    const content = generator.buildKeyValueTable([['Campo', null]]) as {
      table: { body: Array<Array<{ text: string }>> };
    };

    expect(content.table.body[0][1].text).toBe('-');
  });

  it('buildSimpleTable trata lista vazia', () => {
    const content = generator.buildSimpleTable(['A'], []) as { text: string };

    expect(content.text).toBe('Nenhum registro encontrado.');
  });

  it('formata Date e boolean', () => {
    expect(generator.formatDateTime(new Date('2026-01-02T03:04:05'))).toMatch(
      /^02\/01\/2026 03:04:05$/,
    );
    expect(generator.formatBoolean(true)).toBe('Sim');
    expect(generator.formatBoolean(false)).toBe('Não');
  });

  it('gera Buffer para documentDefinition mínimo sem salvar arquivo', async () => {
    const documentDefinition = generator.buildBaseDocumentDefinition({
      title: 'Relatório',
      subtitle: 'Teste',
      generatedAt: new Date('2026-01-01T00:00:00.000Z'),
      generatedBy: 'Usuário Teste',
      reportCode: 'TESTE-1',
      sections: [generator.buildSection('Seção', { text: 'Conteúdo' })],
    });

    const buffer = await generator.generateBuffer(documentDefinition);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
