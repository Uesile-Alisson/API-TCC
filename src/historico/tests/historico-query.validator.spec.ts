import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { statusprocesso } from '@prisma/client';
import { HistoricoQueryValidator } from '../validators';

describe('HistoricoQueryValidator', () => {
  let validator: HistoricoQueryValidator;

  beforeEach(() => {
    validator = new HistoricoQueryValidator();
  });

  it('validateListQuery aceita query valida', () => {
    expect(() =>
      validator.validateListQuery({
        page: 1,
        limit: 20,
        status_processo: statusprocesso.CONCLUIDO,
        order_by: 'finalizado_em',
        order_direction: 'desc',
      }),
    ).not.toThrow();
  });

  it('validateListQuery lanca para data_inicio maior que data_fim', () => {
    expect(() =>
      validator.validateListQuery({
        data_inicio: new Date('2026-02-01T00:00:00Z'),
        data_fim: new Date('2026-01-01T00:00:00Z'),
      }),
    ).toThrow(BadRequestException);
  });

  it('validateListQuery lanca para status, ordenacao e direcao invalidos', () => {
    expect(() =>
      validator.validateListQuery({
        status_processo: statusprocesso.EM_EXECUCAO,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.validateListQuery({ order_by: 'senha_hash' }),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.validateListQuery({
        order_direction: 'sideways' as unknown as 'asc',
      }),
    ).toThrow(BadRequestException);
  });

  it('validateListQuery lanca para limite e ranges invertidos', () => {
    expect(() => validator.validateListQuery({ limit: 101 })).toThrow(
      BadRequestException,
    );
    expect(() =>
      validator.validateListQuery({ eficiencia_min: 90, eficiencia_max: 80 }),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.validateListQuery({
        tempo_execucao_min: 100,
        tempo_execucao_max: 50,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.validateListQuery({ vacuo_alvo_min: 20, vacuo_alvo_max: 10 }),
    ).toThrow(BadRequestException);
    expect(() =>
      validator.validateListQuery({ vacuo_final_min: 20, vacuo_final_max: 10 }),
    ).toThrow(BadRequestException);
  });

  it('validateDashboardQuery valida agrupamento invalido', () => {
    expect(() =>
      validator.validateDashboardQuery({
        agrupamento: 'ANO' as unknown as 'DIA',
      }),
    ).toThrow(BadRequestException);
  });

  it('validateVacuumChartQuery valida limite de pontos invalido', () => {
    expect(() =>
      validator.validateVacuumChartQuery({ limite_pontos: 5001 }),
    ).toThrow(BadRequestException);
  });

  it('validateProcessAlarmsQuery valida paginacao', () => {
    expect(() => validator.validateProcessAlarmsQuery({ page: 0 })).toThrow(
      BadRequestException,
    );
  });

  it('validateProcessEventsQuery valida paginacao', () => {
    expect(() => validator.validateProcessEventsQuery({ limit: 101 })).toThrow(
      BadRequestException,
    );
  });
});
