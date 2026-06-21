import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { statusalarme } from '@prisma/client';
import { AlarmeStateValidator } from '../validators';

describe('AlarmeStateValidator', () => {
  let validator: AlarmeStateValidator;

  beforeEach(() => {
    validator = new AlarmeStateValidator();
  });

  it('deve estar definido', () => {
    expect(validator).toBeDefined();
  });

  it('validateExists lanca NotFoundException para null ou undefined', () => {
    expect(() => validator.validateExists(null)).toThrow(NotFoundException);
    expect(() => validator.validateExists(undefined)).toThrow(
      NotFoundException,
    );
  });

  it('validateExists nao lanca para objeto valido', () => {
    expect(() => validator.validateExists(makeAlarmeState())).not.toThrow();
  });

  it('validateNotDeleted lanca ConflictException para alarme excluido', () => {
    expect(() =>
      validator.validateNotDeleted(
        makeAlarmeState({ excluido_em: new Date('2026-06-21T10:00:00Z') }),
      ),
    ).toThrow(ConflictException);
  });

  it('validateNotDeleted nao lanca para excluido_em null', () => {
    expect(() =>
      validator.validateNotDeleted(makeAlarmeState({ excluido_em: null })),
    ).not.toThrow();
  });

  it('validateNotResolved lanca ConflictException para status RESOLVIDO', () => {
    expect(() =>
      validator.validateNotResolved(
        makeAlarmeState({ status_alarme: statusalarme.RESOLVIDO }),
      ),
    ).toThrow(ConflictException);
  });

  it('validateNotResolved lanca ConflictException para resolvido_em preenchido', () => {
    expect(() =>
      validator.validateNotResolved(
        makeAlarmeState({
          status_alarme: statusalarme.ATIVO,
          resolvido_em: new Date('2026-06-21T10:00:00Z'),
        }),
      ),
    ).toThrow(ConflictException);
  });

  it('validateNotResolved nao lanca para ATIVO com resolvido_em null', () => {
    expect(() =>
      validator.validateNotResolved(
        makeAlarmeState({
          status_alarme: statusalarme.ATIVO,
          resolvido_em: null,
        }),
      ),
    ).not.toThrow();
  });

  it('validateCanResolve passa para alarme ativo e nao excluido', () => {
    expect(() => validator.validateCanResolve(makeAlarmeState())).not.toThrow();
  });

  it('validateCanResolve lanca ConflictException para resolvido e excluido', () => {
    expect(() =>
      validator.validateCanResolve(
        makeAlarmeState({ status_alarme: statusalarme.RESOLVIDO }),
      ),
    ).toThrow(ConflictException);
    expect(() =>
      validator.validateCanResolve(
        makeAlarmeState({ excluido_em: new Date('2026-06-21T10:00:00Z') }),
      ),
    ).toThrow(ConflictException);
  });

  it('validateCanResolve lanca NotFoundException para null', () => {
    expect(() => validator.validateCanResolve(null)).toThrow(NotFoundException);
  });

  it('isResolved retorna true para status RESOLVIDO ou resolvido_em preenchido', () => {
    expect(
      validator.isResolved(
        makeAlarmeState({ status_alarme: statusalarme.RESOLVIDO }),
      ),
    ).toBe(true);
    expect(
      validator.isResolved(
        makeAlarmeState({ resolvido_em: new Date('2026-06-21T10:00:00Z') }),
      ),
    ).toBe(true);
  });

  it('isResolved retorna false para ATIVO com resolvido_em null', () => {
    expect(validator.isResolved(makeAlarmeState())).toBe(false);
  });

  it('isDeleted identifica excluido_em preenchido ou null', () => {
    expect(
      validator.isDeleted(
        makeAlarmeState({ excluido_em: new Date('2026-06-21T10:00:00Z') }),
      ),
    ).toBe(true);
    expect(validator.isDeleted(makeAlarmeState({ excluido_em: null }))).toBe(
      false,
    );
  });
});

function makeAlarmeState(
  overrides: Partial<{
    id_alarme: number;
    status_alarme: statusalarme;
    resolvido_em: Date | null;
    excluido_em: Date | null;
  }> = {},
) {
  return {
    id_alarme: 10,
    status_alarme: statusalarme.ATIVO,
    resolvido_em: null,
    excluido_em: null,
    ...overrides,
  };
}
