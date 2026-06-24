export interface ReportTemplateBranding {
  system_name: string;
  project_name: string;
  institution_name: string;
  primary_color: string;
  secondary_color: string;
  generated_label: string;
}

export interface ReportTemplateHeader {
  title: string;
  subtitle: string | null;
  report_code: string;
  generated_at: Date;
  generated_by: string;
}

export interface ReportTemplateFooter {
  system_name: string;
  traceability_text: string;
  page_label: string;
}

export interface ReportTemplateData<TData> {
  header: ReportTemplateHeader;
  footer: ReportTemplateFooter;
  branding: ReportTemplateBranding;
  data: TData;
}
