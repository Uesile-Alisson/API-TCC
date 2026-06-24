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
import type { GeneratedReportFile, ProcessReportData } from '../../interfaces';
import { buildProcessReportTemplate } from '../../templates';
import { PdfReportGenerator } from './pdf-report.generator';

const MAX_READINGS_IN_PDF = 200;
const MAX_EVENTS_IN_PDF = 100;
const MAX_ALARMS_IN_PDF = 100;

@Injectable()
export class ProcessPdfReportGenerator {
  constructor(private readonly pdfReportGenerator: PdfReportGenerator) {}

  async generate(data: ProcessReportData): Promise<GeneratedReportFile> {
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

  private buildDocumentDefinition(
    data: ProcessReportData,
  ): TDocumentDefinitions {
    const template = buildProcessReportTemplate(data);

    return this.pdfReportGenerator.buildBaseDocumentDefinition({
      title: template.header.title,
      subtitle: template.header.subtitle,
      reportCode: template.header.report_code,
      generatedAt: template.header.generated_at,
      generatedBy: template.header.generated_by,
      sections: [
        this.pdfReportGenerator.buildSection(
          'Resumo executivo',
          this.buildSummarySection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Dados do processo',
          this.buildProcessDataSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Tanques',
          this.buildTanksSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Sensores',
          this.buildSensorsSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Leituras',
          this.buildReadingsSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Eventos',
          this.buildEventsSection(data),
        ),
        this.pdfReportGenerator.buildSection(
          'Alarmes',
          this.buildAlarmsSection(data),
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

  private buildSummarySection(data: ProcessReportData): Content {
    return this.pdfReportGenerator.buildKeyValueTable([
      ['Total de tanques', data.resumo.total_tanques],
      ['Total de sensores', data.resumo.total_sensores],
      ['Total de leituras', data.resumo.total_leituras],
      ['Total de eventos', data.resumo.total_eventos],
      ['Total de alarmes', data.resumo.total_alarmes],
      [
        'Eficiência média',
        this.pdfReportGenerator.formatNumber(data.resumo.eficiencia_media),
      ],
      [
        'Vácuo médio geral',
        this.pdfReportGenerator.formatNumber(data.resumo.vacuo_medio_geral),
      ],
      [
        'Tempo de execução total',
        this.pdfReportGenerator.formatNumber(
          data.resumo.tempo_execucao_total,
          0,
        ),
      ],
    ]);
  }

  private buildProcessDataSection(data: ProcessReportData): Content {
    return this.pdfReportGenerator.buildKeyValueTable([
      ['ID do processo', data.processo.id_processo],
      ['Nome', data.processo.nome_processo],
      ['Status', data.processo.status_processo],
      [
        'Vácuo alvo',
        this.pdfReportGenerator.formatNumber(data.processo.vacuo_alvo),
      ],
      [
        'Vácuo inicial',
        this.pdfReportGenerator.formatNumber(data.processo.vacuo_inicial),
      ],
      [
        'Vácuo final',
        this.pdfReportGenerator.formatNumber(data.processo.vacuo_final),
      ],
      [
        'Vácuo médio',
        this.pdfReportGenerator.formatNumber(data.processo.vacuo_medio),
      ],
      [
        'Eficiência',
        this.pdfReportGenerator.formatNumber(data.processo.eficiencia),
      ],
      [
        'Tempo máximo',
        this.pdfReportGenerator.formatNumber(data.processo.tempo_maximo, 0),
      ],
      [
        'Tempo execução',
        this.pdfReportGenerator.formatNumber(data.processo.tempo_execucao, 0),
      ],
      [
        'Parada emergência',
        this.pdfReportGenerator.formatBoolean(data.processo.parada_emergencia),
      ],
      [
        'Criado em',
        this.pdfReportGenerator.formatDateTime(data.processo.criado_em),
      ],
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

  private buildTanksSection(data: ProcessReportData): Content {
    return this.pdfReportGenerator.buildSimpleTable(
      [
        'ID',
        'Tanque',
        'Status',
        'Vácuo alvo',
        'Vácuo inicial',
        'Vácuo final',
        'Vácuo médio',
        'Eficiência',
        'Leituras',
        'Alarmes',
      ],
      data.tanques.map((tank) => [
        tank.id_processo_tanque,
        tank.nome_tanque,
        tank.status_tanque_processo,
        this.pdfReportGenerator.formatNumber(tank.vacuo_alvo),
        this.pdfReportGenerator.formatNumber(tank.vacuo_inicial),
        this.pdfReportGenerator.formatNumber(tank.vacuo_final),
        this.pdfReportGenerator.formatNumber(tank.vacuo_medio),
        this.pdfReportGenerator.formatNumber(tank.eficiencia),
        tank.total_leituras,
        tank.total_alarmes,
      ]),
    );
  }

  private buildSensorsSection(data: ProcessReportData): Content {
    return this.pdfReportGenerator.buildSimpleTable(
      [
        'ID',
        'Nome',
        'Modelo',
        'Protocolo',
        'Unidade',
        'Tipo',
        'Status',
        'Tanque',
      ],
      data.sensores.map((sensor) => [
        sensor.id_sensor,
        sensor.nome,
        sensor.modelo,
        sensor.protocolo,
        sensor.unidade_medida,
        sensor.tipo_sensor_processo,
        sensor.status_sensor,
        sensor.tanque,
      ]),
    );
  }

  private buildReadingsSection(data: ProcessReportData): Content {
    const visibleReadings = data.leituras.slice(0, MAX_READINGS_IN_PDF);
    const table = this.pdfReportGenerator.buildSimpleTable(
      [
        'ID',
        'Tanque',
        'Sensor',
        'Tipo',
        'Valor',
        'Vácuo',
        'Unidade',
        'Leitura em',
        'Recebido em',
      ],
      visibleReadings.map((reading) => [
        reading.id_leitura_sensor,
        reading.nome_tanque,
        reading.nome_sensor,
        reading.tipo_leitura,
        this.pdfReportGenerator.formatNumber(reading.valor),
        this.pdfReportGenerator.formatNumber(reading.valor_vacuo),
        reading.unidade_medida,
        this.pdfReportGenerator.formatDateTime(reading.leitura_em),
        this.pdfReportGenerator.formatDateTime(reading.recebido_em),
      ]),
    );

    return this.withLimitNotice(
      table,
      data.leituras.length,
      MAX_READINGS_IN_PDF,
      'Exibindo as primeiras 200 leituras. A planilha XLSX contém a base completa.',
    );
  }

  private buildEventsSection(data: ProcessReportData): Content {
    const visibleEvents = data.eventos.slice(0, MAX_EVENTS_IN_PDF);
    const table = this.pdfReportGenerator.buildSimpleTable(
      ['ID', 'Tipo', 'Origem', 'Severidade', 'Ocorrido em'],
      visibleEvents.map((event) => [
        event.id_evento_processo,
        event.tipo_evento,
        event.origem_evento,
        event.severidade_evento,
        this.pdfReportGenerator.formatDateTime(event.ocorrido_em),
      ]),
    );

    return this.withLimitNotice(
      table,
      data.eventos.length,
      MAX_EVENTS_IN_PDF,
      'Exibindo os primeiros 100 eventos no PDF.',
    );
  }

  private buildAlarmsSection(data: ProcessReportData): Content {
    const visibleAlarms = data.alarmes.slice(0, MAX_ALARMS_IN_PDF);
    const table = this.pdfReportGenerator.buildSimpleTable(
      [
        'ID',
        'Título',
        'Tipo',
        'Severidade',
        'Status',
        'Origem',
        'Valor detectado',
        'Unidade',
        'Ocorrido em',
        'Resolvido em',
      ],
      visibleAlarms.map((alarm) => [
        alarm.id_alarme,
        alarm.titulo,
        alarm.tipo_alarme,
        alarm.severidade,
        alarm.status_alarme,
        alarm.origem_alarme,
        this.pdfReportGenerator.formatNumber(alarm.valor_detectado),
        alarm.unidade,
        this.pdfReportGenerator.formatDateTime(alarm.ocorrido_em),
        this.pdfReportGenerator.formatDateTime(alarm.resolvido_em),
      ]),
    );

    return this.withLimitNotice(
      table,
      data.alarmes.length,
      MAX_ALARMS_IN_PDF,
      'Exibindo os primeiros 100 alarmes no PDF.',
    );
  }

  private buildDiagnosticSection(data: ProcessReportData): Content {
    return {
      stack: [
        this.pdfReportGenerator.buildKeyValueTable([
          ['Nível', data.diagnostico.nivel],
          ['Mensagem', data.diagnostico.mensagem],
        ]),
        this.buildTextList('Motivos', data.diagnostico.motivos),
        this.buildTextList('Recomendações', data.diagnostico.recomendacoes),
      ],
    };
  }

  private buildTraceabilitySection(data: ProcessReportData): Content {
    return this.pdfReportGenerator.buildKeyValueTable([
      ['ID do processo', data.processo.id_processo],
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

  private withLimitNotice(
    content: Content,
    total: number,
    limit: number,
    message: string,
  ): Content {
    if (total <= limit) {
      return content;
    }

    return {
      stack: [
        content,
        {
          text: message,
          style: 'small',
          italics: true,
          margin: [0, 0, 0, 8],
        },
      ],
    };
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

  private buildFilename(data: ProcessReportData): string {
    return (
      [
        RELATORIO_FILE_PREFIX,
        RELATORIO_FILENAME_TYPE_SEGMENTS[tiporelatorio.PROCESSO],
        data.processo.id_processo,
        'relatorio',
        RELATORIO_FILE_EXTENSIONS[formatorelatorio.PDF],
      ].join('-') + `.${RELATORIO_FILE_EXTENSIONS[formatorelatorio.PDF]}`
    );
  }

  private calculateHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
