import { Injectable } from '@nestjs/common';
import { formatorelatorio, tiporelatorio } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

import {
  RELATORIO_FILE_EXTENSIONS,
  RELATORIO_FILE_PREFIX,
  RELATORIO_FILENAME_TYPE_SEGMENTS,
  RELATORIO_MIME_TYPES,
  RELATORIO_TEMPLATE_FOOTER_TEXT,
} from '../../constants';
import type { AlarmReportData, GeneratedReportFile } from '../../interfaces';
import { buildAlarmReportTemplate } from '../../templates';
import { PdfReportGenerator } from './pdf-report.generator';

@Injectable()
export class AlarmPdfReportGenerator {
  constructor(private readonly pdfReportGenerator: PdfReportGenerator) {}

  async generate(data: AlarmReportData): Promise<GeneratedReportFile> {
    const documentDefinition = this.buildDocumentDefinition(data);
    const buffer =
      await this.pdfReportGenerator.generateBuffer(documentDefinition);

    return {
      buffer,
      filename: this.buildFilename(data),
      extension: RELATORIO_FILE_EXTENSIONS[formatorelatorio.PDF],
      mime_type: RELATORIO_MIME_TYPES[formatorelatorio.PDF],
      size_bytes: buffer.length,
      hash_arquivo: this.calculateHash(buffer),
    };
  }

  private buildDocumentDefinition(data: AlarmReportData): TDocumentDefinitions {
    const template = buildAlarmReportTemplate(data);

    return this.pdfReportGenerator.buildBaseDocumentDefinition({
      title: template.header.title,
      subtitle: template.header.subtitle,
      reportCode: template.header.report_code,
      generatedAt: template.header.generated_at,
      generatedBy: template.header.generated_by,
      sections: [
        this.pdfReportGenerator.buildSection(
          'Dados do alarme',
          this.buildAlarmDataSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Processo relacionado',
          this.buildRelatedProcessSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Origem operacional',
          this.buildOperationalOriginSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Linha do tempo',
          this.buildTimelineSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Resolução',
          this.buildResolutionSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Diagnóstico técnico',
          this.buildDiagnosticSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Rastreabilidade',
          this.buildTraceabilitySection(data),
        ),
      ],
    });
  }

  private buildAlarmDataSection(data: AlarmReportData): Content {
    return this.pdfReportGenerator.buildKeyValueTable([
      ['ID do alarme', data.alarme.id_alarme],
      ['Título', data.alarme.titulo],
      ['Descrição', data.alarme.descricao],
      ['Tipo', data.alarme.tipo_alarme],
      ['Origem', data.alarme.origem_alarme],
      ['Severidade', data.alarme.severidade],
      ['Status', data.alarme.status_alarme],
      [
        'Valor detectado',
        this.pdfReportGenerator.formatNumber(data.alarme.valor_detectado),
      ],
      ['Unidade', data.alarme.unidade],
      [
        'Ocorrido em',
        this.pdfReportGenerator.formatDateTime(data.alarme.ocorrido_em),
      ],
      [
        'Resolvido em',
        this.pdfReportGenerator.formatDateTime(data.alarme.resolvido_em),
      ],
    ]);
  }

  private buildRelatedProcessSection(data: AlarmReportData): Content {
    if (!data.processo) {
      return {
        text: 'Alarme sem vínculo de processo informado.',
        italics: true,
      };
    }

    return this.pdfReportGenerator.buildKeyValueTable([
      ['ID do processo', data.processo.id_processo],
      ['Nome', data.processo.nome_processo],
      ['Status', data.processo.status_processo],
      [
        'Iniciado em',
        this.pdfReportGenerator.formatDateTime(data.processo.iniciado_em),
      ],
      [
        'Finalizado em',
        this.pdfReportGenerator.formatDateTime(data.processo.finalizado_em),
      ],
    ]);
  }

  private buildOperationalOriginSection(data: AlarmReportData): Content {
    return {
      stack: [
        this.pdfReportGenerator.buildKeyValueTable([
          ['ID processo tanque', data.alarme.id_processo_tanque],
          ['ID processo tanque sensor', data.alarme.id_processo_tanque_sensor],
        ]),
        this.pdfReportGenerator.buildKeyValueTable([
          ['Tanque', data.tanque?.nome_tanque],
          ['Status tanque', data.tanque?.status_tanque_processo],
          ['Sensor', data.sensor?.nome_sensor],
          ['Modelo sensor', data.sensor?.modelo],
          ['Tipo sensor', data.sensor?.tipo_sensor_processo],
          ['Unidade sensor', data.sensor?.unidade_medida],
        ]),
      ],
    };
  }

  private buildTimelineSection(data: AlarmReportData): Content {
    return {
      stack: [
        { text: 'Leituras relacionadas', style: 'label', margin: [0, 0, 0, 4] },
        this.pdfReportGenerator.buildSimpleTable(
          ['ID', 'Tipo', 'Valor', 'Vácuo', 'Unidade', 'Leitura em'],
          data.leituras_relacionadas.map((reading) => [
            reading.id_leitura_sensor,
            reading.tipo_leitura,
            this.pdfReportGenerator.formatNumber(reading.valor),
            this.pdfReportGenerator.formatNumber(reading.valor_vacuo),
            reading.unidade_medida,
            this.pdfReportGenerator.formatDateTime(reading.leitura_em),
          ]),
        ),
        { text: 'Eventos relacionados', style: 'label', margin: [0, 6, 0, 4] },
        this.pdfReportGenerator.buildSimpleTable(
          ['ID', 'Tipo', 'Origem', 'Severidade', 'Ocorrido em'],
          data.eventos_relacionados.map((event) => [
            event.id_evento_processo,
            event.tipo_evento,
            event.origem_evento,
            event.severidade_evento,
            this.pdfReportGenerator.formatDateTime(event.ocorrido_em),
          ]),
        ),
      ],
    };
  }

  private buildResolutionSection(data: AlarmReportData): Content {
    return this.pdfReportGenerator.buildKeyValueTable([
      ['Status', data.alarme.status_alarme],
      [
        'Resolvido em',
        this.pdfReportGenerator.formatDateTime(data.alarme.resolvido_em),
      ],
      ['Usuário responsável', data.usuario_responsavel?.nome],
      [
        'Situação',
        data.alarme.resolvido_em
          ? 'Alarme com data de resolução informada.'
          : 'Alarme permanece ativo ou sem data de resolução informada.',
      ],
    ]);
  }

  private buildDiagnosticSection(data: AlarmReportData): Content {
    return {
      stack: [
        this.pdfReportGenerator.buildKeyValueTable([
          ['Nível', data.diagnostico.nivel],
          ['Mensagem', data.diagnostico.mensagem],
          ['Causa provável', data.diagnostico.causa_provavel],
          ['Impacto operacional', data.diagnostico.impacto_operacional],
        ]),
        this.buildTextList('Recomendações', data.diagnostico.recomendacoes),
      ],
    };
  }

  private buildTraceabilitySection(data: AlarmReportData): Content {
    return this.pdfReportGenerator.buildKeyValueTable([
      ['ID do alarme', data.alarme.id_alarme],
      ['ID do usuário gerador', data.contexto_geracao.id_usuario],
      ['Nome gerador', data.contexto_geracao.nome_usuario],
      [
        'Data geração',
        this.pdfReportGenerator.formatDateTime(data.contexto_geracao.gerado_em),
      ],
      ['Observação', data.contexto_geracao.observacao],
      ['Imutabilidade', RELATORIO_TEMPLATE_FOOTER_TEXT],
    ]);
  }

  private buildTextList(title: string, items: string[]): Content {
    if (items.length === 0) {
      return {
        text: `${title}: -`,
        margin: [0, 2, 0, 8],
      };
    }

    return {
      stack: [
        { text: title, style: 'label', margin: [0, 4, 0, 2] },
        {
          ul: items.map((item) => this.pdfReportGenerator.formatText(item)),
          margin: [0, 0, 0, 8],
        },
      ],
    };
  }

  private buildFilename(data: AlarmReportData): string {
    return (
      [
        RELATORIO_FILE_PREFIX,
        RELATORIO_FILENAME_TYPE_SEGMENTS[tiporelatorio.ALARME],
        data.alarme.id_alarme,
        'relatorio',
        RELATORIO_FILE_EXTENSIONS[formatorelatorio.PDF],
      ].join('-') + `.${RELATORIO_FILE_EXTENSIONS[formatorelatorio.PDF]}`
    );
  }

  private calculateHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
