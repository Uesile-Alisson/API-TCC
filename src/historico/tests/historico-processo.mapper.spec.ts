import { beforeEach, describe, expect, it } from '@jest/globals';
import { statusprocesso } from '@prisma/client';
import { HistoricoProcessoMapper } from '../mappers';

type ListRaw = Parameters<HistoricoProcessoMapper['toListItem']>[0];
type DetailsInput = Parameters<HistoricoProcessoMapper['toDetails']>[0];

describe('HistoricoProcessoMapper', () => {
  let mapper: HistoricoProcessoMapper;

  beforeEach(() => {
    mapper = new HistoricoProcessoMapper();
  });

  it('toListItem converte decimais e usuario sem dados sensiveis', () => {
    const raw = makeProcessRaw({
      vacuo_alvo: { toString: () => '12.5' },
      vacuo_inicial: 1,
      vacuo_final: '11.75',
      vacuo_medio: null,
      eficiencia: undefined,
      usuarios: {
        id_usuario: 7,
        nome: 'Operador',
        login: 'nao deve sair',
        email: 'nao deve sair',
        senha_hash: 'nao deve sair',
      },
    });

    const result = mapper.toListItem(raw);

    expect(result.vacuo_alvo).toBe(12.5);
    expect(result.vacuo_inicial).toBe(1);
    expect(result.vacuo_final).toBe(11.75);
    expect(result.vacuo_medio).toBeNull();
    expect(result.eficiencia).toBeNull();
    expect(result.usuario_responsavel).toEqual({
      id_usuario: 7,
      nome: 'Operador',
    });
    expect(JSON.stringify(result)).not.toContain('login');
    expect(JSON.stringify(result)).not.toContain('email');
    expect(JSON.stringify(result)).not.toContain('senha_hash');
  });

  it('toListResponse monta meta corretamente', () => {
    const response = mapper.toListResponse({
      data: [makeProcessRaw()],
      page: 2,
      limit: 10,
      total: 21,
    });

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

  it('toDetails monta detalhe completo', () => {
    const input: DetailsInput = {
      processo: makeProcessRaw({
        pausado_em: null,
        retomado_em: null,
      }) as DetailsInput['processo'],
      tanques: [{ id_tanque: 2 }],
      resumo_alarmes: {
        total: 1,
        info: 0,
        medio: 0,
        critico: 1,
        ativos: 1,
        resolvidos: 0,
      },
      resumo_eventos: {
        total: 1,
        info: 1,
        aviso: 0,
        critico: 0,
        primeiro_evento_em: new Date('2026-01-01T10:00:00Z'),
        ultimo_evento_em: new Date('2026-01-01T10:00:00Z'),
      },
      relatorios: [{ id_relatorio: 5 }],
      diagnostico: {
        classificacao_resultado: 'NORMAL',
        motivos: [],
        recomendacoes: [],
      },
    } as unknown as DetailsInput;

    const result = mapper.toDetails(input);

    expect(result.processo.id_processo).toBe(10);
    expect(result.tanques).toEqual(input.tanques);
    expect(result.resumo_alarmes).toBe(input.resumo_alarmes);
    expect(result.resumo_eventos).toBe(input.resumo_eventos);
    expect(result.relatorios).toEqual(input.relatorios);
    expect(result.diagnostico).toBe(input.diagnostico);
    expect(JSON.stringify(result)).not.toContain('login');
    expect(JSON.stringify(result)).not.toContain('email');
    expect(JSON.stringify(result)).not.toContain('senha_hash');
  });
});

function makeProcessRaw(overrides: Record<string, unknown> = {}): ListRaw {
  return {
    id_processo: 10,
    nome_processo: 'Processo',
    status_processo: statusprocesso.CONCLUIDO,
    usuarios: { id_usuario: 7, nome: 'Operador' },
    vacuo_alvo: '12',
    vacuo_inicial: '0',
    vacuo_final: '11',
    vacuo_medio: '10',
    eficiencia: '95',
    tempo_maximo: 120,
    tempo_execucao: 100,
    iniciado_em: new Date('2026-01-01T10:00:00Z'),
    finalizado_em: new Date('2026-01-01T10:10:00Z'),
    criado_em: new Date('2026-01-01T09:50:00Z'),
    parada_emergencia: false,
    _count: {
      processostanques: 1,
      alarmes: 1,
      eventos: 2,
      relatorios: 1,
    },
    total_alarmes_criticos: 0,
    ...overrides,
  };
}
