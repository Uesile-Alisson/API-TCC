import {
  origemalarme,
  origemevento,
  Prisma,
  protocolosensor,
  severidadealarme,
  severidadeevento,
  statusalarme,
  statusprocesso,
  statussensor,
  statustanque,
  statustanqueprocesso,
  tipoalarme,
  tipoeventoprocesso,
  tipoleiturasensor,
  tiposensor,
  tiposensorprocesso,
} from '@prisma/client';
import { beforeEach, describe, expect, it } from '@jest/globals';

import type { RelatorioGenerationContext } from '../interfaces';
import type { CompleteProcessReportSource } from '../repositories';
import { ProcessReportDataMapper } from './process-report-data.mapper';

const context: RelatorioGenerationContext = {
  id_usuario: 1,
  nome_usuario: 'Usuário Teste',
  observacao: null,
  gerado_em: new Date('2026-01-01T00:00:00.000Z'),
};

function source(
  overrides: {
    status?: statusprocesso;
    paradaEmergencia?: boolean;
    alarmSeverity?: severidadealarme;
    alarmStatus?: statusalarme;
  } = {},
): CompleteProcessReportSource {
  const status = overrides.status ?? statusprocesso.CONCLUIDO;
  const alarmSeverity = overrides.alarmSeverity ?? severidadealarme.INFO;
  const alarmStatus = overrides.alarmStatus ?? statusalarme.RESOLVIDO;

  return {
    processo: {
      id_processo: 10,
      id_usuario: 1,
      nome_processo: 'Processo Teste',
      status_processo: status,
      fase_processo: null,
      vacuo_alvo: new Prisma.Decimal('10.5'),
      vacuo_inicial: new Prisma.Decimal('1.5'),
      vacuo_final: new Prisma.Decimal('9.5'),
      vacuo_medio: new Prisma.Decimal('8.5'),
      eficiencia: new Prisma.Decimal('95.5'),
      tempo_maximo: 120,
      tempo_execucao: 100,
      iniciado_em: new Date('2026-01-01T00:00:00.000Z'),
      pausado_em: null,
      retomado_em: null,
      finalizado_em: new Date('2026-01-01T01:00:00.000Z'),
      parada_emergencia: overrides.paradaEmergencia ?? false,
      criado_em: new Date('2025-12-31T00:00:00.000Z'),
      usuarios: {
        id_usuario: 1,
        nome: 'Usuário Teste',
      },
      processostanques: [
        {
          id_processo_tanque: 100,
          id_tanque: 5,
          vacuo_alvo: new Prisma.Decimal('10'),
          vacuo_inicial: new Prisma.Decimal('2'),
          vacuo_final: new Prisma.Decimal('9'),
          vacuo_medio: new Prisma.Decimal('8'),
          eficiencia: new Prisma.Decimal('90'),
          status_tanque_processo: statustanqueprocesso.CONCLUIDO,
          iniciado_em: new Date('2026-01-01T00:00:00.000Z'),
          finalizado_em: new Date('2026-01-01T01:00:00.000Z'),
          criado_em: new Date('2025-12-31T00:00:00.000Z'),
          volume_alvo_ml: new Prisma.Decimal('1000'),
          volume_enviado_ml: new Prisma.Decimal('900'),
          vazao_atual_l_min: null,
          nivel_atual_percentual: null,
          vacuo_atingido: true,
          vacuo_estabilizado: true,
          alimentacao_iniciada_em: null,
          alimentacao_finalizada_em: null,
          tanques: {
            id_tanque: 5,
            nome: 'Tanque A',
            volume: new Prisma.Decimal('100'),
            unidade_volume: 'L',
            vacuo_padrao: new Prisma.Decimal('10'),
            status_tanque: statustanque.ATIVO,
          },
          processostanquessensores: [
            {
              id_processo_tanque_sensor: 200,
              id_sensor: 7,
              ativo: true,
              tipo_sensor_processo: tiposensorprocesso.VACUO,
              removido_em: null,
              observacoes: null,
              sensores: {
                id_sensor: 7,
                nome: 'Sensor A',
                modelo: 'S-1',
                protocolo: protocolosensor.I2C,
                unidade_medida: 'kPa',
                precisao: new Prisma.Decimal('0.1'),
                status_sensor: statussensor.ATIVO,
                ultima_leitura: new Date('2026-01-01T00:10:00.000Z'),
                ultimo_valor_lido: new Prisma.Decimal('8.2'),
                tipo_sensor: tiposensor.VACUO,
              },
            },
            {
              id_processo_tanque_sensor: 201,
              id_sensor: 7,
              ativo: true,
              tipo_sensor_processo: tiposensorprocesso.VACUO,
              removido_em: null,
              observacoes: null,
              sensores: {
                id_sensor: 7,
                nome: 'Sensor A',
                modelo: 'S-1',
                protocolo: protocolosensor.I2C,
                unidade_medida: 'kPa',
                precisao: new Prisma.Decimal('0.1'),
                status_sensor: statussensor.ATIVO,
                ultima_leitura: null,
                ultimo_valor_lido: null,
                tipo_sensor: tiposensor.VACUO,
              },
            },
          ],
        },
      ],
    },
    leituras: [
      {
        id_leitura_sensor: 300,
        id_processo_tanque_sensor: 200,
        valor_vacuo: new Prisma.Decimal('8.8'),
        tipo_leitura: tipoleiturasensor.VACUO,
        valor: new Prisma.Decimal('8.8'),
        unidade_medida: 'kPa',
        volume_acumulado_ml: null,
        percentual_nivel: null,
        leitura_em: new Date('2026-01-01T00:10:00.000Z'),
        recebido_em: new Date('2026-01-01T00:10:01.000Z'),
        processostanquessensores: {
          id_processo_tanque_sensor: 200,
          id_sensor: 7,
          tipo_sensor_processo: tiposensorprocesso.VACUO,
          sensores: {
            id_sensor: 7,
            nome: 'Sensor A',
            modelo: 'S-1',
          },
          processostanques: {
            id_processo_tanque: 100,
            id_tanque: 5,
            tanques: {
              nome: 'Tanque A',
            },
          },
        },
      },
    ],
    eventos: [
      {
        id_evento_processo: 400,
        id_processo: 10,
        id_processo_tanque_sensor: 200,
        tipo_evento: tipoeventoprocesso.PROCESSO_CONCLUIDO,
        origem_evento: origemevento.SISTEMA,
        severidade_evento: severidadeevento.INFO,
        ocorrido_em: new Date('2026-01-01T01:00:00.000Z'),
      },
    ],
    alarmes: [
      {
        id_alarme: 500,
        id_processo: 10,
        id_processo_tanque: 100,
        id_processo_tanque_sensor: 200,
        titulo: 'Alarme Teste',
        descricao: 'Descricao',
        tipo_alarme: tipoalarme.SENSOR,
        severidade: alarmSeverity,
        status_alarme: alarmStatus,
        origem_alarme: origemalarme.SENSOR,
        valor_detectado: new Prisma.Decimal('8.8'),
        unidade: 'kPa',
        ocorrido_em: new Date('2026-01-01T00:20:00.000Z'),
        resolvido_em:
          alarmStatus === statusalarme.RESOLVIDO
            ? new Date('2026-01-01T00:30:00.000Z')
            : null,
      },
    ],
  } as unknown as CompleteProcessReportSource;
}

describe('ProcessReportDataMapper', () => {
  let mapper: ProcessReportDataMapper;

  beforeEach(() => {
    mapper = new ProcessReportDataMapper();
  });

  it('mapeia processo, relações, decimais e resumo', () => {
    const data = mapper.toReportData({
      source: source(),
      contexto_geracao: context,
    });
    const userRecord = data.usuario_responsavel as unknown as Record<
      string,
      unknown
    >;
    const readingRecord = data.leituras[0] as unknown as Record<
      string,
      unknown
    >;

    expect(data.processo.id_processo).toBe(10);
    expect(data.processo.vacuo_alvo).toBe(10.5);
    expect(data.usuario_responsavel).toEqual({
      id_usuario: 1,
      nome: 'Usuário Teste',
    });
    expect(userRecord.login).toBeUndefined();
    expect(userRecord.email).toBeUndefined();
    expect(userRecord.senha_hash).toBeUndefined();
    expect(data.tanques).toHaveLength(1);
    expect(data.sensores).toHaveLength(1);
    expect(data.leituras[0].id_tanque).toBe(5);
    expect(readingRecord.id_processo).toBeUndefined();
    expect(data.eventos).toHaveLength(1);
    expect(data.alarmes).toHaveLength(1);
    expect(data.resumo.total_tanques).toBe(1);
    expect(data.resumo.total_sensores).toBe(1);
    expect(data.resumo.total_leituras).toBe(1);
    expect(data.resumo.total_eventos).toBe(1);
    expect(data.resumo.total_alarmes).toBe(1);
    expect(data.resumo.total_alarmes_criticos).toBe(0);
    expect(data.resumo.total_alarmes_resolvidos).toBe(1);
    expect(data.resumo.eficiencia_media).toBe(90);
    expect(data.resumo.vacuo_medio_geral).toBe(8);
    expect(data.diagnostico.nivel).toBe('NORMAL');
  });

  it('gera diagnostico ATENCAO para alarme medio ativo', () => {
    const data = mapper.toReportData({
      source: source({
        alarmSeverity: severidadealarme.MEDIO,
        alarmStatus: statusalarme.ATIVO,
      }),
      contexto_geracao: context,
    });

    expect(data.diagnostico.nivel).toBe('ATENCAO');
  });

  it('gera diagnostico CRITICO para alarme critico ativo ou parada de emergencia', () => {
    const alarmData = mapper.toReportData({
      source: source({
        alarmSeverity: severidadealarme.CRITICO,
        alarmStatus: statusalarme.ATIVO,
      }),
      contexto_geracao: context,
    });
    const emergencyData = mapper.toReportData({
      source: source({ paradaEmergencia: true }),
      contexto_geracao: context,
    });

    expect(alarmData.diagnostico.nivel).toBe('CRITICO');
    expect(emergencyData.diagnostico.nivel).toBe('CRITICO');
  });
});
