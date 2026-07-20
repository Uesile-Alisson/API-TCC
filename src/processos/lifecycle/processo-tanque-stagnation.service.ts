import { Injectable } from '@nestjs/common';
import {
  statusestagnacao,
  statustanqueprocesso,
  tipoeventoprocesso,
} from '@prisma/client';

export const DEFAULT_STAGNATION_WINDOW_SECONDS = 60;
export const DEFAULT_STAGNATION_MIN_VARIATION = 2;
export const DEFAULT_STAGNATION_MIN_READINGS = 5;
export const DEFAULT_STAGNATION_CONSECUTIVE_WINDOWS = 2;
export const STAGNATION_MIN_WINDOW_COVERAGE_RATIO = 0.8;

export interface ProcessoTanqueStagnationSample {
  valor_vacuo: number;
  recebido_em: Date;
}

export interface ProcessoTanqueStagnationInput {
  status_tanque_processo: statustanqueprocesso;
  status_atual: statusestagnacao;
  iniciada_em: Date | null;
  detectada_em: Date | null;
  ultima_avaliacao_em: Date | null;
  variacao_vacuo: number | null;
  leituras_janela: number;
  janelas_sem_progresso: number;
  janela_segundos: number;
  variacao_minima: number;
  leituras_minimas: number;
  janelas_consecutivas: number;
  execucao_iniciada_em: Date | null;
  avaliado_em: Date;
  amostras: ProcessoTanqueStagnationSample[];
  volume_tanque?: number | null;
  volume_medio_tanques_ativos?: number | null;
  tanques_ativos?: number;
  vacuo_alvo?: number | null;
  vacuo_atual?: number | null;
  fator_minimo_proximidade_alvo?: number;
  tempo_bomba_principal_segundos?: number;
  tempo_minimo_bomba_principal_segundos?: number;
  tempo_maximo_sem_progresso_segundos?: number;
  leitura_valida?: boolean;
}

export interface ProcessoTanqueStagnationUpdateData {
  status_estagnacao: statusestagnacao;
  estagnacao_iniciada_em: Date | null;
  estagnacao_detectada_em: Date | null;
  estagnacao_ultima_avaliacao_em: Date | null;
  estagnacao_variacao_vacuo: number | null;
  estagnacao_leituras_janela: number;
  estagnacao_janelas_sem_progresso: number;
  estagnacao_variacao_minima_ajustada?: number | null;
  estagnacao_fator_volume?: number | null;
  estagnacao_fator_tanques_ativos?: number | null;
  estagnacao_fator_proximidade_alvo?: number | null;
  estagnacao_volume_tanque?: number | null;
  estagnacao_volume_medio_tanques_ativos?: number | null;
  estagnacao_tanques_ativos?: number;
  estagnacao_vacuo_atual?: number | null;
  estagnacao_distancia_alvo?: number | null;
  estagnacao_tempo_bomba_principal_segundos?: number;
  estagnacao_motivo_decisao?: string | null;
}

export interface ProcessoTanqueStagnationTransition {
  data: ProcessoTanqueStagnationUpdateData;
  status_anterior: statusestagnacao;
  status_atual: statusestagnacao;
  status_mudou: boolean;
  avaliado: boolean;
  motivo: string;
  tipo_evento: tipoeventoprocesso | null;
  variacao_vacuo: number | null;
  duracao_janela_segundos: number;
  leituras_janela: number;
}

@Injectable()
export class ProcessoTanqueStagnationService {
  evaluate(
    input: ProcessoTanqueStagnationInput,
  ): ProcessoTanqueStagnationTransition {
    this.validateInput(input);

    if (input.status_tanque_processo !== statustanqueprocesso.GERANDO_VACUO) {
      return this.reset(
        input,
        'Detector inativo porque o tanque nao esta gerando vacuo.',
      );
    }

    if (this.belongsToPreviousRun(input)) {
      return this.reset(
        input,
        'Estado de estagnacao reiniciado para a execucao atual.',
      );
    }

    if (input.leitura_valida === false) {
      return this.unchanged(
        input,
        'Detector suspenso porque a leitura ou a calibracao do sensor nao e valida.',
      );
    }

    if (
      (input.tempo_bomba_principal_segundos ?? Number.POSITIVE_INFINITY) <
      (input.tempo_minimo_bomba_principal_segundos ?? 0)
    ) {
      return this.unchanged(
        input,
        'Detector aguardando o tempo minimo de operacao da bomba principal.',
      );
    }

    if (!this.isEvaluationDue(input)) {
      return this.unchanged(
        input,
        'A proxima janela de avaliacao ainda nao foi concluida.',
      );
    }

    const samples = this.normalizeSamples(input.amostras, input.avaliado_em);
    if (samples.length < input.leituras_minimas) {
      return this.unchanged(
        input,
        'Leituras insuficientes para avaliar estagnacao.',
        samples.length,
      );
    }

    const windowDurationSeconds = this.windowDurationSeconds(samples);
    const minimumCoverage =
      input.janela_segundos * STAGNATION_MIN_WINDOW_COVERAGE_RATIO;
    if (windowDurationSeconds < minimumCoverage) {
      return this.unchanged(
        input,
        'Amostras ainda nao cobrem a janela minima de avaliacao.',
        samples.length,
        windowDurationSeconds,
      );
    }

    const progress = this.calculateSmoothedProgress(samples);
    const evidence = this.buildAdaptiveEvidence(input, samples);
    const hasExpectedProgress = progress >= evidence.minimumVariation;

    if (hasExpectedProgress) {
      return this.normalProgress(
        input,
        progress,
        samples.length,
        windowDurationSeconds,
        evidence,
      );
    }

    return this.noProgress(
      input,
      progress,
      samples.length,
      windowDurationSeconds,
      evidence,
    );
  }

  private noProgress(
    input: ProcessoTanqueStagnationInput,
    progress: number,
    readings: number,
    windowDurationSeconds: number,
    evidence: AdaptiveStagnationEvidence,
  ): ProcessoTanqueStagnationTransition {
    const consecutiveWindows = input.janelas_sem_progresso + 1;
    const maximumNoProgressReached = Boolean(
      input.tempo_maximo_sem_progresso_segundos &&
      input.iniciada_em &&
      input.avaliado_em.getTime() - input.iniciada_em.getTime() >=
        input.tempo_maximo_sem_progresso_segundos * 1000,
    );
    const nextStatus =
      consecutiveWindows >= input.janelas_consecutivas ||
      maximumNoProgressReached
        ? statusestagnacao.DETECTADA
        : statusestagnacao.SUSPEITA;
    const startedAt = input.iniciada_em ?? input.avaliado_em;
    const detectedAt =
      nextStatus === statusestagnacao.DETECTADA
        ? (input.detectada_em ?? input.avaliado_em)
        : null;

    return this.transition(input, {
      data: {
        status_estagnacao: nextStatus,
        estagnacao_iniciada_em: startedAt,
        estagnacao_detectada_em: detectedAt,
        estagnacao_ultima_avaliacao_em: input.avaliado_em,
        estagnacao_variacao_vacuo: progress,
        estagnacao_leituras_janela: readings,
        estagnacao_janelas_sem_progresso: consecutiveWindows,
        ...this.toEvidenceData(evidence),
        estagnacao_motivo_decisao: maximumNoProgressReached
          ? 'Tempo maximo sem progresso atingido.'
          : 'Variacao suavizada abaixo do minimo adaptativo.',
      },
      avaliado: true,
      motivo:
        nextStatus === statusestagnacao.DETECTADA
          ? 'Estagnacao confirmada por janelas consecutivas sem progresso.'
          : 'Progresso abaixo do minimo; estagnacao em observacao.',
      tipo_evento:
        nextStatus === statusestagnacao.DETECTADA &&
        input.status_atual !== statusestagnacao.DETECTADA
          ? tipoeventoprocesso.ESTAGNACAO_DETECTADA
          : input.status_atual === statusestagnacao.NORMAL
            ? tipoeventoprocesso.ESTAGNACAO_SUSPEITA
            : null,
      variacao_vacuo: progress,
      duracao_janela_segundos: windowDurationSeconds,
      leituras_janela: readings,
    });
  }

  private normalProgress(
    input: ProcessoTanqueStagnationInput,
    progress: number,
    readings: number,
    windowDurationSeconds: number,
    evidence: AdaptiveStagnationEvidence,
  ): ProcessoTanqueStagnationTransition {
    return this.transition(input, {
      data: {
        status_estagnacao: statusestagnacao.NORMAL,
        estagnacao_iniciada_em: null,
        estagnacao_detectada_em: null,
        estagnacao_ultima_avaliacao_em: input.avaliado_em,
        estagnacao_variacao_vacuo: progress,
        estagnacao_leituras_janela: readings,
        estagnacao_janelas_sem_progresso: 0,
        ...this.toEvidenceData(evidence),
        estagnacao_motivo_decisao:
          'Variacao suavizada igual ou superior ao minimo adaptativo.',
      },
      avaliado: true,
      motivo: 'Tanque apresentou progresso de vacuo dentro do esperado.',
      tipo_evento:
        input.status_atual === statusestagnacao.NORMAL
          ? null
          : tipoeventoprocesso.ESTAGNACAO_NORMALIZADA,
      variacao_vacuo: progress,
      duracao_janela_segundos: windowDurationSeconds,
      leituras_janela: readings,
    });
  }

  private reset(
    input: ProcessoTanqueStagnationInput,
    reason: string,
  ): ProcessoTanqueStagnationTransition {
    return this.transition(input, {
      data: {
        status_estagnacao: statusestagnacao.NORMAL,
        estagnacao_iniciada_em: null,
        estagnacao_detectada_em: null,
        estagnacao_ultima_avaliacao_em: null,
        estagnacao_variacao_vacuo: null,
        estagnacao_leituras_janela: 0,
        estagnacao_janelas_sem_progresso: 0,
      },
      avaliado: false,
      motivo: reason,
      tipo_evento:
        input.status_atual === statusestagnacao.NORMAL
          ? null
          : tipoeventoprocesso.ESTAGNACAO_NORMALIZADA,
      variacao_vacuo: null,
      duracao_janela_segundos: 0,
      leituras_janela: 0,
    });
  }

  private unchanged(
    input: ProcessoTanqueStagnationInput,
    reason: string,
    readings = input.leituras_janela,
    windowDurationSeconds = 0,
  ): ProcessoTanqueStagnationTransition {
    return {
      data: {
        status_estagnacao: input.status_atual,
        estagnacao_iniciada_em: input.iniciada_em,
        estagnacao_detectada_em: input.detectada_em,
        estagnacao_ultima_avaliacao_em: input.ultima_avaliacao_em,
        estagnacao_variacao_vacuo: input.variacao_vacuo,
        estagnacao_leituras_janela: input.leituras_janela,
        estagnacao_janelas_sem_progresso: input.janelas_sem_progresso,
      },
      status_anterior: input.status_atual,
      status_atual: input.status_atual,
      status_mudou: false,
      avaliado: false,
      motivo: reason,
      tipo_evento: null,
      variacao_vacuo: input.variacao_vacuo,
      duracao_janela_segundos: windowDurationSeconds,
      leituras_janela: readings,
    };
  }

  private transition(
    input: ProcessoTanqueStagnationInput,
    output: Omit<
      ProcessoTanqueStagnationTransition,
      'status_anterior' | 'status_atual' | 'status_mudou'
    >,
  ): ProcessoTanqueStagnationTransition {
    const nextStatus = output.data.status_estagnacao;

    return {
      ...output,
      status_anterior: input.status_atual,
      status_atual: nextStatus,
      status_mudou: nextStatus !== input.status_atual,
    };
  }

  private belongsToPreviousRun(input: ProcessoTanqueStagnationInput): boolean {
    return Boolean(
      input.execucao_iniciada_em &&
      input.ultima_avaliacao_em &&
      input.ultima_avaliacao_em < input.execucao_iniciada_em,
    );
  }

  private isEvaluationDue(input: ProcessoTanqueStagnationInput): boolean {
    if (!input.ultima_avaliacao_em) {
      return true;
    }

    return (
      input.avaliado_em.getTime() - input.ultima_avaliacao_em.getTime() >=
      input.janela_segundos * 1000
    );
  }

  private normalizeSamples(
    samples: ProcessoTanqueStagnationSample[],
    evaluatedAt: Date,
  ): ProcessoTanqueStagnationSample[] {
    return samples
      .filter(
        (sample) =>
          Number.isFinite(sample.valor_vacuo) &&
          this.isValidDate(sample.recebido_em) &&
          sample.recebido_em <= evaluatedAt,
      )
      .sort(
        (left, right) =>
          left.recebido_em.getTime() - right.recebido_em.getTime(),
      );
  }

  private windowDurationSeconds(
    samples: ProcessoTanqueStagnationSample[],
  ): number {
    const first = samples[0];
    const last = samples.at(-1);

    if (!first || !last) {
      return 0;
    }

    return Math.max(
      0,
      (last.recebido_em.getTime() - first.recebido_em.getTime()) / 1000,
    );
  }

  private calculateSmoothedProgress(
    samples: ProcessoTanqueStagnationSample[],
  ): number {
    const segmentSize = Math.max(1, Math.ceil(samples.length / 3));
    const firstAverage = this.averageMagnitude(samples.slice(0, segmentSize));
    const lastAverage = this.averageMagnitude(samples.slice(-segmentSize));

    return this.round(lastAverage - firstAverage, 3);
  }

  private averageMagnitude(samples: ProcessoTanqueStagnationSample[]): number {
    return (
      samples.reduce(
        (total, sample) => total + Math.abs(sample.valor_vacuo),
        0,
      ) / samples.length
    );
  }

  private buildAdaptiveEvidence(
    input: ProcessoTanqueStagnationInput,
    samples: ProcessoTanqueStagnationSample[],
  ): AdaptiveStagnationEvidence {
    const tankVolume = this.positiveOrNull(input.volume_tanque);
    const averageVolume = this.positiveOrNull(
      input.volume_medio_tanques_ativos,
    );
    const activeTanks = Math.max(1, input.tanques_ativos ?? 1);
    const volumeFactor =
      tankVolume && averageVolume
        ? this.clamp(averageVolume / tankVolume, 0.5, 2)
        : 1;
    const activeTanksFactor = 1 / Math.sqrt(activeTanks);
    const currentVacuum =
      this.finiteOrNull(input.vacuo_atual) ??
      samples.at(-1)?.valor_vacuo ??
      null;
    const targetVacuum = this.finiteOrNull(input.vacuo_alvo);
    const targetMagnitude = targetVacuum === null ? 0 : Math.abs(targetVacuum);
    const targetDistance =
      currentVacuum === null || targetMagnitude === 0
        ? null
        : Math.max(0, targetMagnitude - Math.abs(currentVacuum));
    const minimumTargetFactor = this.clamp(
      input.fator_minimo_proximidade_alvo ?? 0.35,
      0.05,
      1,
    );
    const targetFactor =
      targetDistance === null || targetMagnitude === 0
        ? 1
        : minimumTargetFactor +
          (1 - minimumTargetFactor) *
            Math.sqrt(this.clamp(targetDistance / targetMagnitude, 0, 1));

    return {
      minimumVariation: this.round(
        input.variacao_minima * volumeFactor * activeTanksFactor * targetFactor,
        3,
      ),
      volumeFactor: this.round(volumeFactor, 4),
      activeTanksFactor: this.round(activeTanksFactor, 4),
      targetFactor: this.round(targetFactor, 4),
      tankVolume,
      averageVolume,
      activeTanks,
      currentVacuum,
      targetDistance:
        targetDistance === null ? null : this.round(targetDistance, 3),
      pumpRuntimeSeconds: Math.max(
        0,
        Math.floor(input.tempo_bomba_principal_segundos ?? 0),
      ),
    };
  }

  private toEvidenceData(
    evidence: AdaptiveStagnationEvidence,
  ): Pick<
    ProcessoTanqueStagnationUpdateData,
    | 'estagnacao_variacao_minima_ajustada'
    | 'estagnacao_fator_volume'
    | 'estagnacao_fator_tanques_ativos'
    | 'estagnacao_fator_proximidade_alvo'
    | 'estagnacao_volume_tanque'
    | 'estagnacao_volume_medio_tanques_ativos'
    | 'estagnacao_tanques_ativos'
    | 'estagnacao_vacuo_atual'
    | 'estagnacao_distancia_alvo'
    | 'estagnacao_tempo_bomba_principal_segundos'
  > {
    return {
      estagnacao_variacao_minima_ajustada: evidence.minimumVariation,
      estagnacao_fator_volume: evidence.volumeFactor,
      estagnacao_fator_tanques_ativos: evidence.activeTanksFactor,
      estagnacao_fator_proximidade_alvo: evidence.targetFactor,
      estagnacao_volume_tanque: evidence.tankVolume,
      estagnacao_volume_medio_tanques_ativos: evidence.averageVolume,
      estagnacao_tanques_ativos: evidence.activeTanks,
      estagnacao_vacuo_atual: evidence.currentVacuum,
      estagnacao_distancia_alvo: evidence.targetDistance,
      estagnacao_tempo_bomba_principal_segundos: evidence.pumpRuntimeSeconds,
    };
  }

  private positiveOrNull(value: number | null | undefined): number | null {
    return Number.isFinite(value) && (value ?? 0) > 0
      ? (value as number)
      : null;
  }

  private finiteOrNull(value: number | null | undefined): number | null {
    return Number.isFinite(value) ? (value as number) : null;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }

  private validateInput(input: ProcessoTanqueStagnationInput): void {
    if (!this.isValidDate(input.avaliado_em)) {
      throw new RangeError('avaliado_em deve ser uma data valida.');
    }

    this.assertPositiveInteger(input.janela_segundos, 'janela_segundos');
    this.assertPositiveInteger(input.leituras_minimas, 'leituras_minimas');
    this.assertPositiveInteger(
      input.janelas_consecutivas,
      'janelas_consecutivas',
    );

    if (!Number.isFinite(input.variacao_minima) || input.variacao_minima < 0) {
      throw new RangeError('variacao_minima deve ser maior ou igual a zero.');
    }
  }

  private assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${field} deve ser um inteiro maior que zero.`);
    }
  }

  private isValidDate(value: Date): boolean {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;

    return Math.round(value * factor) / factor;
  }
}

interface AdaptiveStagnationEvidence {
  minimumVariation: number;
  volumeFactor: number;
  activeTanksFactor: number;
  targetFactor: number;
  tankVolume: number | null;
  averageVolume: number | null;
  activeTanks: number;
  currentVacuum: number | null;
  targetDistance: number | null;
  pumpRuntimeSeconds: number;
}
