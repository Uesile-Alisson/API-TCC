import {
  formatorelatorio,
  severidadealarme,
  statusalarme,
  statusprocesso,
  tiporelatorio,
} from '@prisma/client';
import { beforeEach, describe, expect, it } from '@jest/globals';

import type { RelatorioWithRelations } from '../repositories';
import { RelatorioMapper } from './relatorio.mapper';

function reportRecord(
  formato: formatorelatorio = formatorelatorio.PDF,
): RelatorioWithRelations {
  return {
    id_relatorio: 30,
    id_usuario: 1,
    id_processo: 10,
    id_alarme: null,
    tipo_relatorio: tiporelatorio.PROCESSO,
    formato_relatorio: formato,
    titulo: 'Relatório Teste',
    descricao: 'Descricao',
    nome_arquivo:
      formato === formatorelatorio.PDF
        ? 'tsea-processo-10-relatorio-pdf.pdf'
        : 'tsea-processo-10-relatorio-xlsx.xlsx',
    hash_arquivo: 'hash-interno',
    tamanho_bytes: BigInt(123),
    gerado_em: new Date('2026-01-01T00:00:00.000Z'),
    gridfs_file_id: '507f1f77bcf86cd799439011',
    content_type:
      formato === formatorelatorio.PDF
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bucket_name: 'relatorios',
    storage_provider: 'GRIDFS',
    usuarios: {
      id_usuario: 1,
      nome: 'Usuário Teste',
    },
    processos: {
      id_processo: 10,
      nome_processo: 'Processo Teste',
      status_processo: statusprocesso.CONCLUIDO,
    },
    alarmes: {
      id_alarme: 20,
      titulo: 'Alarme Teste',
      severidade: severidadealarme.CRITICO,
      status_alarme: statusalarme.RESOLVIDO,
      ocorrido_em: new Date('2026-01-01T00:00:00.000Z'),
    },
  };
}

describe('RelatorioMapper', () => {
  let mapper: RelatorioMapper;

  beforeEach(() => {
    mapper = new RelatorioMapper();
  });

  it('mapeia registro para resposta publica sem expor storage interno', () => {
    const response = mapper.toResponse(reportRecord());
    const responseRecord = response as unknown as Record<string, unknown>;

    expect(response.id_relatorio).toBe(30);
    expect(response.tamanho_bytes).toBe(123);
    expect(response.gerado_por).toEqual({
      id_usuario: 1,
      nome: 'Usuário Teste',
    });
    expect(response.possui_arquivo).toBe(true);
    expect(response.preview_disponivel).toBe(true);
    expect(response.download_disponivel).toBe(true);
    expect(responseRecord.gridfs_file_id).toBeUndefined();
    expect(responseRecord.bucket_name).toBeUndefined();
    expect(responseRecord.storage_provider).toBeUndefined();
    expect(responseRecord.hash_arquivo).toBeUndefined();
    expect(responseRecord.login).toBeUndefined();
    expect(responseRecord.email).toBeUndefined();
    expect(responseRecord.senha_hash).toBeUndefined();
  });

  it('calcula preview apenas para PDF com arquivo', () => {
    const pdf = mapper.toResponse(reportRecord(formatorelatorio.PDF));
    const xlsx = mapper.toResponse(reportRecord(formatorelatorio.XLSX));

    expect(pdf.preview_disponivel).toBe(true);
    expect(xlsx.preview_disponivel).toBe(false);
    expect(xlsx.download_disponivel).toBe(true);
  });

  it('monta paginação corretamente', () => {
    const response = mapper.toListResponse({
      records: [reportRecord()],
      total: 25,
      page: 2,
      limit: 10,
    });

    expect(response.data).toHaveLength(1);
    expect(response.meta).toEqual({
      total: 25,
      page: 2,
      limit: 10,
      total_pages: 3,
      has_next_page: true,
      has_previous_page: true,
    });
  });
});
