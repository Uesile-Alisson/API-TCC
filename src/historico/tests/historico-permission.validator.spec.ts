import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { nivelacesso } from '@prisma/client';
import { HistoricoPermissionValidator } from '../validators';

describe('HistoricoPermissionValidator', () => {
  let validator: HistoricoPermissionValidator;

  beforeEach(() => {
    validator = new HistoricoPermissionValidator();
  });

  it('OPERADOR pode acessar listagem sem id_usuario', () => {
    expect(() =>
      validator.validateCanUseListFilters({
        user: { nivel_acesso: nivelacesso.OPERADOR },
        query: {},
      }),
    ).not.toThrow();
  });

  it('OPERADOR nao pode usar filtro id_usuario', () => {
    expect(() =>
      validator.validateCanUseListFilters({
        user: { nivel_acesso: nivelacesso.OPERADOR },
        query: { id_usuario: 7 },
      }),
    ).toThrow(ForbiddenException);
  });

  it('TECNICO e ADMINISTRADOR podem usar filtro id_usuario', () => {
    expect(() =>
      validator.validateCanUseListFilters({
        user: { nivel_acesso: nivelacesso.TECNICO },
        query: { id_usuario: 7 },
      }),
    ).not.toThrow();
    expect(() =>
      validator.validateCanUseListFilters({
        user: { nivel_acesso: nivelacesso.ADMINISTRADOR },
        query: { id_usuario: 7 },
      }),
    ).not.toThrow();
  });

  it('OPERADOR pode visualizar detalhes, dashboard e metadados de relatorios', () => {
    const user = { nivel_acesso: nivelacesso.OPERADOR };

    expect(() =>
      validator.validateCanViewHistoricalDetails(user),
    ).not.toThrow();
    expect(() =>
      validator.validateCanUseDashboardFilters({ user, query: {} }),
    ).not.toThrow();
    expect(() =>
      validator.validateCanViewHistoricalReportMetadata(user),
    ).not.toThrow();
  });

  it('role ausente ou desconhecida lanca ForbiddenException', () => {
    expect(() => validator.validateCanViewHistoricalDetails({})).toThrow(
      ForbiddenException,
    );
    expect(() =>
      validator.validateCanViewHistoricalDetails({ role: 'VISITANTE' }),
    ).toThrow(ForbiddenException);
  });

  it('validateReportGenerationIsNotHistoricoResponsibility lanca erro', () => {
    expect(() =>
      validator.validateReportGenerationIsNotHistoricoResponsibility(),
    ).toThrow(BadRequestException);
  });

  it('nao remove filtros nem altera objeto recebido', () => {
    const params = {
      user: { nivel_acesso: nivelacesso.TECNICO },
      query: { id_usuario: 7, page: 1 },
    };
    const snapshot = JSON.stringify(params);

    validator.validateCanUseListFilters(params);

    expect(JSON.stringify(params)).toBe(snapshot);
  });
});
