import { Injectable } from '@nestjs/common';
import { Buffer } from 'node:buffer';
import { Workbook, Worksheet } from 'exceljs';

export interface XlsxColumnDefinition<T extends object> {
  header: string;
  key: keyof T | string;
  width?: number;
  value?: (row: T) => string | number | boolean | Date | null | undefined;
}

export interface AddXlsxTableParams<T extends object> {
  startRow?: number;
  columns: XlsxColumnDefinition<T>[];
  rows: readonly T[];
  emptyMessage?: string;
}

@Injectable()
export class XlsxReportGenerator {
  createWorkbook(): Workbook {
    const workbook = new Workbook();
    const now = new Date();

    workbook.creator = 'TSEA';
    workbook.lastModifiedBy = 'TSEA';
    workbook.created = now;
    workbook.modified = now;

    return workbook;
  }

  async writeWorkbookToBuffer(workbook: Workbook): Promise<Buffer> {
    const buffer = await workbook.xlsx.writeBuffer();

    return Buffer.from(buffer);
  }

  addWorksheet(workbook: Workbook, name: string): Worksheet {
    return workbook.addWorksheet(this.sanitizeWorksheetName(name));
  }

  configureWorksheetDefaults(worksheet: Worksheet): void {
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.properties.defaultRowHeight = 18;

    worksheet.eachRow((row) => {
      row.alignment = {
        vertical: 'middle',
        wrapText: true,
      };
    });
  }

  addTitleRow(worksheet: Worksheet, title: string): void {
    const titleRow = worksheet.addRow([this.formatText(title)]);

    titleRow.font = {
      bold: true,
      size: 14,
      color: { argb: 'FF0F172A' },
    };
    titleRow.height = 24;
    worksheet.addRow([]);
  }

  addMetadataRows(
    worksheet: Worksheet,
    rows: ReadonlyArray<
      readonly [string, string | number | boolean | Date | null | undefined]
    >,
  ): void {
    for (const [label, value] of rows) {
      const row = worksheet.addRow([label, this.formatText(value)]);

      row.getCell(1).font = { bold: true };
    }

    worksheet.addRow([]);
  }

  addTable<T extends object>(
    worksheet: Worksheet,
    params: AddXlsxTableParams<T>,
  ): void {
    this.moveToStartRow(worksheet, params.startRow);

    const headerRowNumber = worksheet.rowCount + 1;
    const headerRow = worksheet.addRow(
      params.columns.map((column) => column.header),
    );

    headerRow.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };

    if (params.rows.length === 0) {
      worksheet.addRow([
        params.emptyMessage?.trim() || 'Nenhum registro encontrado.',
      ]);
      worksheet.addRow([]);
      return;
    }

    for (const row of params.rows) {
      worksheet.addRow(
        params.columns.map((column) =>
          this.formatText(
            column.value
              ? column.value(row)
              : this.getRecordValue(row, column.key),
          ),
        ),
      );
    }

    worksheet.autoFilter = {
      from: {
        row: headerRowNumber,
        column: 1,
      },
      to: {
        row: headerRowNumber,
        column: params.columns.length,
      },
    };

    params.columns.forEach((column, index) => {
      if (column.width) {
        worksheet.getColumn(index + 1).width = column.width;
      }
    });
    worksheet.addRow([]);
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

  formatNumber(
    value: number | null | undefined,
    fractionDigits?: number,
  ): string | number {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '-';
    }

    return typeof fractionDigits === 'number'
      ? Number(value.toFixed(fractionDigits))
      : value;
  }

  formatBoolean(value: boolean | null | undefined): string {
    if (value === null || value === undefined) {
      return '-';
    }

    return value ? 'Sim' : 'Não';
  }

  formatText(
    value: string | number | boolean | Date | null | undefined,
  ): string | number {
    if (value === null || value === undefined) {
      return '-';
    }

    if (value instanceof Date) {
      return this.formatDateTime(value);
    }

    if (typeof value === 'boolean') {
      return this.formatBoolean(value);
    }

    if (typeof value === 'number') {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : '-';
  }

  sanitizeWorksheetName(name: string): string {
    const sanitized = name
      .replace(/[:\\/?*[\]]/g, '')
      .trim()
      .slice(0, 31);

    return sanitized.length > 0 ? sanitized : 'Planilha';
  }

  autoFitColumns(worksheet: Worksheet): void {
    worksheet.columns.forEach((column) => {
      let maxLength = 10;

      column.eachCell?.({ includeEmpty: false }, (cell, rowNumber) => {
        if (rowNumber > 1000) {
          return;
        }

        const cellLength = this.formatUnknownValue(cell.value).length;
        maxLength = Math.max(maxLength, cellLength);
      });

      column.width = Math.min(Math.max(maxLength + 2, column.width ?? 10), 60);
    });
  }

  private getRecordValue<T extends object>(
    row: T,
    key: keyof T | string,
  ): string | number | boolean | Date | null | undefined {
    const record = row as Record<string, unknown>;

    return this.normalizeUnknownValue(record[String(key)]);
  }

  private normalizeUnknownValue(
    value: unknown,
  ): string | number | boolean | Date | null | undefined {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value instanceof Date
    ) {
      return value;
    }

    return this.stringifyObjectValue(value);
  }

  private formatUnknownValue(value: unknown): string {
    const normalizedValue = this.normalizeUnknownValue(value);
    const formattedValue = this.formatText(normalizedValue);

    return typeof formattedValue === 'number'
      ? formattedValue.toString()
      : formattedValue;
  }

  private stringifyObjectValue(value: unknown): string {
    if (typeof value !== 'object') {
      return '-';
    }

    try {
      const json = JSON.stringify(value);

      return json && json !== '{}' ? json : '-';
    } catch {
      return '-';
    }
  }

  private moveToStartRow(worksheet: Worksheet, startRow?: number): void {
    if (!startRow) {
      return;
    }

    while (worksheet.rowCount + 1 < startRow) {
      worksheet.addRow([]);
    }
  }

  private padDatePart(value: number): string {
    return String(value).padStart(2, '0');
  }
}
