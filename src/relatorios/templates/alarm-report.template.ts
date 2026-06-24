import {
  RELATORIO_ALARM_PDF_SECTIONS,
  RELATORIO_ALARM_TEMPLATE,
  RELATORIO_TEMPLATE_BRANDING,
  RELATORIO_TRACEABILITY_LABEL,
} from '../constants';
import type {
  AlarmReportData,
  ReportTemplateBranding,
  ReportTemplateData,
} from '../interfaces';
import { buildReportFooterTemplate } from './report-footer.template';
import { buildReportHeaderTemplate } from './report-header.template';

export type AlarmReportSectionKey =
  | 'identification'
  | 'alarm_data'
  | 'related_process'
  | 'operational_origin'
  | 'severity_status'
  | 'detected_value'
  | 'timeline'
  | 'resolution'
  | 'technical_diagnostic'
  | 'traceability';

export interface AlarmReportTemplateSection<TContent = object> {
  key: AlarmReportSectionKey;
  title: string;
  order: number;
  enabled: boolean;
  content: TContent;
}

export interface AlarmReportPdfTemplateBody {
  sections: AlarmReportTemplateSection[];
  source: AlarmReportData;
}

export function buildAlarmReportTemplate(
  data: AlarmReportData,
): ReportTemplateData<AlarmReportPdfTemplateBody> {
  return {
    header: buildReportHeaderTemplate({
      title: RELATORIO_ALARM_TEMPLATE.TITLE,
      subtitle: RELATORIO_ALARM_TEMPLATE.SUBTITLE,
      reportCode: buildAlarmReportCode(data.alarme.id_alarme),
      generatedAt: data.contexto_geracao.gerado_em,
      generatedBy: data.contexto_geracao.nome_usuario,
    }),
    footer: buildReportFooterTemplate(),
    branding: buildTemplateBranding(),
    data: {
      sections: buildAlarmPdfSections(data),
      source: data,
    },
  };
}

export function buildAlarmPdfSections(
  data: AlarmReportData,
): AlarmReportTemplateSection[] {
  return [
    {
      key: 'identification',
      title: RELATORIO_ALARM_PDF_SECTIONS[0],
      order: 1,
      enabled: true,
      content: {
        id_alarme: data.alarme.id_alarme,
        titulo: data.alarme.titulo,
        tipo: data.alarme.tipo_alarme,
        ocorrido_em: data.alarme.ocorrido_em,
        generated_by: data.contexto_geracao.nome_usuario,
        generated_at: data.contexto_geracao.gerado_em,
      },
    },
    {
      key: 'alarm_data',
      title: RELATORIO_ALARM_PDF_SECTIONS[1],
      order: 2,
      enabled: true,
      content: {
        descricao: data.alarme.descricao,
        tipo_alarme: data.alarme.tipo_alarme,
        origem_alarme: data.alarme.origem_alarme,
        severidade: data.alarme.severidade,
        status_alarme: data.alarme.status_alarme,
      },
    },
    {
      key: 'related_process',
      title: RELATORIO_ALARM_PDF_SECTIONS[2],
      order: 3,
      enabled: true,
      content: {
        has_related_process: data.processo !== null,
        processo: data.processo,
        message:
          data.processo === null
            ? 'Alarme sem vínculo de processo informado.'
            : null,
      },
    },
    {
      key: 'operational_origin',
      title: RELATORIO_ALARM_PDF_SECTIONS[3],
      order: 4,
      enabled: true,
      content: {
        tanque: data.tanque,
        sensor: data.sensor,
        id_processo_tanque: data.alarme.id_processo_tanque,
        id_processo_tanque_sensor: data.alarme.id_processo_tanque_sensor,
      },
    },
    {
      key: 'severity_status',
      title: RELATORIO_ALARM_PDF_SECTIONS[4],
      order: 5,
      enabled: true,
      content: {
        severidade: data.alarme.severidade,
        status: data.alarme.status_alarme,
        resolvido_em: data.alarme.resolvido_em,
        usuario_responsavel: data.usuario_responsavel,
      },
    },
    {
      key: 'detected_value',
      title: RELATORIO_ALARM_PDF_SECTIONS[5],
      order: 6,
      enabled: true,
      content: {
        valor_detectado: data.alarme.valor_detectado,
        unidade: data.alarme.unidade,
        ocorrido_em: data.alarme.ocorrido_em,
      },
    },
    {
      key: 'timeline',
      title: RELATORIO_ALARM_PDF_SECTIONS[6],
      order: 7,
      enabled: true,
      content: {
        leituras_relacionadas: data.leituras_relacionadas,
        eventos_relacionados: data.eventos_relacionados,
      },
    },
    {
      key: 'resolution',
      title: RELATORIO_ALARM_PDF_SECTIONS[7],
      order: 8,
      enabled: true,
      content: {
        status_alarme: data.alarme.status_alarme,
        resolvido_em: data.alarme.resolvido_em,
        usuario_responsavel: data.usuario_responsavel,
        message:
          data.alarme.resolvido_em === null
            ? 'Alarme ainda sem data de resolução informada.'
            : null,
      },
    },
    {
      key: 'technical_diagnostic',
      title: RELATORIO_ALARM_PDF_SECTIONS[8],
      order: 9,
      enabled: true,
      content: data.diagnostico,
    },
    {
      key: 'traceability',
      title: RELATORIO_ALARM_PDF_SECTIONS[9],
      order: 10,
      enabled: true,
      content: {
        id_alarme: data.alarme.id_alarme,
        id_processo: data.alarme.id_processo,
        id_processo_tanque: data.alarme.id_processo_tanque,
        id_processo_tanque_sensor: data.alarme.id_processo_tanque_sensor,
        id_usuario_gerador: data.contexto_geracao.id_usuario,
        generated_by: data.contexto_geracao.nome_usuario,
        generated_at: data.contexto_geracao.gerado_em,
        observacao: data.contexto_geracao.observacao,
        traceability_text: RELATORIO_TRACEABILITY_LABEL,
      },
    },
  ];
}

export function buildAlarmReportCode(id_alarme: number): string {
  return `ALARME-${id_alarme}`;
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
