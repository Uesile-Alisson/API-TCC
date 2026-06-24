import {
  RELATORIO_TEMPLATE_BRANDING,
  RELATORIO_TEMPLATE_FOOTER_TEXT,
} from '../constants';
import type { ReportTemplateFooter } from '../interfaces';

export interface BuildReportFooterParams {
  systemName?: string;
  traceabilityText?: string;
  pageLabel?: string;
}

export function buildReportFooterTemplate(
  params?: BuildReportFooterParams,
): ReportTemplateFooter {
  return {
    system_name: normalizeRequiredText(
      params?.systemName,
      RELATORIO_TEMPLATE_BRANDING.SYSTEM_NAME,
    ),
    traceability_text: normalizeRequiredText(
      params?.traceabilityText,
      RELATORIO_TEMPLATE_FOOTER_TEXT,
    ),
    page_label: normalizeRequiredText(params?.pageLabel, 'Página'),
  };
}

function normalizeRequiredText(
  value: string | null | undefined,
  fallback: string,
): string {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : fallback;
}
