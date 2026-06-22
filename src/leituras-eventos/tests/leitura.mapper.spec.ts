import { LeituraMapper } from '../mappers';
import { beforeEach, describe, expect, it } from '@jest/globals';

type LeituraRaw = Parameters<LeituraMapper['toResponse']>[0];
type LeituraDetailsRaw = Parameters<LeituraMapper['toDetails']>[0];

describe('LeituraMapper', () => {
  let mapper: LeituraMapper;

  beforeEach(() => {
    mapper = new LeituraMapper();
  });

  it('deve estar definido', () => {
    expect(mapper).toBeDefined();
  });

  it('deve converter valores decimais para number ou null', () => {
    expect(mapper.decimalToNumber(null)).toBeNull();
    expect(mapper.decimalToNumber(undefined)).toBeNull();
    expect(mapper.decimalToNumber(12.5)).toBe(12.5);
    expect(mapper.decimalToNumber(Number.NaN)).toBeNull();
    expect(mapper.decimalToNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(mapper.decimalToNumber('15.75')).toBe(15.75);
    expect(mapper.decimalToNumber('')).toBeNull();
    expect(mapper.decimalToNumber('invalido')).toBeNull();
    expect(mapper.decimalToNumber({ toNumber: () => 9.4 })).toBe(9.4);
    expect(mapper.decimalToNumber({ toString: () => '8.2' })).toBe(8.2);
  });

  it('deve mapear resposta simples sem relacoes ou dados sensiveis', () => {
    const leitura: LeituraRaw = {
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: '11.5',
      leitura_em: new Date('2026-01-01T10:00:00Z'),
      recebido_em: new Date('2026-01-01T10:00:02Z'),
    };

    const response = mapper.toResponse(leitura);

    expect(response).toEqual({
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: 11.5,
      leitura_em: leitura.leitura_em,
      recebido_em: leitura.recebido_em,
    });
    expect(response).not.toHaveProperty('processo');
    expect(response).not.toHaveProperty('payload');
    expect(response).not.toHaveProperty('senha_hash');
  });

  it('deve mapear detalhes resumidos', () => {
    const leitura: LeituraDetailsRaw = {
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: { toNumber: () => 10.25 },
      leitura_em: new Date('2026-01-01T10:00:00Z'),
      recebido_em: new Date('2026-01-01T10:00:02Z'),
      processo: {
        id_processo: 3,
        nome_processo: 'Processo 3',
        status_processo: 'EM_EXECUCAO',
        iniciado_em: new Date('2026-01-01T09:00:00Z'),
        finalizado_em: null,
      },
      processo_tanque: {
        id_processo_tanque: 4,
        id_tanque: 5,
        nome_tanque: 'Tanque 5',
        vacuo_alvo: '12',
        vacuo_inicial: '1',
        vacuo_final: null,
        vacuo_medio: '7.5',
        status_tanque_processo: 'EM_EXECUCAO',
      },
      sensor: {
        id_sensor: 6,
        nome_sensor: 'Sensor 6',
        modelo_sensor: 'VX',
        unidade_medida: 'kPa',
        status_sensor: 'ATIVO',
      },
    };

    const details = mapper.toDetails(leitura);

    expect(details.processo?.id_processo).toBe(3);
    expect(details.processo_tanque?.vacuo_alvo).toBe(12);
    expect(details.processo_tanque?.vacuo_medio).toBe(7.5);
    expect(details.sensor?.nome_sensor).toBe('Sensor 6');
    expect(details).not.toHaveProperty('senha_hash');
    expect(details).not.toHaveProperty('email');
  });

  it('deve retornar relacoes ausentes como null', () => {
    const leitura: LeituraDetailsRaw = {
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: 10,
      leitura_em: new Date('2026-01-01T10:00:00Z'),
      recebido_em: new Date('2026-01-01T10:00:02Z'),
      processo: null,
      processo_tanque: null,
      sensor: null,
    };

    const details = mapper.toDetails(leitura);

    expect(details.processo).toBeNull();
    expect(details.processo_tanque).toBeNull();
    expect(details.sensor).toBeNull();
  });

  it('deve montar lista com metadados de paginacao', () => {
    const leitura: LeituraRaw = {
      id_leitura_sensor: 1,
      id_processo_tanque_sensor: 2,
      valor_vacuo: 10,
      leitura_em: new Date('2026-01-01T10:00:00Z'),
      recebido_em: new Date('2026-01-01T10:00:02Z'),
    };

    const response = mapper.toListResponse([leitura], 21, 2, 10);

    expect(response.data).toHaveLength(1);
    expect(response.meta).toEqual({
      page: 2,
      limit: 10,
      total: 21,
      total_pages: 3,
      has_next_page: true,
      has_previous_page: true,
    });
  });

  it('deve proteger metadados com total e limite invalidos', () => {
    const response = mapper.toListResponse([], 0, 0, 0);

    expect(response.meta.total_pages).toBe(0);
    expect(response.meta.limit).toBe(1);
    expect(response.meta.page).toBe(1);
    expect(response.meta.has_next_page).toBe(false);
  });
});
