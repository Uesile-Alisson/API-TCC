import {
  origemalarme,
  severidadealarme,
  statusalarme,
  tipoalarme,
} from '@prisma/client';
import { Buffer } from 'node:buffer';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import type { AlarmReportData } from '../../interfaces';
import { AlarmPdfReportGenerator } from './alarm-pdf-report.generator';
import { PdfReportGenerator } from './pdf-report.generator';

function alarmData(): AlarmReportData {
  return {
    alarme: {
      id_alarme: 20,
      titulo: 'Alarme Teste',
      descricao: 'Descricao',
      tipo_alarme: tipoalarme.SENSOR,
      severidade: severidadealarme.CRITICO,
      status_alarme: statusalarme.RESOLVIDO,
      origem_alarme: origemalarme.SENSOR,
      valor_detectado: null,
      unidade: null,
      ocorrido_em: new Date('2026-01-01T00:00:00.000Z'),
      resolvido_em: new Date('2026-01-01T00:30:00.000Z'),
      id_processo: null,
      id_processo_tanque: null,
      id_processo_tanque_sensor: null,
    },
    processo: null,
    tanque: null,
    sensor: null,
    usuario_responsavel: null,
    leituras_relacionadas: [],
    eventos_relacionados: [],
    diagnostico: {
      nivel: 'CRITICO',
      mensagem: 'Crítico',
      causa_provavel: null,
      impacto_operacional: null,
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

describe('AlarmPdfReportGenerator', () => {
  let baseGenerator: PdfReportGenerator;
  let generator: AlarmPdfReportGenerator;
  let generateBufferSpy: jest.SpiedFunction<
    PdfReportGenerator['generateBuffer']
  >;

  beforeEach(() => {
    baseGenerator = new PdfReportGenerator();

    generateBufferSpy = jest.spyOn(baseGenerator, 'generateBuffer');
    generateBufferSpy.mockResolvedValue(Buffer.from('pdf-alarme'));

    generator = new AlarmPdfReportGenerator(baseGenerator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gera PDF de alarme com Buffer e metadados mínimos', async () => {
    const result = await generator.generate(alarmData());

    expect(generateBufferSpy).toHaveBeenCalled();
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.extension).toBe('pdf');
    expect(result.mime_type).toBe('application/pdf');
    expect(result.filename).toContain('alarme-20');
  });

  it('não gera XLSX nem chama storage/Prisma', async () => {
    await expect(generator.generate(alarmData())).resolves.toMatchObject({
      extension: 'pdf',
    });
  });
});
