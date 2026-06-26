import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { statusprocesso } from '@prisma/client';
import { HistoricoProcessoValidator } from '../validators';

describe('HistoricoProcessoValidator', () => {
  let validator: HistoricoProcessoValidator;

  beforeEach(() => {
    validator = new HistoricoProcessoValidator();
  });

  it('validateProcessId aceita inteiro positivo e lanca para invalido', () => {
    expect(() => validator.validateProcessId(1)).not.toThrow();
    expect(() => validator.validateProcessId(0)).toThrow(BadRequestException);
    expect(() => validator.validateProcessId(1.5)).toThrow(BadRequestException);
  });

  it('validateExists lanca NotFoundException para null', () => {
    expect(() => validator.validateExists(null, 10)).toThrow(NotFoundException);
  });

  it('validateIsHistoricalProcess aceita todos os processos registrados', () => {
    expect(() =>
      validator.validateIsHistoricalProcess(
        makeProcess(statusprocesso.CONCLUIDO),
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateIsHistoricalProcess(
        makeProcess(statusprocesso.INTERROMPIDO),
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateIsHistoricalProcess(makeProcess(statusprocesso.FALHA)),
    ).not.toThrow();
    expect(() =>
      validator.validateIsHistoricalProcess(
        makeProcess(statusprocesso.CONFIGURADO),
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateIsHistoricalProcess(
        makeProcess(statusprocesso.EM_EXECUCAO),
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateIsHistoricalProcess(
        makeProcess(statusprocesso.PAUSADO),
      ),
    ).not.toThrow();
  });

  it('validateHistoricalProcess chama fluxo completo', () => {
    const processo = makeProcess(statusprocesso.CONCLUIDO);

    expect(() =>
      validator.validateHistoricalProcess(processo, 10),
    ).not.toThrow();
    expect(() => validator.validateHistoricalProcess(null, 10)).toThrow(
      NotFoundException,
    );
    expect(() =>
      validator.validateHistoricalProcess(
        makeProcess(statusprocesso.EM_EXECUCAO),
        10,
      ),
    ).not.toThrow();
  });
});

function makeProcess(status: statusprocesso) {
  return {
    id_processo: 10,
    status_processo: status,
  };
}
