import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { SqlInjectionDetectorService } from './sql-injection-detector.service';
import {
  SQL_INJECTION_REJECTION_MESSAGE,
  SqlInjectionInputPipe,
} from './sql-injection-input.pipe';

describe('SqlInjectionDetectorService', () => {
  const detector = new SqlInjectionDetectorService();

  it.each([
    ['UNION SELECT', { search: "' UNION SELECT senha FROM usuarios" }],
    ['DROP', { search: 'abc; DROP TABLE usuarios' }],
    ['ALTER', { search: 'x; ALTER TABLE usuarios ADD COLUMN teste text' }],
    ['TRUNCATE', { search: 'x; TRUNCATE TABLE logsoperacionais' }],
    ['comentario SQL malicioso', { login: "admin' -- DROP TABLE usuarios" }],
    ['stacked query', { query: 'abc; DELETE FROM usuarios' }],
    ['tautologia booleana', { login: "' OR '1'='1" }],
    ['pg_sleep', { search: 'x OR pg_sleep(5)' }],
    [
      'information_schema',
      { search: 'SELECT table_name FROM information_schema.tables' },
    ],
    ['pg_catalog', { search: 'SELECT * FROM pg_catalog.pg_user' }],
  ])('bloqueia %s', (_label, payload) => {
    const result = detector.detect(payload);

    expect(result.safe).toBe(false);
    expect(result.highestSeverity).toBe('HIGH');
  });

  it.each([
    [
      'texto comum',
      { descricao: 'o operador deve selecionar o tanque correto' },
    ],
    ['nome comum', { nome: 'Joao Silva' }],
    ['email valido', { email: 'usuario.teste@example.com' }],
    ['busca simples legitima', { busca: 'tanque principal' }],
  ])('nao bloqueia %s', (_label, payload) => {
    const result = detector.detect(payload);

    expect(result.safe).toBe(true);
    expect(result.matches).toHaveLength(0);
  });

  it('percorre arrays e objetos simples', () => {
    const result = detector.detect({
      filtros: [{ campo: 'nome' }, { valor: "' OR 1=1" }],
    });

    expect(result.safe).toBe(false);
    expect(result.matches[0]?.path).toContain('filtros');
  });

  it('ignora number, boolean, Date, null e undefined', () => {
    const result = detector.detect({
      id: 1,
      ativo: true,
      data: new Date(),
      nulo: null,
      indefinido: undefined,
    });

    expect(result.safe).toBe(true);
  });
});

describe('SqlInjectionInputPipe', () => {
  const detector = new SqlInjectionDetectorService();
  const pipe = new SqlInjectionInputPipe(detector);

  it.each(['body', 'query', 'param'] as const)(
    'pipe percorre %s e bloqueia risco alto',
    (type) => {
      expect(() =>
        pipe.transform(
          { search: "' UNION SELECT senha FROM usuarios" },
          { type },
        ),
      ).toThrow(BadRequestException);
    },
  );

  it('nao expoe payload completo no erro', () => {
    try {
      pipe.transform(
        { search: "' UNION SELECT senha_super_secreta FROM usuarios" },
        { type: 'query' },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(JSON.stringify(response)).toContain(
        SQL_INJECTION_REJECTION_MESSAGE,
      );
      expect(JSON.stringify(response)).not.toContain('senha_super_secreta');
      return;
    }

    throw new Error('Pipe deveria bloquear payload malicioso.');
  });
});
