import { formatorelatorio, tiporelatorio } from '@prisma/client';

export const RELATORIO_FORMATS = {
  PDF: formatorelatorio.PDF,
  XLSX: formatorelatorio.XLSX,
} as const;

export const RELATORIO_ALLOWED_FORMATS = [
  formatorelatorio.PDF,
  formatorelatorio.XLSX,
] as const;

// Relatório de alarme aceita apenas PDF. Relatório de processo aceita PDF e XLSX.
export const RELATORIO_PROCESS_FORMATS = [
  formatorelatorio.PDF,
  formatorelatorio.XLSX,
] as const;

export const RELATORIO_ALARM_FORMATS = [formatorelatorio.PDF] as const;

export const RELATORIO_FORMATS_BY_TYPE = {
  [tiporelatorio.PROCESSO]: RELATORIO_PROCESS_FORMATS,
  [tiporelatorio.ALARME]: RELATORIO_ALARM_FORMATS,
} as const;

export const RELATORIO_DEFAULT_FORMATS_BY_TYPE = {
  [tiporelatorio.PROCESSO]: [formatorelatorio.PDF, formatorelatorio.XLSX],
  [tiporelatorio.ALARME]: [formatorelatorio.PDF],
} as const;

export const RELATORIO_FORMAT_EXTENSIONS = {
  [formatorelatorio.PDF]: 'pdf',
  [formatorelatorio.XLSX]: 'xlsx',
} as const;

export const RELATORIO_FORMAT_LABELS = {
  [formatorelatorio.PDF]: 'PDF',
  [formatorelatorio.XLSX]: 'Planilha Excel',
} as const;

export const RELATORIO_FORMAT_DISPLAY_NAMES = {
  [formatorelatorio.PDF]: 'Documento PDF',
  [formatorelatorio.XLSX]: 'Planilha XLSX',
} as const;

export const RELATORIO_PREVIEW_FORMATS = [formatorelatorio.PDF] as const;

export const RELATORIO_DOWNLOAD_FORMATS = [
  formatorelatorio.PDF,
  formatorelatorio.XLSX,
] as const;
