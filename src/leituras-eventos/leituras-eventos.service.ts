import { Injectable } from '@nestjs/common';

import {
  GraficoVacuoQueryDto,
  ListEventosQueryDto,
  ListLeiturasQueryDto,
  ProcessoTimelineQueryDto,
} from './dto';
import type {
  EventoDetails,
  EventoListResponse,
  LeituraChartResponse,
  LeituraDashboard,
  LeituraDetails,
  LeituraListResponse,
  ProcessoOperationalSummary,
  ProcessoTimelineResponse,
} from './interfaces';
import { EventosRepository, LeiturasRepository } from './repositories';
import type {
  EventoDetailsRecord,
  LeituraChartRecord,
  LeituraDetailsRecord,
  LeituraListRecord,
} from './repositories';
import { EventoMapper, GraficoVacuoMapper, LeituraMapper } from './mappers';
import { LeiturasAnalyticsService } from './analytics';
import { ProcessoTimelineService } from './timeline';
import {
  LeiturasEventosQueryValidator,
  ProcessoLeituraValidator,
} from './validators';

type LeituraDetailsMapperInput = Parameters<LeituraMapper['toDetails']>[0];
type EventoDetailsMapperInput = Parameters<EventoMapper['toDetails']>[0];
type LeituraValidatorInput = Parameters<
  ProcessoLeituraValidator['validateLeituraExists']
>[0];
type EventoValidatorInput = Parameters<
  ProcessoLeituraValidator['validateEventoExists']
>[0];

@Injectable()
export class LeiturasEventosService {
  constructor(
    private readonly leiturasRepository: LeiturasRepository,
    private readonly eventosRepository: EventosRepository,
    private readonly leituraMapper: LeituraMapper,
    private readonly eventoMapper: EventoMapper,
    private readonly graficoVacuoMapper: GraficoVacuoMapper,
    private readonly leiturasAnalyticsService: LeiturasAnalyticsService,
    private readonly processoTimelineService: ProcessoTimelineService,
    private readonly queryValidator: LeiturasEventosQueryValidator,
    private readonly processoLeituraValidator: ProcessoLeituraValidator,
  ) {}

  async listLeituras(
    query: ListLeiturasQueryDto = {},
  ): Promise<LeituraListResponse> {
    this.queryValidator.validateListLeiturasQuery(query);

    const result = await this.leiturasRepository.listAndCount(query);

    return this.leituraMapper.toListResponse(
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  }

  async findLeituraById(id_leitura_sensor: number): Promise<LeituraDetails> {
    const leitura =
      await this.leiturasRepository.findDetailsById(id_leitura_sensor);

    this.assertLeituraDetailsExists(leitura);

    return this.leituraMapper.toDetails(
      this.toLeituraDetailsMapperInput(leitura),
    );
  }

  async listLeiturasByProcess(
    id_processo: number,
    query: ListLeiturasQueryDto = {},
  ): Promise<LeituraListResponse> {
    this.queryValidator.validateListLeiturasQuery(query);

    const result = await this.leiturasRepository.listAndCount({
      ...query,
      id_processo,
    });

    return this.leituraMapper.toListResponse(
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  }

  async listLeiturasByProcessTanqueSensor(
    id_processo_tanque_sensor: number,
    query: ListLeiturasQueryDto = {},
  ): Promise<LeituraListResponse> {
    this.queryValidator.validateListLeiturasQuery(query);

    const result = await this.leiturasRepository.listAndCount({
      ...query,
      id_processo_tanque_sensor,
    });

    return this.leituraMapper.toListResponse(
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  }

  async getGraficoVacuoByProcess(
    id_processo: number,
    query: GraficoVacuoQueryDto = {},
  ): Promise<LeituraChartResponse> {
    this.queryValidator.validateGraficoVacuoQuery(query);

    const leituras = await this.leiturasRepository.findChartDataByProcess(
      id_processo,
      query,
    );

    return this.graficoVacuoMapper.toChartResponse({
      id_processo,
      id_processo_tanque_sensor: query.id_processo_tanque_sensor ?? null,
      vacuo_alvo: null,
      leituras,
      intervalo: query.intervalo ?? null,
      limit: query.limit,
    });
  }

  async getGraficoVacuoByProcessTanqueSensor(
    id_processo_tanque_sensor: number,
    query: GraficoVacuoQueryDto = {},
  ): Promise<LeituraChartResponse> {
    this.queryValidator.validateGraficoVacuoQuery(query);

    const leituras =
      await this.leiturasRepository.findChartDataByProcessTanqueSensor(
        id_processo_tanque_sensor,
        query,
      );
    const idProcesso = this.extractProcessIdFromChartData(leituras) ?? 0;

    return this.graficoVacuoMapper.toChartResponse({
      id_processo: idProcesso,
      id_processo_tanque_sensor,
      vacuo_alvo: null,
      leituras,
      intervalo: query.intervalo ?? null,
      limit: query.limit,
    });
  }

  async getResumoOperacionalByProcess(
    id_processo: number,
  ): Promise<ProcessoOperationalSummary> {
    const [leituras, eventosStats] = await Promise.all([
      this.leiturasRepository.getStatsByProcess(id_processo),
      this.eventosRepository.getEventStatsByProcess(id_processo),
    ]);
    const analytics =
      this.leiturasAnalyticsService.calculateAnalytics(leituras);

    return {
      id_processo,
      total_leituras: analytics.stats.total_leituras,
      total_eventos: eventosStats.total_eventos,
      primeira_leitura_em: analytics.stats.primeira_leitura_em,
      ultima_leitura_em: analytics.stats.ultima_leitura_em,
      primeiro_evento_em: eventosStats.primeiro_evento_em,
      ultimo_evento_em: eventosStats.ultimo_evento_em,
      vacuo_minimo: analytics.stats.vacuo_minimo,
      vacuo_maximo: analytics.stats.vacuo_maximo,
      vacuo_medio: analytics.stats.vacuo_medio,
      eventos_criticos: eventosStats.eventos_criticos,
      eventos_medios: eventosStats.eventos_medios,
      eventos_info: eventosStats.eventos_info,
      generated_at: analytics.generated_at,
    };
  }

  async getLeiturasDashboard(
    query: ListLeiturasQueryDto = {},
  ): Promise<LeituraDashboard> {
    this.queryValidator.validateListLeiturasQuery(query);

    const leituras = await this.leiturasRepository.list(query);
    const analytics =
      this.leiturasAnalyticsService.calculateAnalytics(leituras);

    return {
      total_leituras: analytics.stats.total_leituras,
      leituras_ultima_hora: this.calculateLeiturasUltimaHora(leituras),
      leituras_hoje: this.calculateLeiturasHoje(leituras),
      sensores_com_leitura: this.countDistinct(
        leituras,
        (leitura) => leitura.id_processo_tanque_sensor,
      ),
      processos_com_leitura: this.countDistinct(
        leituras,
        (leitura) =>
          leitura.processostanquessensores?.processostanques?.processos
            ?.id_processo ?? null,
      ),
      vacuo_minimo: analytics.stats.vacuo_minimo,
      vacuo_maximo: analytics.stats.vacuo_maximo,
      vacuo_medio: analytics.stats.vacuo_medio,
      primeira_leitura_em: analytics.stats.primeira_leitura_em,
      ultima_leitura_em: analytics.stats.ultima_leitura_em,
      generated_at: analytics.generated_at,
    };
  }

  async listEventos(
    query: ListEventosQueryDto = {},
  ): Promise<EventoListResponse> {
    this.queryValidator.validateListEventosQuery(query);

    const result = await this.eventosRepository.listAndCount(query);

    return this.eventoMapper.toListResponse(
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  }

  async findEventoById(id_evento_processo: number): Promise<EventoDetails> {
    const evento =
      await this.eventosRepository.findDetailsById(id_evento_processo);

    this.assertEventoDetailsExists(evento);

    return this.eventoMapper.toDetails(this.toEventoDetailsMapperInput(evento));
  }

  async listEventosByProcess(
    id_processo: number,
    query: ListEventosQueryDto = {},
  ): Promise<EventoListResponse> {
    this.queryValidator.validateListEventosQuery(query);

    const result = await this.eventosRepository.listAndCount({
      ...query,
      id_processo,
    });

    return this.eventoMapper.toListResponse(
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  }

  async getProcessTimeline(
    id_processo: number,
    query: ProcessoTimelineQueryDto = {},
  ): Promise<ProcessoTimelineResponse> {
    this.queryValidator.validateTimelineQuery(query);

    const leiturasQuery: ListLeiturasQueryDto = {
      id_processo,
      leitura_de: query.ocorrido_de,
      leitura_ate: query.ocorrido_ate,
      limit: query.limit,
      order_by: 'leitura_em',
      order_direction: 'asc',
    };
    const eventosQuery: ListEventosQueryDto = {
      id_processo,
      ocorrido_de: query.ocorrido_de,
      ocorrido_ate: query.ocorrido_ate,
      limit: query.limit,
      order_by: 'ocorrido_em',
      order_direction: 'asc',
    };

    const [leituras, eventos] = await Promise.all([
      query.incluir_leituras === false
        ? Promise.resolve([])
        : this.leiturasRepository.list(leiturasQuery),
      query.incluir_eventos === false
        ? Promise.resolve([])
        : this.eventosRepository.findTimelineEventsByProcess(
            id_processo,
            eventosQuery,
          ),
    ]);

    return this.processoTimelineService.buildProcessTimeline({
      id_processo,
      leituras,
      eventos,
      incluir_leituras: query.incluir_leituras,
      incluir_eventos: query.incluir_eventos,
      limit: query.limit,
    });
  }

  private assertLeituraDetailsExists(
    leitura: LeituraDetailsRecord | null,
  ): asserts leitura is LeituraDetailsRecord {
    this.processoLeituraValidator.validateLeituraExists(
      this.toLeituraProcessoContext(leitura),
    );
  }

  private assertEventoDetailsExists(
    evento: EventoDetailsRecord | null,
  ): asserts evento is EventoDetailsRecord {
    this.processoLeituraValidator.validateEventoExists(
      this.toEventoProcessoContext(evento),
    );
  }

  private toLeituraProcessoContext(
    leitura: LeituraDetailsRecord | null,
  ): LeituraValidatorInput {
    if (!leitura) {
      return null;
    }

    const processoTanqueSensor = leitura.processostanquessensores;
    const processoTanque = processoTanqueSensor?.processostanques;
    const idProcesso = processoTanque?.processos?.id_processo ?? null;

    return {
      id_leitura_sensor: leitura.id_leitura_sensor,
      id_processo_tanque_sensor: leitura.id_processo_tanque_sensor,
      id_processo: idProcesso,
      processo_tanque_sensor: {
        id_processo_tanque_sensor: leitura.id_processo_tanque_sensor,
        id_processo_tanque: processoTanque?.id_processo_tanque ?? null,
        id_processo: idProcesso,
        processo_tanque: processoTanque
          ? {
              id_processo_tanque: processoTanque.id_processo_tanque,
              id_processo: idProcesso,
            }
          : null,
      },
    };
  }

  private toEventoProcessoContext(
    evento: EventoDetailsRecord | null,
  ): EventoValidatorInput {
    if (!evento) {
      return null;
    }

    const processoTanqueSensor = evento.processostanquessensores;

    return {
      id_evento_processo: evento.id_evento_processo,
      id_processo: evento.id_processo,
      id_processo_tanque_sensor: evento.id_processo_tanque_sensor,
      processo_tanque_sensor: processoTanqueSensor
        ? {
            id_processo_tanque_sensor:
              processoTanqueSensor.id_processo_tanque_sensor,
            id_processo_tanque: processoTanqueSensor.id_processo_tanque,
            id_processo: evento.id_processo,
            processo_tanque: {
              id_processo_tanque: processoTanqueSensor.id_processo_tanque,
              id_processo: evento.id_processo,
            },
          }
        : null,
    };
  }

  private toLeituraDetailsMapperInput(
    leitura: LeituraDetailsRecord,
  ): LeituraDetailsMapperInput {
    const processoTanqueSensor = leitura.processostanquessensores;
    const sensor = processoTanqueSensor?.sensores;
    const processoTanque = processoTanqueSensor?.processostanques;
    const processo = processoTanque?.processos;
    const tanque = processoTanque?.tanques;

    return {
      id_leitura_sensor: leitura.id_leitura_sensor,
      id_processo_tanque_sensor: leitura.id_processo_tanque_sensor,
      valor_vacuo: leitura.valor_vacuo,
      leitura_em: leitura.leitura_em,
      recebido_em: leitura.recebido_em,
      processo: processo
        ? {
            id_processo: processo.id_processo,
            nome_processo: processo.nome_processo,
            status_processo: processo.status_processo,
            iniciado_em: processo.iniciado_em,
            finalizado_em: processo.finalizado_em,
          }
        : null,
      processo_tanque: processoTanque
        ? {
            id_processo_tanque: processoTanque.id_processo_tanque,
            id_tanque: processoTanque.id_tanque,
            nome_tanque: tanque?.nome ?? null,
            vacuo_alvo: processoTanque.vacuo_alvo,
            vacuo_inicial: processoTanque.vacuo_inicial,
            vacuo_final: processoTanque.vacuo_final,
            vacuo_medio: processoTanque.vacuo_medio,
            status_tanque_processo: processoTanque.status_tanque_processo,
          }
        : null,
      sensor: sensor
        ? {
            id_sensor: sensor.id_sensor,
            nome_sensor: sensor.nome,
            modelo_sensor: sensor.modelo,
            unidade_medida: sensor.unidade_medida,
            status_sensor: sensor.status_sensor,
          }
        : null,
    };
  }

  private toEventoDetailsMapperInput(
    evento: EventoDetailsRecord,
  ): EventoDetailsMapperInput {
    const processo = evento.processos;
    const processoTanqueSensor = evento.processostanquessensores;
    const sensor = processoTanqueSensor?.sensores;
    const processoTanque = processoTanqueSensor?.processostanques;
    const tanque = processoTanque?.tanques;

    return {
      id_evento_processo: evento.id_evento_processo,
      id_processo: evento.id_processo,
      id_processo_tanque_sensor: evento.id_processo_tanque_sensor,
      tipo_evento: evento.tipo_evento,
      origem_evento: evento.origem_evento,
      severidade_evento: evento.severidade_evento,
      ocorrido_em: evento.ocorrido_em,
      processo: processo
        ? {
            id_processo: processo.id_processo,
            nome_processo: processo.nome_processo,
            status_processo: processo.status_processo,
            iniciado_em: processo.iniciado_em,
            finalizado_em: processo.finalizado_em,
          }
        : null,
      processo_tanque_sensor: processoTanqueSensor
        ? {
            id_processo_tanque_sensor:
              processoTanqueSensor.id_processo_tanque_sensor,
            id_processo_tanque: processoTanqueSensor.id_processo_tanque,
            id_sensor: processoTanqueSensor.id_sensor,
          }
        : null,
      sensor: sensor
        ? {
            id_sensor: sensor.id_sensor,
            nome_sensor: sensor.nome,
            modelo_sensor: sensor.modelo,
            unidade_medida: sensor.unidade_medida,
            status_sensor: sensor.status_sensor,
          }
        : null,
      tanque: processoTanque
        ? {
            id_processo_tanque: processoTanque.id_processo_tanque,
            id_tanque: processoTanque.id_tanque,
            nome_tanque: tanque?.nome ?? null,
            status_tanque_processo: processoTanque.status_tanque_processo,
          }
        : null,
    };
  }

  private extractProcessIdFromChartData(
    leituras: LeituraChartRecord[],
  ): number | null {
    const [firstLeitura] = leituras;

    if (!firstLeitura) {
      return null;
    }

    return this.extractProcessIdFromUnknown(firstLeitura);
  }

  private calculateLeiturasHoje(leituras: LeituraListRecord[]): number {
    const now = new Date();

    return leituras.filter((leitura) =>
      this.isSameLocalDate(leitura.leitura_em, now),
    ).length;
  }

  private calculateLeiturasUltimaHora(leituras: LeituraListRecord[]): number {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    return leituras.filter(
      (leitura) => leitura.leitura_em.getTime() >= oneHourAgo,
    ).length;
  }

  private countDistinct<T>(
    items: T[],
    selectValue: (item: T) => number | null | undefined,
  ): number {
    const values = items
      .map((item) => selectValue(item))
      .filter((value): value is number => this.isPositiveInteger(value));

    return new Set(values).size;
  }

  private extractProcessIdFromUnknown(value: unknown): number | null {
    const record = this.asRecord(value);

    if (!record) {
      return null;
    }

    const directId = this.getPositiveInteger(record, 'id_processo');

    if (directId !== null) {
      return directId;
    }

    const processo = this.asRecord(record.processos);
    const processoId = processo
      ? this.getPositiveInteger(processo, 'id_processo')
      : null;

    if (processoId !== null) {
      return processoId;
    }

    const processoTanqueSensor = this.asRecord(record.processostanquessensores);
    const processoTanque = this.asRecord(
      processoTanqueSensor?.processostanques,
    );
    const processoTanqueProcesso = this.asRecord(processoTanque?.processos);

    return processoTanqueProcesso
      ? this.getPositiveInteger(processoTanqueProcesso, 'id_processo')
      : null;
  }

  private getPositiveInteger(
    record: Record<string, unknown>,
    key: string,
  ): number | null {
    const value = record[key];

    return this.isPositiveInteger(value) ? value : null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;
  }

  private isSameLocalDate(current: Date, expected: Date): boolean {
    return (
      current.getFullYear() === expected.getFullYear() &&
      current.getMonth() === expected.getMonth() &&
      current.getDate() === expected.getDate()
    );
  }

  private isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }
}
