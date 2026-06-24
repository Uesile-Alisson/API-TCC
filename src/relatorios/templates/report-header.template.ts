import type { ReportTemplateHeader } from '../interfaces';

export interface BuildReportHeaderParams {
  title: string;
  subtitle?: string | null;
  reportCode: string;
  generatedAt: Date;
  generatedBy: string;
}

export function buildReportHeaderTemplate(
  params: BuildReportHeaderParams,
): ReportTemplateHeader {
  return {
    title: normalizeRequiredText(params.title, 'Relatório Operacional'),
    subtitle: normalizeOptionalText(params.subtitle),
    report_code: normalizeRequiredText(params.reportCode, 'RELATORIO-TSEA'),
    generated_at: params.generatedAt,
    generated_by: normalizeRequiredText(params.generatedBy, 'Sistema TSEA'),
  };
}

function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeRequiredText(value: string, fallback: string): string {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : fallback;
}
