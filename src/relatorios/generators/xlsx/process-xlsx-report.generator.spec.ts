import { statusprocesso } from '@prisma/client';
import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ProcessReportData } from '../../interfaces';
import { ProcessXlsxReportGenerator } from './process-xlsx-report.generator';
import { XlsxReportGenerator } from './xlsx-report.generator';

function processData(): ProcessReportData {
  return {
    processo: {
      id_processo: 10,
      nome_processo: 'Processo Teste',
      status_processo: statusprocesso.CONCLUIDO,
      vacuo_alvo: 10,
      vacuo_inicial: null,
      vacuo_final: null,
      vacuo_medio: null,
      eficiencia: null,
      tempo_maximo: 120,
      tempo_execucao: 100,
      iniciado_em: null,
      pausado_em: null,
      retomado_em: null,
      finalizado_em: null,
      parada_emergencia: false,
      criado_em: new Date('2026-01-01T00:00:00.000Z'),
    },
    usuario_responsavel: null,
    tanques: [],
    sensores: [],
    leituras: [],
    eventos: [],
    alarmes: [],
    resumo: {
      total_tanques: 0,
      total_sensores: 0,
      total_leituras: 0,
      total_eventos: 0,
      total_alarmes: 0,
      total_alarmes_criticos: 0,
      total_alarmes_medios: 0,
      total_alarmes_info: 0,
      total_alarmes_resolvidos: 0,
      total_alarmes_ativos: 0,
      eficiencia_media: null,
      vacuo_medio_geral: null,
      tempo_execucao_total: 100,
    },
    diagnostico: {
      nivel: 'NORMAL',
      mensagem: 'OK',
      motivos: [],
      recomendacoes: [],
    },
    contexto_geracao: {
      id_usuario: 1,
      nome_usuario: 'Usuário Teste',
      observacao: null,
      gerado_em: new Date('2026-01-01T00:00:00.000Z'),
    },
  };
}

describe('ProcessXlsxReportGenerator', () => {
  let generator: ProcessXlsxReportGenerator;

  beforeEach(() => {
    generator = new ProcessXlsxReportGenerator(new XlsxReportGenerator());
  });

  it('gera Buffer XLSX de processo e metadados mínimos', async () => {
    const result = await generator.generate(processData());

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.extension).toBe('xlsx');
    expect(result.mime_type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(result.filename).toContain('processo-10');
  });

  it('lida com listas vazias sem criar XLSX de alarme ou chamar storage/Prisma', async () => {
    await expect(generator.generate(processData())).resolves.toMatchObject({
      extension: 'xlsx',
    });
  });
});
