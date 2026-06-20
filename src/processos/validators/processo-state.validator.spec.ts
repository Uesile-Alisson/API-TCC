import { BadRequestException } from '@nestjs/common';
import { statusprocesso } from '@prisma/client';
import { ProcessoStateValidator } from './processo-state.validator';
import { beforeEach, describe, expect, it } from '@jest/globals';

describe('ProcessoStateValidator', () => {
  let validator: ProcessoStateValidator;

  beforeEach(() => {
    validator = new ProcessoStateValidator();
  });

  it('permite CONFIGURADO -> EM_EXECUCAO', () => {
    expect(() =>
      validator.validateTransition(
        statusprocesso.CONFIGURADO,
        statusprocesso.EM_EXECUCAO,
      ),
    ).not.toThrow();
  });

  it('permite EM_EXECUCAO -> PAUSADO', () => {
    expect(() =>
      validator.validateTransition(
        statusprocesso.EM_EXECUCAO,
        statusprocesso.PAUSADO,
      ),
    ).not.toThrow();
  });

  it('permite PAUSADO -> EM_EXECUCAO', () => {
    expect(() =>
      validator.validateTransition(
        statusprocesso.PAUSADO,
        statusprocesso.EM_EXECUCAO,
      ),
    ).not.toThrow();
  });

  it('bloqueia transição inválida', () => {
    expect(() =>
      validator.validateTransition(
        statusprocesso.CONFIGURADO,
        statusprocesso.CONCLUIDO,
      ),
    ).toThrow(BadRequestException);
  });

  it('bloqueia alteração de processo finalizado', () => {
    expect(() =>
      validator.validateNotFinalStatus(statusprocesso.CONCLUIDO),
    ).toThrow(BadRequestException);
  });
});
