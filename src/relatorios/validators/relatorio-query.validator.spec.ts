import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { formatorelatorio, nivelacesso, tiporelatorio } from '@prisma/client';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { RelatorioQueryValidator } from './relatorio-query.validator';

describe('RelatorioQueryValidator', () => {
  let validator: RelatorioQueryValidator;

  beforeEach(() => {
    validator = new RelatorioQueryValidator();
  });

  it('aceita query valida', () => {
    expect(() =>
      validator.validateListQuery({
        tipo_relatorio: tiporelatorio.PROCESSO,
        formato_relatorio: formatorelatorio.PDF,
        data_inicio: new Date('2026-01-01T00:00:00.000Z'),
        data_fim: new Date('2026-01-02T00:00:00.000Z'),
        order_by: 'gerado_em',
        order_direction: 'desc',
      }),
    ).not.toThrow();
  });

  it('rejeita data_inicio maior que data_fim', () => {
    expect(() =>
      validator.validateDateRange(
        new Date('2026-01-03T00:00:00.000Z'),
        new Date('2026-01-02T00:00:00.000Z'),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejeita ALARME com XLSX e aceita ALARME com PDF', () => {
    expect(() =>
      validator.validateTypeFormatCombination(
        tiporelatorio.ALARME,
        formatorelatorio.XLSX,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      validator.validateTypeFormatCombination(
        tiporelatorio.ALARME,
        formatorelatorio.PDF,
      ),
    ).not.toThrow();
  });

  it('aceita PROCESSO com PDF e XLSX', () => {
    expect(() =>
      validator.validateTypeFormatCombination(
        tiporelatorio.PROCESSO,
        formatorelatorio.PDF,
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateTypeFormatCombination(
        tiporelatorio.PROCESSO,
        formatorelatorio.XLSX,
      ),
    ).not.toThrow();
  });

  it('rejeita order_by fora da allowlist e order_direction invalida', () => {
    expect(() => validator.validateOrderBy('gridfs_file_id')).toThrow(
      BadRequestException,
    );
    expect(() => validator.validateOrderDirection('sideways')).toThrow(
      BadRequestException,
    );
  });

  it('bloqueia filtro id_usuario para operador e permite para tecnico/admin', () => {
    expect(() =>
      validator.validateRestrictedFilters({
        query: { id_usuario: 1 },
        nivel_acesso: nivelacesso.OPERADOR,
      }),
    ).toThrow(ForbiddenException);

    expect(() =>
      validator.validateRestrictedFilters({
        query: { id_usuario: 1 },
        nivel_acesso: nivelacesso.TECNICO,
      }),
    ).not.toThrow();
    expect(() =>
      validator.validateRestrictedFilters({
        query: { id_usuario: 1 },
        nivel_acesso: nivelacesso.ADMINISTRADOR,
      }),
    ).not.toThrow();
  });
});
