import { Injectable } from '@nestjs/common';
import { origemalarme, Prisma, severidadealarme } from '@prisma/client';

import type {
  AlarmReportAlarmInfo,
  AlarmReportData,
  AlarmReportDiagnostic,
  AlarmReportDiagnosticLevel,
  AlarmReportEventInfo,
  AlarmReportProcessInfo,
  AlarmReportReadingInfo,
  AlarmReportSensorInfo,
  AlarmReportTankInfo,
  AlarmReportUserInfo,
  RelatorioGenerationContext,
} from '../interfaces';
import type {
  AlarmForReportRecord,
  CompleteAlarmReportSource,
  EventsRelatedToAlarmRecord,
  ReadingsRelatedToAlarmRecord,
} from '../repositories';

export interface ToAlarmReportDataParams {
  source: CompleteAlarmReportSource;
  contexto_geracao: RelatorioGenerationContext;
}

@Injectable()
export class AlarmReportDataMapper {
  toReportData(params: ToAlarmReportDataParams): AlarmReportData {
    return {
      alarme: this.mapAlarmInfo(params.source.alarme),
      processo: this.mapRelatedProcess(params.source.alarme),
      tanque: this.mapRelatedTank(params.source.alarme),
      sensor: this.mapRelatedSensor(params.source.alarme),
      usuario_responsavel: this.mapResponsibleUser(params.source.alarme),
      leituras_relacionadas: this.mapRelatedReadings(params.source.leituras),
      eventos_relacionados: this.mapRelatedEvents(params.source.eventos),
      diagnostico: this.buildDiagnostic(params.source.alarme),
      contexto_geracao: params.contexto_geracao,
    };
  }

  private mapAlarmInfo(record: AlarmForReportRecord): AlarmReportAlarmInfo {
    return {
      id_alarme: record.id_alarme,
      titulo: record.titulo,
      descricao: record.descricao,
      tipo_alarme: record.tipo_alarme,
      severidade: record.severidade,
      status_alarme: record.status_alarme,
      origem_alarme: record.origem_alarme,
      valor_detectado: this.decimalToNumber(record.valor_detectado),
      unidade: this.stringOrNull(record.unidade),
      ocorrido_em: this.dateOrFallback(record.ocorrido_em),
      resolvido_em: this.dateOrNull(record.resolvido_em),
      id_processo: record.id_processo,
      id_processo_tanque: record.id_processo_tanque,
      id_processo_tanque_sensor: record.id_processo_tanque_sensor,
    };
  }

  private mapRelatedProcess(
    record: AlarmForReportRecord,
  ): AlarmReportProcessInfo | null {
    if (!record.processos) {
      return null;
    }

    return {
      id_processo: record.processos.id_processo,
      nome_processo: this.stringOrNull(record.processos.nome_processo),
      status_processo: record.processos.status_processo,
      iniciado_em: this.dateOrNull(record.processos.iniciado_em),
      finalizado_em: this.dateOrNull(record.processos.finalizado_em),
    };
  }

  private mapRelatedTank(
    record: AlarmForReportRecord,
  ): AlarmReportTankInfo | null {
    if (!record.processostanques) {
      return null;
    }

    return {
      id_processo_tanque: record.processostanques.id_processo_tanque,
      id_tanque: record.processostanques.id_tanque,
      nome_tanque: this.stringOrNull(record.processostanques.tanques.nome),
      status_tanque_processo: record.processostanques.status_tanque_processo,
    };
  }

  private mapRelatedSensor(
    record: AlarmForReportRecord,
  ): AlarmReportSensorInfo | null {
    if (!record.processostanquessensores) {
      return null;
    }

    return {
      id_processo_tanque_sensor:
        record.processostanquessensores.id_processo_tanque_sensor,
      id_sensor: record.processostanquessensores.sensores.id_sensor,
      nome_sensor: this.stringOrNull(
        record.processostanquessensores.sensores.nome,
      ),
      modelo: this.stringOrNull(
        record.processostanquessensores.sensores.modelo,
      ),
      tipo_sensor_processo:
        record.processostanquessensores.tipo_sensor_processo,
      unidade_medida: this.stringOrNull(
        record.processostanquessensores.sensores.unidade_medida,
      ),
    };
  }

  private mapResponsibleUser(
    record: AlarmForReportRecord,
  ): AlarmReportUserInfo | null {
    if (!record.usuarios) {
      return null;
    }

    return {
      id_usuario: record.usuarios.id_usuario,
      nome: record.usuarios.nome,
    };
  }

  private mapRelatedReadings(
    records: ReadingsRelatedToAlarmRecord[],
  ): AlarmReportReadingInfo[] {
    return records.map((record) => ({
      id_leitura_sensor: record.id_leitura_sensor,
      tipo_leitura: record.tipo_leitura,
      valor: this.decimalToNumber(record.valor) ?? 0,
      valor_vacuo: this.decimalToNumber(record.valor_vacuo),
      unidade_medida: record.unidade_medida,
      leitura_em: this.dateOrFallback(record.leitura_em),
    }));
  }

  private mapRelatedEvents(
    records: EventsRelatedToAlarmRecord[],
  ): AlarmReportEventInfo[] {
    return records.map((record) => ({
      id_evento_processo: record.id_evento_processo,
      tipo_evento: record.tipo_evento,
      origem_evento: record.origem_evento,
      severidade_evento: record.severidade_evento,
      ocorrido_em: this.dateOrFallback(record.ocorrido_em),
    }));
  }

  private buildDiagnostic(record: AlarmForReportRecord): AlarmReportDiagnostic {
    const nivel = this.resolveDiagnosticLevel(record.severidade);

    return {
      nivel,
      mensagem: this.resolveDiagnosticMessage(nivel),
      causa_provavel: this.resolveProbableCause(record.origem_alarme),
      impacto_operacional: this.resolveOperationalImpact(nivel),
      recomendacoes: this.resolveRecommendations(nivel),
    };
  }

  private resolveDiagnosticLevel(
    severidade: severidadealarme,
  ): AlarmReportDiagnosticLevel {
    if (severidade === severidadealarme.CRITICO) {
      return 'CRITICO';
    }

    if (severidade === severidadealarme.MEDIO) {
      return 'ATENCAO';
    }

    return 'INFO';
  }

  private resolveDiagnosticMessage(nivel: AlarmReportDiagnosticLevel): string {
    if (nivel === 'CRITICO') {
      return 'Alarme crítico registrado no sistema.';
    }

    if (nivel === 'ATENCAO') {
      return 'Alarme de severidade média registrado no sistema.';
    }

    return 'Alarme informativo registrado no sistema.';
  }

  private resolveProbableCause(origem: origemalarme): string | null {
    if (origem === origemalarme.SENSOR) {
      return 'Leitura ou estado reportado por sensor.';
    }

    if (origem === origemalarme.ESP32) {
      return 'Evento reportado pelo ESP32.';
    }

    if (origem === origemalarme.MQTT) {
      return 'Evento recebido pela comunicação MQTT.';
    }

    if (origem === origemalarme.BACKEND || origem === origemalarme.SISTEMA) {
      return 'Classificação operacional realizada pelo sistema.';
    }

    if (origem === origemalarme.USUARIO) {
      return 'Ocorrência associada a ação de usuário.';
    }

    return null;
  }

  private resolveOperationalImpact(
    nivel: AlarmReportDiagnosticLevel,
  ): string | null {
    if (nivel === 'CRITICO') {
      return 'Pode comprometer a segurança operacional ou interromper o processo.';
    }

    if (nivel === 'ATENCAO') {
      return 'Exige acompanhamento técnico e pode indicar desvio operacional.';
    }

    if (nivel === 'INFO') {
      return 'Registro informativo para rastreabilidade.';
    }

    return null;
  }

  private resolveRecommendations(nivel: AlarmReportDiagnosticLevel): string[] {
    if (nivel === 'CRITICO') {
      return [
        'Verificar processo relacionado, sensores e alarmes ativos.',
        'Avaliar a condição física do sistema antes de nova operação.',
      ];
    }

    if (nivel === 'ATENCAO') {
      return [
        'Acompanhar leituras próximas ao evento.',
        'Verificar possível reincidência operacional.',
      ];
    }

    return ['Manter registro para rastreabilidade.'];
  }

  private decimalToNumber(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue =
      typeof value === 'number' ? value : Number(value.toString());

    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private dateOrNull(value: Date | string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  private dateOrFallback(value: Date | string | null | undefined): Date {
    return this.dateOrNull(value) ?? new Date(0);
  }

  private stringOrNull(value: string | null | undefined): string | null {
    const normalized = value?.trim();

    return normalized && normalized.length > 0 ? normalized : null;
  }
}
