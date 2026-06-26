import { BadRequestException } from '@nestjs/common';

export interface BackupDateRange {
  data_inicio?: Date;
  data_fim?: Date;
}

export interface BackupDateRangeInput {
  data_inicio?: string;
  data_fim?: string;
}

export function parseBackupDate(
  value: string | undefined,
  fieldName: string,
): Date | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldName} deve ser uma data valida.`);
  }

  return parsed;
}

export function validateBackupDateRange(
  input: BackupDateRangeInput,
): BackupDateRange {
  const data_inicio = parseBackupDate(input.data_inicio, 'data_inicio');
  const data_fim = parseBackupDate(input.data_fim, 'data_fim');

  if (data_inicio && data_fim && data_inicio > data_fim) {
    throw new BadRequestException(
      'data_inicio deve ser menor ou igual a data_fim.',
    );
  }

  return { data_inicio, data_fim };
}
