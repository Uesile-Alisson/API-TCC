import { Injectable } from '@nestjs/common';
import {
  Prisma,
  severidadealarme,
  statusalarme,
  statusprocesso,
} from '@prisma/client';

import type {
  ProcessReportAlarmInfo,
  ProcessReportData,
  ProcessReportDiagnostic,
  ProcessReportDiagnosticLevel,
  ProcessReportEventInfo,
  ProcessReportProcessInfo,
  ProcessReportReadingInfo,
  ProcessReportSensorInfo,
  ProcessReportSummary,
  ProcessReportTankInfo,
  ProcessReportUserInfo,
  RelatorioGenerationContext,
} from '../interfaces';
import type {
  AlarmsForProcessRecord,
  CompleteProcessReportSource,
  EventsForProcessRecord,
  ProcessForReportRecord,
  ReadingsForProcessRecord,
} from '../repositories';

export interface ToProcessReportDataParams {
  source: CompleteProcessReportSource;
  contexto_geracao: RelatorioGenerationContext;
}

type ProcessTankRecord = ProcessForReportRecord['processostanques'][number];
type ProcessTankSensorRecord =
  ProcessTankRecord['processostanquessensores'][number];

@Injectable()
export class ProcessReportDataMapper {
  toReportData(params: ToProcessReportDataParams): ProcessReportData {
    const processo = this.mapProcessInfo(params.source.processo);
    const tanques = this.mapTanks(params.source);
    const sensores = this.mapSensors(params.source);
    const leituras = this.mapReadings(params.source.leituras);
    const eventos = this.mapEvents(params.source.eventos);
    const alarmes = this.mapAlarms(params.source.alarmes);
    const resumo = this.buildSummary({
      processo,
      tanques,
      sensores,
      leituras,
      eventos,
      alarmes,
    });

    return {
      processo,
      usuario_responsavel: this.mapResponsibleUser(params.source.processo),
      tanques,
      sensores,
      leituras,
      eventos,
      alarmes,
      resumo,
      diagnostico: this.buildDiagnostic(processo, resumo, alarmes),
      contexto_geracao: params.contexto_geracao,
    };
  }

  private mapProcessInfo(
    record: ProcessForReportRecord,
  ): ProcessReportProcessInfo {
    return {
      id_processo: record.id_processo,
      nome_processo: this.stringOrNull(record.nome_processo),
      status_processo: record.status_processo,
      vacuo_alvo: this.decimalToNumber(record.vacuo_alvo) ?? 0,
      vacuo_inicial: this.decimalToNumber(record.vacuo_inicial),
      vacuo_final: this.decimalToNumber(record.vacuo_final),
      vacuo_medio: this.decimalToNumber(record.vacuo_medio),
      eficiencia: this.decimalToNumber(record.eficiencia),
      tempo_maximo: record.tempo_maximo,
      tempo_execucao: record.tempo_execucao,
      iniciado_em: this.dateOrNull(record.iniciado_em),
      pausado_em: this.dateOrNull(record.pausado_em),
      retomado_em: this.dateOrNull(record.retomado_em),
      finalizado_em: this.dateOrNull(record.finalizado_em),
      parada_emergencia: record.parada_emergencia,
      criado_em: this.dateOrFallback(record.criado_em),
    };
  }

  private mapResponsibleUser(
    record: ProcessForReportRecord,
  ): ProcessReportUserInfo | null {
    if (!record.usuarios) {
      return null;
    }

    return {
      id_usuario: record.usuarios.id_usuario,
      nome: record.usuarios.nome,
    };
  }

  private mapTanks(
    source: CompleteProcessReportSource,
  ): ProcessReportTankInfo[] {
    return source.processo.processostanques.map((tank) => {
      const sensorIds = new Set(
        tank.processostanquessensores.map(
          (sensor) => sensor.id_processo_tanque_sensor,
        ),
      );

      return {
        id_processo_tanque: tank.id_processo_tanque,
        id_tanque: tank.id_tanque,
        nome_tanque: this.stringOrFallback(
          tank.tanques.nome,
          `Tanque ${tank.id_tanque}`,
        ),
        status_tanque_processo: tank.status_tanque_processo,
        volume: this.decimalToNumber(tank.tanques.volume),
        unidade_volume: this.stringOrNull(tank.tanques.unidade_volume),
        vacuo_alvo: this.decimalToNumber(tank.vacuo_alvo) ?? 0,
        vacuo_inicial: this.decimalToNumber(tank.vacuo_inicial),
        vacuo_final: this.decimalToNumber(tank.vacuo_final),
        vacuo_medio: this.decimalToNumber(tank.vacuo_medio),
        eficiencia: this.decimalToNumber(tank.eficiencia),
        iniciado_em: this.dateOrNull(tank.iniciado_em),
        finalizado_em: this.dateOrNull(tank.finalizado_em),
        total_sensores: tank.processostanquessensores.length,
        total_leituras: source.leituras.filter((reading) =>
          sensorIds.has(reading.id_processo_tanque_sensor),
        ).length,
        total_alarmes: source.alarmes.filter(
          (alarm) =>
            alarm.id_processo_tanque === tank.id_processo_tanque ||
            (alarm.id_processo_tanque_sensor !== null &&
              sensorIds.has(alarm.id_processo_tanque_sensor)),
        ).length,
        volume_alvo_ml: this.decimalToNumber(tank.volume_alvo_ml),
        volume_enviado_ml: this.decimalToNumber(tank.volume_enviado_ml),
        vazao_atual_l_min: this.decimalToNumber(tank.vazao_atual_l_min),
        nivel_atual_percentual: this.decimalToNumber(
          tank.nivel_atual_percentual,
        ),
      };
    });
  }

  private mapSensors(
    source: CompleteProcessReportSource,
  ): ProcessReportSensorInfo[] {
    const sensors = source.processo.processostanques.flatMap((tank) =>
      tank.processostanquessensores.map((processSensor) =>
        this.mapSensor(processSensor, tank),
      ),
    );

    return this.uniqueById(sensors, (sensor) => sensor.id_sensor);
  }

  private mapSensor(
    processSensor: ProcessTankSensorRecord,
    tank: ProcessTankRecord,
  ): ProcessReportSensorInfo {
    return {
      id_sensor: processSensor.sensores.id_sensor,
      nome: processSensor.sensores.nome,
      modelo: processSensor.sensores.modelo,
      protocolo: String(processSensor.sensores.protocolo),
      unidade_medida: processSensor.sensores.unidade_medida,
      tipo_sensor_processo: processSensor.tipo_sensor_processo,
      status_sensor: String(processSensor.sensores.status_sensor),
      ultima_leitura: this.dateOrNull(processSensor.sensores.ultima_leitura),
      ultimo_valor_lido: this.decimalToNumber(
        processSensor.sensores.ultimo_valor_lido,
      ),
      tanque: this.stringOrNull(tank.tanques.nome),
    };
  }

  private mapReadings(
    records: ReadingsForProcessRecord[],
  ): ProcessReportReadingInfo[] {
    return records.map((record) => ({
      id_leitura_sensor: record.id_leitura_sensor,
      id_processo_tanque_sensor: record.id_processo_tanque_sensor,
      id_tanque:
        record.processostanquessensores.processostanques.id_tanque ?? null,
      nome_tanque: this.stringOrNull(
        record.processostanquessensores.processostanques.tanques.nome,
      ),
      id_sensor: record.processostanquessensores.sensores.id_sensor,
      nome_sensor: this.stringOrNull(
        record.processostanquessensores.sensores.nome,
      ),
      tipo_leitura: record.tipo_leitura,
      valor: this.decimalToNumber(record.valor) ?? 0,
      valor_vacuo: this.decimalToNumber(record.valor_vacuo),
      unidade_medida: record.unidade_medida,
      leitura_em: this.dateOrFallback(record.leitura_em),
      recebido_em: this.dateOrFallback(record.recebido_em),
      volume_acumulado_ml: this.decimalToNumber(record.volume_acumulado_ml),
      percentual_nivel: this.decimalToNumber(record.percentual_nivel),
    }));
  }

  private mapEvents(
    records: EventsForProcessRecord[],
  ): ProcessReportEventInfo[] {
    return records.map((record) => ({
      id_evento_processo: record.id_evento_processo,
      tipo_evento: record.tipo_evento,
      origem_evento: record.origem_evento,
      severidade_evento: record.severidade_evento,
      ocorrido_em: this.dateOrFallback(record.ocorrido_em),
      id_processo_tanque_sensor: record.id_processo_tanque_sensor,
    }));
  }

  private mapAlarms(
    records: AlarmsForProcessRecord[],
  ): ProcessReportAlarmInfo[] {
    return records.map((record) => ({
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
      id_processo_tanque: record.id_processo_tanque,
      id_processo_tanque_sensor: record.id_processo_tanque_sensor,
    }));
  }

  private buildSummary(params: {
    processo: ProcessReportProcessInfo;
    tanques: ProcessReportTankInfo[];
    sensores: ProcessReportSensorInfo[];
    leituras: ProcessReportReadingInfo[];
    eventos: ProcessReportEventInfo[];
    alarmes: ProcessReportAlarmInfo[];
  }): ProcessReportSummary {
    return {
      total_tanques: params.tanques.length,
      total_sensores: params.sensores.length,
      total_leituras: params.leituras.length,
      total_eventos: params.eventos.length,
      total_alarmes: params.alarmes.length,
      total_alarmes_criticos: this.countBy(
        params.alarmes,
        (alarm) => alarm.severidade === severidadealarme.CRITICO,
      ),
      total_alarmes_medios: this.countBy(
        params.alarmes,
        (alarm) => alarm.severidade === severidadealarme.MEDIO,
      ),
      total_alarmes_info: this.countBy(
        params.alarmes,
        (alarm) => alarm.severidade === severidadealarme.INFO,
      ),
      total_alarmes_resolvidos: this.countBy(
        params.alarmes,
        (alarm) => alarm.status_alarme === statusalarme.RESOLVIDO,
      ),
      total_alarmes_ativos: this.countBy(
        params.alarmes,
        (alarm) => alarm.status_alarme === statusalarme.ATIVO,
      ),
      eficiencia_media:
        this.average(params.tanques.map((tank) => tank.eficiencia)) ??
        params.processo.eficiencia,
      vacuo_medio_geral:
        this.average(params.tanques.map((tank) => tank.vacuo_medio)) ??
        params.processo.vacuo_medio,
      tempo_execucao_total: params.processo.tempo_execucao,
    };
  }

  private buildDiagnostic(
    processo: ProcessReportProcessInfo,
    resumo: ProcessReportSummary,
    alarmes: ProcessReportAlarmInfo[],
  ): ProcessReportDiagnostic {
    const motivos: string[] = [];

    if (processo.parada_emergencia) {
      motivos.push('Processo registrou parada de emergência.');
    }

    if (processo.status_processo === statusprocesso.FALHA) {
      motivos.push('Processo finalizado com status de falha.');
    }

    if (
      alarmes.some(
        (alarm) =>
          alarm.severidade === severidadealarme.CRITICO &&
          alarm.status_alarme === statusalarme.ATIVO,
      )
    ) {
      motivos.push('Existem alarmes críticos ativos relacionados ao processo.');
    }

    if (processo.status_processo === statusprocesso.INTERROMPIDO) {
      motivos.push('Processo foi interrompido.');
    }

    if (resumo.total_alarmes_medios > 0) {
      motivos.push('Existem alarmes de severidade média relacionados.');
    }

    if (resumo.total_alarmes_ativos > 0) {
      motivos.push('Existem alarmes ativos relacionados.');
    }

    const nivel = this.resolveDiagnosticLevel(processo, resumo, alarmes);

    return {
      nivel,
      mensagem: this.resolveDiagnosticMessage(nivel),
      motivos,
      recomendacoes: this.resolveDiagnosticRecommendations(nivel),
    };
  }

  private resolveDiagnosticLevel(
    processo: ProcessReportProcessInfo,
    resumo: ProcessReportSummary,
    alarmes: ProcessReportAlarmInfo[],
  ): ProcessReportDiagnosticLevel {
    if (
      processo.parada_emergencia ||
      processo.status_processo === statusprocesso.FALHA ||
      alarmes.some(
        (alarm) =>
          alarm.severidade === severidadealarme.CRITICO &&
          alarm.status_alarme === statusalarme.ATIVO,
      )
    ) {
      return 'CRITICO';
    }

    if (
      processo.status_processo === statusprocesso.INTERROMPIDO ||
      resumo.total_alarmes_medios > 0 ||
      resumo.total_alarmes_ativos > 0
    ) {
      return 'ATENCAO';
    }

    return 'NORMAL';
  }

  private resolveDiagnosticMessage(
    nivel: ProcessReportDiagnosticLevel,
  ): string {
    if (nivel === 'CRITICO') {
      return 'Processo apresentou condição crítica ou parada de emergência.';
    }

    if (nivel === 'ATENCAO') {
      return 'Processo possui ocorrências que exigem análise técnica.';
    }

    return 'Processo não apresentou inconsistências relevantes nos dados consolidados.';
  }

  private resolveDiagnosticRecommendations(
    nivel: ProcessReportDiagnosticLevel,
  ): string[] {
    if (nivel === 'CRITICO') {
      return [
        'Revisar alarmes críticos relacionados ao processo.',
        'Verificar sensores e condições de segurança operacional.',
      ];
    }

    if (nivel === 'ATENCAO') {
      return [
        'Revisar eventos e alarmes registrados.',
        'Comparar leituras para identificar desvios operacionais.',
      ];
    }

    return ['Manter rotina de monitoramento e rastreabilidade.'];
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

  private stringOrFallback(
    value: string | null | undefined,
    fallback: string,
  ): string {
    return this.stringOrNull(value) ?? fallback;
  }

  private countBy<T>(
    items: readonly T[],
    predicate: (item: T) => boolean,
  ): number {
    return items.filter(predicate).length;
  }

  private average(
    values: readonly (number | null | undefined)[],
  ): number | null {
    const validValues = values.filter(
      (value): value is number =>
        value !== null && value !== undefined && Number.isFinite(value),
    );

    if (validValues.length === 0) {
      return null;
    }

    return (
      validValues.reduce((total, value) => total + value, 0) /
      validValues.length
    );
  }

  private uniqueById<T>(
    items: readonly T[],
    getId: (item: T) => number | null | undefined,
  ): T[] {
    const seenIds = new Set<number>();
    const uniqueItems: T[] = [];

    for (const item of items) {
      const id = getId(item);

      if (id === null || id === undefined || seenIds.has(id)) {
        continue;
      }

      seenIds.add(id);
      uniqueItems.push(item);
    }

    return uniqueItems;
  }
}
