import { Injectable } from '@nestjs/common';
import { Buffer } from 'node:buffer';
import pdfMake from 'pdfmake/build/pdfmake';
import 'pdfmake/build/vfs_fonts';
import type {
  Content,
  StyleDictionary,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';

export interface PdfReportSection {
  title: string;
  content: Content;
  enabled?: boolean;
}

export interface BuildBasePdfDocumentParams {
  title: string;
  subtitle?: string | null;
  sections: PdfReportSection[];
  generatedAt: Date;
  generatedBy: string;
  reportCode: string;
}

@Injectable()
export class PdfReportGenerator {
  async generateBuffer(
    documentDefinition: TDocumentDefinitions,
  ): Promise<Buffer> {
    try {
      const pdfBuffer = await pdfMake.createPdf(documentDefinition).getBuffer();

      return Buffer.from(pdfBuffer);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro desconhecido';

      throw new Error(`Falha ao gerar PDF: ${message}`);
    }
  }

  buildBaseDocumentDefinition(
    params: BuildBasePdfDocumentParams,
  ): TDocumentDefinitions {
    const content: Content[] = [
      { text: params.title, style: 'title' },
      {
        text: this.formatText(params.subtitle),
        style: 'subtitle',
        margin: [0, 0, 0, 12],
      },
      this.buildKeyValueTable([
        ['Código', params.reportCode],
        ['Gerado em', this.formatDateTime(params.generatedAt)],
        ['Gerado por', params.generatedBy],
      ]),
    ];

    for (const section of params.sections) {
      if (section.enabled === false) {
        continue;
      }

      content.push(
        { text: section.title, style: 'sectionTitle' },
        section.content,
      );
    }

    return {
      pageSize: 'A4',
      pageMargins: [40, 70, 40, 55],
      header: {
        text: params.reportCode,
        style: 'small',
        alignment: 'right',
        margin: [40, 20, 40, 0],
      },
      footer: (currentPage: number, pageCount: number): Content => ({
        text: `Página ${currentPage} de ${pageCount}`,
        style: 'small',
        alignment: 'right',
        margin: [40, 0, 40, 20],
      }),
      content,
      styles: this.buildDefaultStyles(),
      defaultStyle: {
        fontSize: 9,
      },
    };
  }

  buildDefaultStyles(): StyleDictionary {
    return {
      title: {
        fontSize: 18,
        bold: true,
        color: '#0F172A',
        margin: [0, 0, 0, 4],
      },
      subtitle: {
        fontSize: 11,
        color: '#334155',
      },
      sectionTitle: {
        fontSize: 13,
        bold: true,
        color: '#0F172A',
        margin: [0, 12, 0, 6],
      },
      label: {
        bold: true,
        color: '#1E293B',
      },
      value: {
        color: '#334155',
      },
      small: {
        fontSize: 8,
        color: '#64748B',
      },
      tableHeader: {
        bold: true,
        color: '#FFFFFF',
        fillColor: '#0F172A',
      },
    };
  }

  buildKeyValueTable(
    rows: ReadonlyArray<
      readonly [string, string | number | boolean | null | undefined]
    >,
  ): Content {
    const body: TableCell[][] = rows.map(([label, value]) => [
      { text: label, style: 'label' },
      { text: this.formatText(value), style: 'value' },
    ]);

    return {
      table: {
        widths: ['35%', '65%'],
        body,
      },
      layout: 'lightHorizontalLines',
      margin: [0, 2, 0, 10],
    };
  }

  buildSimpleTable(
    headers: string[],
    rows: ReadonlyArray<
      ReadonlyArray<string | number | boolean | null | undefined>
    >,
  ): Content {
    if (rows.length === 0) {
      return {
        text: 'Nenhum registro encontrado.',
        italics: true,
        style: 'small',
        margin: [0, 2, 0, 10],
      };
    }

    const headerRow: TableCell[] = headers.map((header) => ({
      text: header,
      style: 'tableHeader',
    }));
    const bodyRows: TableCell[][] = rows.map((row) =>
      row.map((value) => ({
        text: this.formatText(value),
        style: 'value',
      })),
    );

    return {
      table: {
        headerRows: 1,
        widths: headers.map(() => '*'),
        body: [headerRow, ...bodyRows],
      },
      layout: 'lightHorizontalLines',
      fontSize: 7,
      margin: [0, 2, 0, 10],
    };
  }

  formatDateTime(value: Date | null | undefined): string {
    if (!value || Number.isNaN(value.getTime())) {
      return '-';
    }

    const day = this.padDatePart(value.getDate());
    const month = this.padDatePart(value.getMonth() + 1);
    const year = value.getFullYear();
    const hours = this.padDatePart(value.getHours());
    const minutes = this.padDatePart(value.getMinutes());
    const seconds = this.padDatePart(value.getSeconds());

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  }

  formatNumber(value: number | null | undefined, fractionDigits = 2): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '-';
    }

    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  }

  formatBoolean(value: boolean | null | undefined): string {
    if (value === null || value === undefined) {
      return '-';
    }

    return value ? 'Sim' : 'Não';
  }

  formatText(value: string | number | boolean | null | undefined): string {
    if (value === null || value === undefined) {
      return '-';
    }

    if (typeof value === 'boolean') {
      return this.formatBoolean(value);
    }

    if (typeof value === 'number') {
      return String(value);
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : '-';
  }

  buildSection(
    title: string,
    content: Content,
    enabled?: boolean,
  ): PdfReportSection {
    return {
      title,
      content,
      enabled,
    };
  }

  private padDatePart(value: number): string {
    return String(value).padStart(2, '0');
  }
}
