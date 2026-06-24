import { Injectable } from '@nestjs/common';
import { formatorelatorio, tiporelatorio } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Buffer } from 'node:buffer';
import type { Workbook, Worksheet } from 'exceljs';

import {
  RELATORIO_FILE_EXTENSIONS,
  RELATORIO_FILE_PREFIX,
  RELATORIO_FILENAME_TYPE_SEGMENTS,
  RELATORIO_MIME_TYPES,
  RELATORIO_PROCESS_TEMPLATE,
  RELATORIO_PROCESS_XLSX_SHEETS,
} from '../../constants';
import type {
  GeneratedReportFile,
  ProcessReportAlarmInfo,
  ProcessReportData,
  ProcessReportEventInfo,
  ProcessReportReadingInfo,
  ProcessReportSensorInfo,
  ProcessReportTankInfo,
} from '../../interfaces';
import { XlsxReportGenerator } from './xlsx-report.generator';
import type { XlsxColumnDefinition } from './xlsx-report.generator';

interface IndicatorRow {
  indicador: string;
  valor: string | number;
}

interface FieldValueRow {
  campo: string;
  valor: string | number;
}

@Injectable()
export class ProcessXlsxReportGenerator {
  constructor(private readonly xlsxReportGenerator: XlsxReportGenerator) {}

  async generate(data: ProcessReportData): Promise<GeneratedReportFile> {
    const workbook = this.buildWorkbook(data);
    const buffer =
      await this.xlsxReportGenerator.writeWorkbookToBuffer(workbook);

    return {
      buffer,
      filename: this.buildFilename(data),
      extension: RELATORIO_FILE_EXTENSIONS[formatorelatorio.XLSX],
      mime_type: RELATORIO_MIME_TYPES[formatorelatorio.XLSX],
      size_bytes: buffer.length,
      hash_arquivo: this.calculateHash(buffer),
    };
  }

  private buildWorkbook(data: ProcessReportData): Workbook {
    const workbook = this.xlsxReportGenerator.createWorkbook();

    this.addResumoSheet(workbook, data);
    this.addProcessoSheet(workbook, data);
    this.addTanquesSheet(workbook, data);
    this.addLeiturasSheet(workbook, data);
    this.addEventosSheet(workbook, data);
    this.addAlarmesSheet(workbook, data);
    this.addSensoresSheet(workbook, data);

    return workbook;
  }

  private addResumoSheet(workbook: Workbook, data: ProcessReportData): void {
    const worksheet = this.createSheet(
      workbook,
      RELATORIO_PROCESS_XLSX_SHEETS[0],
    );

    this.xlsxReportGenerator.addTitleRow(
      worksheet,
      RELATORIO_PROCESS_TEMPLATE.TITLE,
    );
    this.xlsxReportGenerator.addMetadataRows(worksheet, [
      ['ID do processo', data.processo.id_processo],
      ['Nome do processo', data.processo.nome_processo],
      ['Status', data.processo.status_processo],
      ['Gerado por', data.contexto_geracao.nome_usuario],
      ['Gerado em', data.contexto_geracao.gerado_em],
    ]);
    this.xlsxReportGenerator.addTable<IndicatorRow>(worksheet, {
      columns: [
        { header: 'Indicador', key: 'indicador', width: 35 },
        { header: 'Valor', key: 'valor', width: 30 },
      ],
      rows: [
        { indicador: 'Total de tanques', valor: data.resumo.total_tanques },
        { indicador: 'Total de sensores', valor: data.resumo.total_sensores },
        { indicador: 'Total de leituras', valor: data.resumo.total_leituras },
        { indicador: 'Total de eventos', valor: data.resumo.total_eventos },
        { indicador: 'Total de alarmes', valor: data.resumo.total_alarmes },
        {
          indicador: 'Total de alarmes críticos',
          valor: data.resumo.total_alarmes_criticos,
        },
        {
          indicador: 'Total de alarmes médios',
          valor: data.resumo.total_alarmes_medios,
        },
        {
          indicador: 'Total de alarmes info',
          valor: data.resumo.total_alarmes_info,
        },
        {
          indicador: 'Total de alarmes resolvidos',
          valor: data.resumo.total_alarmes_resolvidos,
        },
        {
          indicador: 'Total de alarmes ativos',
          valor: data.resumo.total_alarmes_ativos,
        },
        {
          indicador: 'Eficiência média',
          valor: this.normalizeNumber(data.resumo.eficiencia_media),
        },
        {
          indicador: 'Vácuo médio geral',
          valor: this.normalizeNumber(data.resumo.vacuo_medio_geral),
        },
        {
          indicador: 'Tempo execução total',
          valor: this.normalizeNumber(data.resumo.tempo_execucao_total),
        },
      ],
    });
    this.xlsxReportGenerator.addTable<IndicatorRow>(worksheet, {
      columns: [
        { header: 'Diagnóstico', key: 'indicador', width: 35 },
        { header: 'Valor', key: 'valor', width: 60 },
      ],
      rows: [
        { indicador: 'Nível', valor: data.diagnostico.nivel },
        { indicador: 'Mensagem', valor: data.diagnostico.mensagem },
        {
          indicador: 'Motivos',
          valor: this.joinTextList(data.diagnostico.motivos),
        },
        {
          indicador: 'Recomendações',
          valor: this.joinTextList(data.diagnostico.recomendacoes),
        },
      ],
    });
    this.finishSheet(worksheet);
  }

  private addProcessoSheet(workbook: Workbook, data: ProcessReportData): void {
    const worksheet = this.createSheet(
      workbook,
      RELATORIO_PROCESS_XLSX_SHEETS[1],
    );

    this.xlsxReportGenerator.addTitleRow(worksheet, 'Processo');
    this.xlsxReportGenerator.addTable<FieldValueRow>(worksheet, {
      columns: [
        { header: 'Campo', key: 'campo', width: 35 },
        { header: 'Valor', key: 'valor', width: 45 },
      ],
      rows: [
        { campo: 'ID Processo', valor: data.processo.id_processo },
        {
          campo: 'Nome Processo',
          valor: this.xlsxReportGenerator.formatText(
            data.processo.nome_processo,
          ),
        },
        { campo: 'Status', valor: data.processo.status_processo },
        { campo: 'Vácuo Alvo', valor: data.processo.vacuo_alvo },
        {
          campo: 'Vácuo Inicial',
          valor: this.normalizeNumber(data.processo.vacuo_inicial),
        },
        {
          campo: 'Vácuo Final',
          valor: this.normalizeNumber(data.processo.vacuo_final),
        },
        {
          campo: 'Vácuo Médio',
          valor: this.normalizeNumber(data.processo.vacuo_medio),
        },
        {
          campo: 'Eficiência',
          valor: this.normalizeNumber(data.processo.eficiencia),
        },
        { campo: 'Tempo Máximo', valor: data.processo.tempo_maximo },
        {
          campo: 'Tempo Execução',
          valor: this.normalizeNumber(data.processo.tempo_execucao),
        },
        {
          campo: 'Parada Emergência',
          valor: this.xlsxReportGenerator.formatBoolean(
            data.processo.parada_emergencia,
          ),
        },
        {
          campo: 'Criado em',
          valor: this.xlsxReportGenerator.formatDateTime(
            data.processo.criado_em,
          ),
        },
        {
          campo: 'Iniciado em',
          valor: this.xlsxReportGenerator.formatDateTime(
            data.processo.iniciado_em,
          ),
        },
        {
          campo: 'Pausado em',
          valor: this.xlsxReportGenerator.formatDateTime(
            data.processo.pausado_em,
          ),
        },
        {
          campo: 'Retomado em',
          valor: this.xlsxReportGenerator.formatDateTime(
            data.processo.retomado_em,
          ),
        },
        {
          campo: 'Finalizado em',
          valor: this.xlsxReportGenerator.formatDateTime(
            data.processo.finalizado_em,
          ),
        },
      ],
    });
    this.finishSheet(worksheet);
  }

  private addTanquesSheet(workbook: Workbook, data: ProcessReportData): void {
    const worksheet = this.createSheet(
      workbook,
      RELATORIO_PROCESS_XLSX_SHEETS[2],
    );

    this.xlsxReportGenerator.addTitleRow(worksheet, 'Tanques');
    this.xlsxReportGenerator.addTable<ProcessReportTankInfo>(worksheet, {
      columns: this.buildTanquesColumns(),
      rows: data.tanques,
      emptyMessage: 'Nenhum tanque encontrado.',
    });
    this.finishSheet(worksheet);
  }

  private addLeiturasSheet(workbook: Workbook, data: ProcessReportData): void {
    const worksheet = this.createSheet(
      workbook,
      RELATORIO_PROCESS_XLSX_SHEETS[3],
    );

    this.xlsxReportGenerator.addTitleRow(worksheet, 'Leituras');
    this.xlsxReportGenerator.addTable<ProcessReportReadingInfo>(worksheet, {
      columns: this.buildLeiturasColumns(),
      rows: data.leituras,
      emptyMessage: 'Nenhuma leitura encontrada.',
    });
    this.finishSheet(worksheet);
  }

  private addEventosSheet(workbook: Workbook, data: ProcessReportData): void {
    const worksheet = this.createSheet(
      workbook,
      RELATORIO_PROCESS_XLSX_SHEETS[4],
    );

    this.xlsxReportGenerator.addTitleRow(worksheet, 'Eventos');
    this.xlsxReportGenerator.addTable<ProcessReportEventInfo>(worksheet, {
      columns: [
        { header: 'ID Evento', key: 'id_evento_processo', width: 14 },
        { header: 'Tipo Evento', key: 'tipo_evento', width: 24 },
        { header: 'Origem', key: 'origem_evento', width: 18 },
        { header: 'Severidade', key: 'severidade_evento', width: 18 },
        {
          header: 'Ocorrido em',
          key: 'ocorrido_em',
          width: 22,
          value: (row) =>
            this.xlsxReportGenerator.formatDateTime(row.ocorrido_em),
        },
        { header: 'ID PTS', key: 'id_processo_tanque_sensor', width: 14 },
      ],
      rows: data.eventos,
      emptyMessage: 'Nenhum evento encontrado.',
    });
    this.finishSheet(worksheet);
  }

  private addAlarmesSheet(workbook: Workbook, data: ProcessReportData): void {
    const worksheet = this.createSheet(
      workbook,
      RELATORIO_PROCESS_XLSX_SHEETS[5],
    );

    this.xlsxReportGenerator.addTitleRow(worksheet, 'Alarmes');
    this.xlsxReportGenerator.addTable<ProcessReportAlarmInfo>(worksheet, {
      columns: this.buildAlarmesColumns(),
      rows: data.alarmes,
      emptyMessage: 'Nenhum alarme encontrado.',
    });
    this.finishSheet(worksheet);
  }

  private addSensoresSheet(workbook: Workbook, data: ProcessReportData): void {
    const worksheet = this.createSheet(
      workbook,
      RELATORIO_PROCESS_XLSX_SHEETS[6],
    );

    this.xlsxReportGenerator.addTitleRow(worksheet, 'Sensores');
    this.xlsxReportGenerator.addTable<ProcessReportSensorInfo>(worksheet, {
      columns: [
        { header: 'ID Sensor', key: 'id_sensor', width: 14 },
        { header: 'Nome', key: 'nome', width: 24 },
        { header: 'Modelo', key: 'modelo', width: 24 },
        { header: 'Protocolo', key: 'protocolo', width: 18 },
        { header: 'Unidade Medida', key: 'unidade_medida', width: 18 },
        { header: 'Tipo no Processo', key: 'tipo_sensor_processo', width: 22 },
        { header: 'Status Sensor', key: 'status_sensor', width: 18 },
        {
          header: 'Última Leitura',
          key: 'ultima_leitura',
          width: 22,
          value: (row) =>
            this.xlsxReportGenerator.formatDateTime(row.ultima_leitura),
        },
        {
          header: 'Último Valor Lido',
          key: 'ultimo_valor_lido',
          width: 20,
          value: (row) => this.normalizeNumber(row.ultimo_valor_lido),
        },
        { header: 'Tanque', key: 'tanque', width: 24 },
      ],
      rows: data.sensores,
      emptyMessage: 'Nenhum sensor encontrado.',
    });
    this.finishSheet(worksheet);
  }

  private buildTanquesColumns(): XlsxColumnDefinition<ProcessReportTankInfo>[] {
    return [
      { header: 'ID Processo Tanque', key: 'id_processo_tanque', width: 20 },
      { header: 'ID Tanque', key: 'id_tanque', width: 14 },
      { header: 'Nome Tanque', key: 'nome_tanque', width: 24 },
      { header: 'Status', key: 'status_tanque_processo', width: 18 },
      { header: 'Volume', key: 'volume', width: 14 },
      { header: 'Unidade Volume', key: 'unidade_volume', width: 18 },
      { header: 'Vácuo Alvo', key: 'vacuo_alvo', width: 14 },
      {
        header: 'Vácuo Inicial',
        key: 'vacuo_inicial',
        width: 16,
        value: (row) => this.normalizeNumber(row.vacuo_inicial),
      },
      {
        header: 'Vácuo Final',
        key: 'vacuo_final',
        width: 16,
        value: (row) => this.normalizeNumber(row.vacuo_final),
      },
      {
        header: 'Vácuo Médio',
        key: 'vacuo_medio',
        width: 16,
        value: (row) => this.normalizeNumber(row.vacuo_medio),
      },
      {
        header: 'Eficiência',
        key: 'eficiencia',
        width: 16,
        value: (row) => this.normalizeNumber(row.eficiencia),
      },
      {
        header: 'Iniciado em',
        key: 'iniciado_em',
        width: 22,
        value: (row) =>
          this.xlsxReportGenerator.formatDateTime(row.iniciado_em),
      },
      {
        header: 'Finalizado em',
        key: 'finalizado_em',
        width: 22,
        value: (row) =>
          this.xlsxReportGenerator.formatDateTime(row.finalizado_em),
      },
      { header: 'Total Sensores', key: 'total_sensores', width: 16 },
      { header: 'Total Leituras', key: 'total_leituras', width: 16 },
      { header: 'Total Alarmes', key: 'total_alarmes', width: 16 },
      { header: 'Volume Alvo ml', key: 'volume_alvo_ml', width: 18 },
      { header: 'Volume Enviado ml', key: 'volume_enviado_ml', width: 20 },
      {
        header: 'Vazão Atual L/min',
        key: 'vazao_atual_l_min',
        width: 20,
      },
      {
        header: 'Nível Atual %',
        key: 'nivel_atual_percentual',
        width: 18,
      },
    ];
  }

  private buildLeiturasColumns(): XlsxColumnDefinition<ProcessReportReadingInfo>[] {
    return [
      { header: 'ID Leitura', key: 'id_leitura_sensor', width: 14 },
      { header: 'ID PTS', key: 'id_processo_tanque_sensor', width: 14 },
      { header: 'ID Tanque', key: 'id_tanque', width: 14 },
      { header: 'Nome Tanque', key: 'nome_tanque', width: 24 },
      { header: 'ID Sensor', key: 'id_sensor', width: 14 },
      { header: 'Nome Sensor', key: 'nome_sensor', width: 24 },
      { header: 'Tipo Leitura', key: 'tipo_leitura', width: 20 },
      { header: 'Valor', key: 'valor', width: 14 },
      {
        header: 'Valor Vácuo',
        key: 'valor_vacuo',
        width: 16,
        value: (row) => this.normalizeNumber(row.valor_vacuo),
      },
      { header: 'Unidade', key: 'unidade_medida', width: 14 },
      {
        header: 'Leitura em',
        key: 'leitura_em',
        width: 22,
        value: (row) => this.xlsxReportGenerator.formatDateTime(row.leitura_em),
      },
      {
        header: 'Recebido em',
        key: 'recebido_em',
        width: 22,
        value: (row) =>
          this.xlsxReportGenerator.formatDateTime(row.recebido_em),
      },
      {
        header: 'Volume Acumulado ml',
        key: 'volume_acumulado_ml',
        width: 22,
      },
      {
        header: 'Percentual Nível',
        key: 'percentual_nivel',
        width: 20,
      },
    ];
  }

  private buildAlarmesColumns(): XlsxColumnDefinition<ProcessReportAlarmInfo>[] {
    return [
      { header: 'ID Alarme', key: 'id_alarme', width: 14 },
      { header: 'Título', key: 'titulo', width: 28 },
      { header: 'Descrição', key: 'descricao', width: 40 },
      { header: 'Tipo', key: 'tipo_alarme', width: 20 },
      { header: 'Severidade', key: 'severidade', width: 18 },
      { header: 'Status', key: 'status_alarme', width: 18 },
      { header: 'Origem', key: 'origem_alarme', width: 18 },
      {
        header: 'Valor Detectado',
        key: 'valor_detectado',
        width: 18,
        value: (row) => this.normalizeNumber(row.valor_detectado),
      },
      { header: 'Unidade', key: 'unidade', width: 14 },
      {
        header: 'Ocorrido em',
        key: 'ocorrido_em',
        width: 22,
        value: (row) =>
          this.xlsxReportGenerator.formatDateTime(row.ocorrido_em),
      },
      {
        header: 'Resolvido em',
        key: 'resolvido_em',
        width: 22,
        value: (row) =>
          this.xlsxReportGenerator.formatDateTime(row.resolvido_em),
      },
      { header: 'ID Processo Tanque', key: 'id_processo_tanque', width: 20 },
      { header: 'ID PTS', key: 'id_processo_tanque_sensor', width: 14 },
    ];
  }

  private createSheet(workbook: Workbook, name: string): Worksheet {
    return this.xlsxReportGenerator.addWorksheet(workbook, name);
  }

  private finishSheet(worksheet: Worksheet): void {
    this.xlsxReportGenerator.configureWorksheetDefaults(worksheet);
    this.xlsxReportGenerator.autoFitColumns(worksheet);
  }

  private buildFilename(data: ProcessReportData): string {
    return (
      [
        RELATORIO_FILE_PREFIX,
        RELATORIO_FILENAME_TYPE_SEGMENTS[tiporelatorio.PROCESSO],
        data.processo.id_processo,
        'relatorio',
        RELATORIO_FILE_EXTENSIONS[formatorelatorio.XLSX],
      ].join('-') + `.${RELATORIO_FILE_EXTENSIONS[formatorelatorio.XLSX]}`
    );
  }

  private calculateHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private normalizeNumber(value: number | null | undefined): string | number {
    return this.xlsxReportGenerator.formatNumber(value);
  }

  private joinTextList(values: readonly string[]): string {
    return values.length > 0 ? values.join('; ') : '-';
  }
}
