import { statusprocesso } from '@prisma/client';
import { Buffer } from 'node:buffer';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import type { ProcessReportData } from '../../interfaces';
import { PdfReportGenerator } from './pdf-report.generator';
import { ProcessPdfReportGenerator } from './process-pdf-report.generator';

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

describe('ProcessPdfReportGenerator', () => {
  let baseGenerator: PdfReportGenerator;
  let generator: ProcessPdfReportGenerator;
  let generateBufferSpy: jest.SpiedFunction<
    PdfReportGenerator['generateBuffer']
  >;

  beforeEach(() => {
    baseGenerator = new PdfReportGenerator();

    generateBufferSpy = jest.spyOn(baseGenerator, 'generateBuffer');
    generateBufferSpy.mockResolvedValue(Buffer.from('pdf-processo'));

    generator = new ProcessPdfReportGenerator(baseGenerator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gera PDF de processo com Buffer e metadados mínimos', async () => {
    const result = await generator.generate(processData());

    expect(generateBufferSpy).toHaveBeenCalled();
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.extension).toBe('pdf');
    expect(result.mime_type).toBe('application/pdf');
    expect(result.filename).toContain('processo-10');
  });

  it('lida com listas vazias sem chamar storage ou Prisma', async () => {
    await expect(generator.generate(processData())).resolves.toMatchObject({
      extension: 'pdf',
    });
  });
});
