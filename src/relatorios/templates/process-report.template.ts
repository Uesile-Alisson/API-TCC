import {
  RELATORIO_PROCESS_PDF_SECTIONS,
  RELATORIO_PROCESS_TEMPLATE,
  RELATORIO_PROCESS_XLSX_SHEETS,
  RELATORIO_TEMPLATE_BRANDING,
  RELATORIO_TRACEABILITY_LABEL,
  RELATORIO_XLSX_DEFAULT_SHEET,
} from '../constants';
import type {
  ProcessReportData,
  ReportTemplateBranding,
  ReportTemplateData,
} from '../interfaces';
import { buildReportFooterTemplate } from './report-footer.template';
import { buildReportHeaderTemplate } from './report-header.template';

export type ReportSectionKey =
  | 'technical_cover'
  | 'identification'
  | 'executive_summary'
  | 'process_data'
  | 'operational_indicators'
  | 'tanks'
  | 'sensors'
  | 'readings'
  | 'events'
  | 'alarms'
  | 'technical_diagnostic'
  | 'traceability';

export interface ReportTemplateSection<TContent = object> {
  key: ReportSectionKey;
  title: string;
  order: number;
  enabled: boolean;
  content: TContent;
}

export interface ProcessReportPdfTemplateBody {
  sections: ReportTemplateSection[];
}

export interface ProcessReportXlsxSheetTemplate {
  name: string;
  order: number;
  enabled: boolean;
  description: string;
  columns: readonly string[];
}

export interface ProcessReportXlsxTemplateBody {
  default_sheet: string;
  sheets: ProcessReportXlsxSheetTemplate[];
}

export interface ProcessReportTemplateBody {
  pdf: ProcessReportPdfTemplateBody;
  xlsx: ProcessReportXlsxTemplateBody;
  source: ProcessReportData;
}

export function buildProcessReportTemplate(
  data: ProcessReportData,
): ReportTemplateData<ProcessReportTemplateBody> {
  return {
    header: buildReportHeaderTemplate({
      title: RELATORIO_PROCESS_TEMPLATE.TITLE,
      subtitle: RELATORIO_PROCESS_TEMPLATE.SUBTITLE,
      reportCode: buildProcessReportCode(data.processo.id_processo),
      generatedAt: data.contexto_geracao.gerado_em,
      generatedBy: data.contexto_geracao.nome_usuario,
    }),
    footer: buildReportFooterTemplate(),
    branding: buildTemplateBranding(),
    data: {
      pdf: {
        sections: buildProcessPdfSections(data),
      },
      xlsx: {
        default_sheet: RELATORIO_XLSX_DEFAULT_SHEET,
        sheets: buildProcessXlsxSheets(),
      },
      source: data,
    },
  };
}

export function buildProcessPdfSections(
  data: ProcessReportData,
): ReportTemplateSection[] {
  return [
    {
      key: 'technical_cover',
      title: RELATORIO_PROCESS_PDF_SECTIONS[0],
      order: 1,
      enabled: true,
      content: {
        project_name: RELATORIO_TEMPLATE_BRANDING.PROJECT_NAME,
        system_name: RELATORIO_TEMPLATE_BRANDING.SYSTEM_NAME,
        report_type: RELATORIO_PROCESS_TEMPLATE.TITLE,
        report_code: buildProcessReportCode(data.processo.id_processo),
        generated_at: data.contexto_geracao.gerado_em,
        generated_by: data.contexto_geracao.nome_usuario,
      },
    },
    {
      key: 'identification',
      title: RELATORIO_PROCESS_PDF_SECTIONS[1],
      order: 2,
      enabled: true,
      content: {
        id_processo: data.processo.id_processo,
        nome_processo: data.processo.nome_processo,
        status_processo: data.processo.status_processo,
        usuario_responsavel: data.usuario_responsavel,
        criado_em: data.processo.criado_em,
        iniciado_em: data.processo.iniciado_em,
        finalizado_em: data.processo.finalizado_em,
      },
    },
    {
      key: 'executive_summary',
      title: RELATORIO_PROCESS_PDF_SECTIONS[2],
      order: 3,
      enabled: true,
      content: {
        resumo: data.resumo,
        total_tanques: data.resumo.total_tanques,
        total_sensores: data.resumo.total_sensores,
        total_leituras: data.resumo.total_leituras,
        total_eventos: data.resumo.total_eventos,
        total_alarmes: data.resumo.total_alarmes,
        eficiencia_media: data.resumo.eficiencia_media,
        vacuo_medio_geral: data.resumo.vacuo_medio_geral,
        tempo_execucao_total: data.resumo.tempo_execucao_total,
      },
    },
    {
      key: 'process_data',
      title: RELATORIO_PROCESS_PDF_SECTIONS[3],
      order: 4,
      enabled: true,
      content: {
        vacuo_alvo: data.processo.vacuo_alvo,
        vacuo_inicial: data.processo.vacuo_inicial,
        vacuo_final: data.processo.vacuo_final,
        vacuo_medio: data.processo.vacuo_medio,
        eficiencia: data.processo.eficiencia,
        tempo_maximo: data.processo.tempo_maximo,
        tempo_execucao: data.processo.tempo_execucao,
        parada_emergencia: data.processo.parada_emergencia,
      },
    },
    {
      key: 'operational_indicators',
      title: RELATORIO_PROCESS_PDF_SECTIONS[4],
      order: 5,
      enabled: true,
      content: {
        total_alarmes_criticos: data.resumo.total_alarmes_criticos,
        total_alarmes_medios: data.resumo.total_alarmes_medios,
        total_alarmes_info: data.resumo.total_alarmes_info,
        total_alarmes_resolvidos: data.resumo.total_alarmes_resolvidos,
        total_alarmes_ativos: data.resumo.total_alarmes_ativos,
        eficiencia_media: data.resumo.eficiencia_media,
        vacuo_medio_geral: data.resumo.vacuo_medio_geral,
      },
    },
    {
      key: 'tanks',
      title: RELATORIO_PROCESS_PDF_SECTIONS[5],
      order: 6,
      enabled: true,
      content: {
        items: data.tanques,
      },
    },
    {
      key: 'sensors',
      title: RELATORIO_PROCESS_PDF_SECTIONS[6],
      order: 7,
      enabled: true,
      content: {
        items: data.sensores,
      },
    },
    {
      key: 'readings',
      title: RELATORIO_PROCESS_PDF_SECTIONS[7],
      order: 8,
      enabled: true,
      content: {
        items: data.leituras,
      },
    },
    {
      key: 'events',
      title: RELATORIO_PROCESS_PDF_SECTIONS[8],
      order: 9,
      enabled: true,
      content: {
        items: data.eventos,
      },
    },
    {
      key: 'alarms',
      title: RELATORIO_PROCESS_PDF_SECTIONS[9],
      order: 10,
      enabled: true,
      content: {
        items: data.alarmes,
      },
    },
    {
      key: 'technical_diagnostic',
      title: RELATORIO_PROCESS_PDF_SECTIONS[10],
      order: 11,
      enabled: true,
      content: data.diagnostico,
    },
    {
      key: 'traceability',
      title: RELATORIO_TRACEABILITY_LABEL,
      order: 12,
      enabled: true,
      content: {
        id_processo: data.processo.id_processo,
        id_usuario_gerador: data.contexto_geracao.id_usuario,
        generated_by: data.contexto_geracao.nome_usuario,
        generated_at: data.contexto_geracao.gerado_em,
        observacao: data.contexto_geracao.observacao,
        traceability_text: RELATORIO_TRACEABILITY_LABEL,
      },
    },
  ];
}

export function buildProcessXlsxSheets(): ProcessReportXlsxSheetTemplate[] {
  const sheetDescriptions = {
    Resumo: 'Indicadores consolidados do processo.',
    Processo: 'Dados técnicos principais do processo.',
    Tanques: 'Tanques envolvidos no processo.',
    Leituras: 'Leituras recebidas dos sensores.',
    Eventos: 'Eventos registrados durante o processo.',
    Alarmes: 'Alarmes relacionados ao processo.',
    Sensores: 'Sensores vinculados ao processo.',
  } as const;
  const sheetColumns = {
    Resumo: ['Indicador', 'Valor'],
    Processo: ['Campo', 'Valor'],
    Tanques: [
      'ID Tanque Processo',
      'Tanque',
      'Status',
      'Vácuo Alvo',
      'Vácuo Inicial',
      'Vácuo Final',
      'Vácuo Médio',
      'Eficiência',
      'Total Leituras',
      'Total Alarmes',
    ],
    Leituras: [
      'ID Leitura',
      'Tanque',
      'Sensor',
      'Tipo',
      'Valor',
      'Vácuo',
      'Unidade',
      'Leitura em',
      'Recebido em',
    ],
    Eventos: ['ID Evento', 'Tipo', 'Origem', 'Severidade', 'Ocorrido em'],
    Alarmes: [
      'ID Alarme',
      'Título',
      'Tipo',
      'Severidade',
      'Status',
      'Origem',
      'Valor Detectado',
      'Unidade',
      'Ocorrido em',
      'Resolvido em',
    ],
    Sensores: [
      'ID Sensor',
      'Nome',
      'Modelo',
      'Protocolo',
      'Unidade',
      'Tipo no Processo',
      'Status',
      'Tanque',
    ],
  } as const;

  return RELATORIO_PROCESS_XLSX_SHEETS.map((name, index) => ({
    name,
    order: index + 1,
    enabled: true,
    description: sheetDescriptions[name],
    columns: sheetColumns[name],
  }));
}

export function buildProcessReportCode(id_processo: number): string {
  return `PROCESSO-${id_processo}`;
}

function buildTemplateBranding(): ReportTemplateBranding {
  return {
    system_name: RELATORIO_TEMPLATE_BRANDING.SYSTEM_NAME,
    project_name: RELATORIO_TEMPLATE_BRANDING.PROJECT_NAME,
    institution_name: RELATORIO_TEMPLATE_BRANDING.INSTITUTION_NAME,
    primary_color: RELATORIO_TEMPLATE_BRANDING.PRIMARY_COLOR,
    secondary_color: RELATORIO_TEMPLATE_BRANDING.SECONDARY_COLOR,
    generated_label: RELATORIO_TEMPLATE_BRANDING.DOCUMENT_TITLE,
  };
}
