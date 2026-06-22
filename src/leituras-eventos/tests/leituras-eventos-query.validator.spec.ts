import { BadRequestException } from '@nestjs/common';
import { GRAFICO_VACUO_MAX_LIMIT, TIMELINE_MAX_LIMIT } from '../constants';
import type { GraficoVacuoQueryDto } from '../dto';
import { LeiturasEventosQueryValidator } from '../validators';
import { beforeEach, describe, expect, it } from '@jest/globals';

describe('LeiturasEventosQueryValidator', () => {
  let validator: LeiturasEventosQueryValidator;

  beforeEach(() => {
    validator = new LeiturasEventosQueryValidator();
  });

  it('deve estar definido', () => {
    expect(validator).toBeDefined();
  });

  it('deve validar range de datas', () => {
    expect(() =>
      validator.validateDateRange(
        new Date('2026-01-01T10:00:00Z'),
        new Date('2026-01-01T11:00:00Z'),
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateDateRange(new Date('2026-01-01T10:00:00Z'), null),
    ).not.toThrow();
    expect(() =>
      validator.validateDateRange(null, new Date('2026-01-01T10:00:00Z')),
    ).not.toThrow();
    expect(() =>
      validator.validateDateRange(
        new Date('2026-01-01T11:00:00Z'),
        new Date('2026-01-01T10:00:00Z'),
      ),
    ).toThrow(BadRequestException);
  });

  it('deve validar range de valores', () => {
    expect(() => validator.validateValueRange(1, 2)).not.toThrow();
    expect(() => validator.validateValueRange(1, null)).not.toThrow();
    expect(() => validator.validateValueRange(null, 2)).not.toThrow();
    expect(() => validator.validateValueRange(3, 2)).toThrow(
      BadRequestException,
    );
  });

  it('deve validar query de leituras', () => {
    expect(() =>
      validator.validateListLeiturasQuery({
        leitura_de: new Date('2026-01-01T10:00:00Z'),
        leitura_ate: new Date('2026-01-01T11:00:00Z'),
        recebido_de: new Date('2026-01-01T10:00:00Z'),
        recebido_ate: new Date('2026-01-01T11:00:00Z'),
        valor_minimo: 1,
        valor_maximo: 2,
      }),
    ).not.toThrow();
    expect(() =>
      validator.validateListLeiturasQuery({
        valor_minimo: 3,
        valor_maximo: 2,
      }),
    ).toThrow(BadRequestException);
  });

  it('deve validar query de eventos', () => {
    expect(() =>
      validator.validateListEventosQuery({
        ocorrido_de: new Date('2026-01-01T10:00:00Z'),
        ocorrido_ate: new Date('2026-01-01T11:00:00Z'),
      }),
    ).not.toThrow();
    expect(() =>
      validator.validateListEventosQuery({
        ocorrido_de: new Date('2026-01-01T11:00:00Z'),
        ocorrido_ate: new Date('2026-01-01T10:00:00Z'),
      }),
    ).toThrow(BadRequestException);
  });

  it('deve validar query de grafico', () => {
    expect(() =>
      validator.validateGraficoVacuoQuery({
        leitura_de: new Date('2026-01-01T10:00:00Z'),
        leitura_ate: new Date('2026-01-01T11:00:00Z'),
        intervalo: 'RAW',
        limit: GRAFICO_VACUO_MAX_LIMIT,
      }),
    ).not.toThrow();
    expect(() =>
      validator.validateGraficoVacuoQuery({
        limit: GRAFICO_VACUO_MAX_LIMIT + 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.validateGraficoVacuoQuery({
        intervalo: 'HORA',
      } as unknown as GraficoVacuoQueryDto),
    ).toThrow(BadRequestException);
  });

  it('deve validar query de timeline', () => {
    expect(() =>
      validator.validateTimelineQuery({
        ocorrido_de: new Date('2026-01-01T10:00:00Z'),
        ocorrido_ate: new Date('2026-01-01T11:00:00Z'),
        limit: TIMELINE_MAX_LIMIT,
      }),
    ).not.toThrow();
    expect(() =>
      validator.validateTimelineQuery({ limit: TIMELINE_MAX_LIMIT + 1 }),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.validateTimelineQuery({
        incluir_leituras: false,
        incluir_eventos: false,
      }),
    ).toThrow(BadRequestException);
  });

  it('deve identificar Date valido e numero finito', () => {
    expect(validator.isValidDate(new Date())).toBe(true);
    expect(validator.isValidDate(new Date('invalid'))).toBe(false);
    expect(validator.isValidDate('2026-01-01')).toBe(false);
    expect(validator.isFiniteNumber(1)).toBe(true);
    expect(validator.isFiniteNumber(Number.NaN)).toBe(false);
    expect(validator.isFiniteNumber('1')).toBe(false);
  });
});
