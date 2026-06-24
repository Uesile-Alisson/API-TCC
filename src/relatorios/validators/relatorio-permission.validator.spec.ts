import { ForbiddenException } from '@nestjs/common';
import { nivelacesso } from '@prisma/client';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { RelatorioPermissionValidator } from './relatorio-permission.validator';

describe('RelatorioPermissionValidator', () => {
  let validator: RelatorioPermissionValidator;

  beforeEach(() => {
    validator = new RelatorioPermissionValidator();
  });

  it('permite operador listar, visualizar e fazer preview', () => {
    expect(() => validator.validateCanList(nivelacesso.OPERADOR)).not.toThrow();
    expect(() => validator.validateCanView(nivelacesso.OPERADOR)).not.toThrow();
    expect(() =>
      validator.validateCanPreview(nivelacesso.OPERADOR),
    ).not.toThrow();
  });

  it('bloqueia operador para download e geracao', () => {
    expect(() => validator.validateCanDownload(nivelacesso.OPERADOR)).toThrow(
      ForbiddenException,
    );
    expect(() => validator.validateCanGenerate(nivelacesso.OPERADOR)).toThrow(
      ForbiddenException,
    );
  });

  it('permite tecnico e administrador em todos os fluxos', () => {
    for (const role of [nivelacesso.TECNICO, nivelacesso.ADMINISTRADOR]) {
      expect(() => validator.validateCanList(role)).not.toThrow();
      expect(() => validator.validateCanView(role)).not.toThrow();
      expect(() => validator.validateCanPreview(role)).not.toThrow();
      expect(() => validator.validateCanDownload(role)).not.toThrow();
      expect(() => validator.validateCanGenerate(role)).not.toThrow();
      expect(() =>
        validator.validateCanGenerateProcessReport(role),
      ).not.toThrow();
      expect(() =>
        validator.validateCanGenerateAlarmReport(role),
      ).not.toThrow();
    }
  });

  it('bloqueia role invalida', () => {
    expect(() => validator.assertKnownRole('INVALIDO' as nivelacesso)).toThrow(
      ForbiddenException,
    );
  });

  it('aplica permissao para filtro restrito id_usuario', () => {
    expect(() =>
      validator.validateCanUseRestrictedFilter({
        nivel_acesso: nivelacesso.OPERADOR,
        filter: 'id_usuario',
      }),
    ).toThrow(ForbiddenException);

    expect(() =>
      validator.validateCanUseRestrictedFilter({
        nivel_acesso: nivelacesso.TECNICO,
        filter: 'id_usuario',
      }),
    ).not.toThrow();
    expect(() =>
      validator.validateCanUseRestrictedFilter({
        nivel_acesso: nivelacesso.ADMINISTRADOR,
        filter: 'id_usuario',
      }),
    ).not.toThrow();
  });
});
