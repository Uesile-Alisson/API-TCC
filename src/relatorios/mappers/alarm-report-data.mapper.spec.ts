import {
  origemalarme,
  origemevento,
  Prisma,
  severidadealarme,
  severidadeevento,
  statusalarme,
  statusprocesso,
  statustanqueprocesso,
  tipoalarme,
  tipoeventoprocesso,
  tipoleiturasensor,
  tiposensorprocesso,
} from '@prisma/client';
import { beforeEach, describe, expect, it } from '@jest/globals';

import type { RelatorioGenerationContext } from '../interfaces';
import type { CompleteAlarmReportSource } from '../repositories';
import { AlarmReportDataMapper } from './alarm-report-data.mapper';

const context: RelatorioGenerationContext = {
  id_usuario: 1,
  nome_usuario: 'Usuário Teste',
  observacao: null,
  gerado_em: new Date('2026-01-01T00:00:00.000Z'),
};

function source(
  severidade: severidadealarme = severidadealarme.CRITICO,
  withRelations = true,
): CompleteAlarmReportSource {
  return {
    alarme: {
      id_alarme: 20,
      id_processo: withRelations ? 10 : null,
      id_processo_tanque: withRelations ? 100 : null,
      id_processo_tanque_sensor: withRelations ? 200 : null,
      id_usuario_responsavel: withRelations ? 1 : null,
      id_mqtt_mensagem: 999,
      titulo: 'Alarme Teste',
      descricao: 'Descricao',
      tipo_alarme: tipoalarme.SENSOR,
      severidade,
      status_alarme: statusalarme.RESOLVIDO,
      origem_alarme: origemalarme.SENSOR,
      valor_detectado: new Prisma.Decimal('12.5'),
      unidade: 'kPa',
      ocorrido_em: new Date('2026-01-01T00:00:00.000Z'),
      resolvido_em: new Date('2026-01-01T00:30:00.000Z'),
      excluido_em: null,
      processos: withRelations
        ? {
            id_processo: 10,
            nome_processo: 'Processo Teste',
            status_processo: statusprocesso.CONCLUIDO,
            iniciado_em: new Date('2026-01-01T00:00:00.000Z'),
            finalizado_em: new Date('2026-01-01T01:00:00.000Z'),
          }
        : null,
      processostanques: withRelations
        ? {
            id_processo_tanque: 100,
            id_processo: 10,
            id_tanque: 5,
            status_tanque_processo: statustanqueprocesso.CONCLUIDO,
            tanques: {
              nome: 'Tanque A',
            },
          }
        : null,
      processostanquessensores: withRelations
        ? {
            id_processo_tanque_sensor: 200,
            id_sensor: 7,
            tipo_sensor_processo: tiposensorprocesso.VACUO,
            sensores: {
              id_sensor: 7,
              nome: 'Sensor A',
              modelo: 'S-1',
              unidade_medida: 'kPa',
            },
          }
        : null,
      usuarios: withRelations
        ? {
            id_usuario: 1,
            nome: 'Usuário Teste',
          }
        : null,
    },
    leituras: [
      {
        id_leitura_sensor: 300,
        id_processo_tanque_sensor: 200,
        tipo_leitura: tipoleiturasensor.VACUO,
        valor: new Prisma.Decimal('12.5'),
        valor_vacuo: new Prisma.Decimal('12.5'),
        unidade_medida: 'kPa',
        leitura_em: new Date('2026-01-01T00:00:00.000Z'),
        recebido_em: new Date('2026-01-01T00:00:01.000Z'),
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
        tipo_evento: tipoeventoprocesso.VACUO_FORA_LIMITE,
        origem_evento: origemevento.SENSOR,
        severidade_evento: severidadeevento.CRITICO,
        ocorrido_em: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  };
}

describe('AlarmReportDataMapper', () => {
  let mapper: AlarmReportDataMapper;

  beforeEach(() => {
    mapper = new AlarmReportDataMapper();
  });

  it('mapeia alarme com relações, decimais e dados seguros', () => {
    const data = mapper.toReportData({
      source: source(),
      contexto_geracao: context,
    });
    const alarmRecord = data.alarme as unknown as Record<string, unknown>;
    const userRecord = data.usuario_responsavel as unknown as Record<
      string,
      unknown
    >;

    expect(data.alarme.id_alarme).toBe(20);
    expect(data.alarme.valor_detectado).toBe(12.5);
    expect(data.processo?.id_processo).toBe(10);
    expect(data.tanque?.nome_tanque).toBe('Tanque A');
    expect(data.sensor?.nome_sensor).toBe('Sensor A');
    expect(data.usuario_responsavel).toEqual({
      id_usuario: 1,
      nome: 'Usuário Teste',
    });
    expect(data.leituras_relacionadas).toHaveLength(1);
    expect(data.eventos_relacionados).toHaveLength(1);
    expect(alarmRecord.id_mqtt_mensagem).toBeUndefined();
    expect(alarmRecord.payload).toBeUndefined();
    expect(userRecord.login).toBeUndefined();
    expect(userRecord.email).toBeUndefined();
    expect(userRecord.senha_hash).toBeUndefined();
  });

  it('trata relações null sem quebrar', () => {
    const data = mapper.toReportData({
      source: source(severidadealarme.INFO, false),
      contexto_geracao: context,
    });

    expect(data.processo).toBeNull();
    expect(data.tanque).toBeNull();
    expect(data.sensor).toBeNull();
    expect(data.usuario_responsavel).toBeNull();
  });

  it('resolve diagnostico conforme severidade', () => {
    expect(
      mapper.toReportData({
        source: source(severidadealarme.CRITICO),
        contexto_geracao: context,
      }).diagnostico.nivel,
    ).toBe('CRITICO');
    expect(
      mapper.toReportData({
        source: source(severidadealarme.MEDIO),
        contexto_geracao: context,
      }).diagnostico.nivel,
    ).toBe('ATENCAO');
    expect(
      mapper.toReportData({
        source: source(severidadealarme.INFO),
        contexto_geracao: context,
      }).diagnostico.nivel,
    ).toBe('INFO');
  });
});
