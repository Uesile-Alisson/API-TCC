import { beforeEach, describe, expect, it } from '@jest/globals';
import { formatorelatorio, tiporelatorio } from '@prisma/client';
import { HistoricoRelatorioMapper } from '../mappers';

type RelatorioRaw = Parameters<HistoricoRelatorioMapper['toSummary']>[0];

describe('HistoricoRelatorioMapper', () => {
  let mapper: HistoricoRelatorioMapper;

  beforeEach(() => {
    mapper = new HistoricoRelatorioMapper();
  });

  it('converte tamanho_bytes bigint para number', () => {
    const result = mapper.toSummary(makeRelatorioRaw({ tamanho_bytes: 2048n }));

    expect(result.tamanho_bytes).toBe(2048);
  });

  it('retorna apenas metadados sem hash/download/preview/base64', () => {
    const result = mapper.toSummary(
      makeRelatorioRaw({
        hash_arquivo: 'hash',
        download_url: 'url',
        preview_url: 'url',
        base64: 'conteudo',
      }),
    );

    expect(result).toMatchObject({
      id_relatorio: 1,
      nome_arquivo: 'relatorio.pdf',
      formato_relatorio: formatorelatorio.PDF,
    });
    expect(JSON.stringify(result)).not.toContain('hash_arquivo');
    expect(JSON.stringify(result)).not.toContain('download');
    expect(JSON.stringify(result)).not.toContain('preview');
    expect(JSON.stringify(result)).not.toContain('base64');
  });
});

function makeRelatorioRaw(
  overrides: Record<string, unknown> = {},
): RelatorioRaw {
  return {
    id_relatorio: 1,
    tipo_relatorio: tiporelatorio.PROCESSO,
    formato_relatorio: formatorelatorio.PDF,
    titulo: 'Relatorio',
    descricao: null,
    nome_arquivo: 'relatorio.pdf',
    tamanho_bytes: 1024,
    gerado_em: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}
