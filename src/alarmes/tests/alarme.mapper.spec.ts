import { beforeEach, describe, expect, it } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { ALARME_MESSAGES, ALARME_NOTIFICATION_POLICIES } from '../constants';
import { AlarmeMapper } from '../mappers';

type RawAlarmeRecord = Parameters<AlarmeMapper['toResponse']>[0];
type RawAlarmeDetailsRecord = Parameters<AlarmeMapper['toDetails']>[0];
type RawDashboardInput = Parameters<AlarmeMapper['toDashboard']>[0];

describe('AlarmeMapper', () => {
  let mapper: AlarmeMapper;

  beforeEach(() => {
    mapper = new AlarmeMapper();
  });

  it('deve estar definido', () => {
    expect(mapper).toBeDefined();
  });

  it('decimalToNumber converte Decimal, number e string numerica', () => {
    expect(mapper.decimalToNumber(new Prisma.Decimal('12.34'))).toBe(12.34);
    expect(mapper.decimalToNumber(15)).toBe(15);
    expect(mapper.decimalToNumber('-80.5')).toBe(-80.5);
  });

  it('decimalToNumber retorna null para nulos, NaN e string invalida', () => {
    expect(mapper.decimalToNumber(null)).toBeNull();
    expect(mapper.decimalToNumber(undefined)).toBeNull();
    expect(mapper.decimalToNumber(Number.NaN)).toBeNull();
    expect(mapper.decimalToNumber('valor-invalido')).toBeNull();
  });

  it('toResponse mapeia campos basicos e nao inclui relacoes ou dados sensiveis', () => {
    const result = mapper.toResponse(
      makeRawAlarme({
        valor_detectado: new Prisma.Decimal('-80.5'),
      }),
    );
    const record = result as unknown as Record<string, unknown>;

    expect(result).toMatchObject({
      id_alarme: 10,
      titulo: 'Falha de pressao',
      descricao: 'Pressao fora do esperado.',
      tipo_alarme: 'PROCESSO',
      severidade: 'CRITICO',
      status_alarme: 'ATIVO',
      origem_alarme: 'BACKEND',
      valor_detectado: -80.5,
      unidade: 'kPa',
      id_processo: 20,
      id_mqtt_mensagem: 30,
    });
    expect(record).not.toHaveProperty('processos');
    expect(record).not.toHaveProperty('mqttmensagens');
    expect(JSON.stringify(record)).not.toContain('payload');
    expect(JSON.stringify(record)).not.toContain('senha_hash');
  });

  it('toResponse trata resolvido_em preenchido como status RESOLVIDO mesmo se status bruto vier ATIVO', () => {
    const result = mapper.toResponse(
      makeRawAlarme({
        status_alarme: 'ATIVO',
        resolvido_em: new Date('2026-06-21T10:00:00Z'),
      }),
    );

    expect(result.status_alarme).toBe('RESOLVIDO');
  });

  it('toDetails mapeia relacoes resumidas sem payload ou dados sensiveis', () => {
    const result = mapper.toDetails(makeRawDetails());
    const serialized = JSON.stringify(result);

    expect(result.processo).toMatchObject({
      id_processo: 20,
      nome_processo: 'Processo A',
      status_processo: 'EM_EXECUCAO',
      vacuo_alvo: -80,
    });
    expect(result.processo_tanque).toMatchObject({
      id_processo_tanque: 21,
      id_tanque: 5,
      nome_tanque: 'Tanque A',
      vacuo_alvo: -80,
    });
    expect(result.processo_tanque_sensor).toMatchObject({
      id_processo_tanque_sensor: 22,
      id_sensor: 6,
      nome_sensor: 'Sensor A',
    });
    expect(result.mqtt_mensagem).toMatchObject({
      id_mqtt_mensagem: 30,
      topico: 'tsea/alarmes',
      origem: 'ESP32',
    });
    expect(result.usuario_responsavel).toEqual({
      id_usuario: 7,
      nome: 'Tecnico',
    });
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('senha_hash');
    expect(serialized).not.toContain('tecnico@local');
  });

  it('toDetails transforma relacoes ausentes em null', () => {
    const result = mapper.toDetails({
      ...makeRawAlarme(),
      processos: null,
      processostanques: null,
      processostanquessensores: null,
      mqttmensagens: null,
      usuarios: null,
    });

    expect(result.processo).toBeNull();
    expect(result.processo_tanque).toBeNull();
    expect(result.processo_tanque_sensor).toBeNull();
    expect(result.mqtt_mensagem).toBeNull();
    expect(result.usuario_responsavel).toBeNull();
  });

  it('toListResponse calcula meta de paginacao corretamente', () => {
    const result = mapper.toListResponse([makeRawAlarme()], 25, 2, 10);

    expect(result.meta).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      total_pages: 3,
      has_next_page: true,
      has_previous_page: true,
    });
  });

  it('toListResponse usa total_pages 0 para total 0 e fallback para limit invalido', () => {
    const empty = mapper.toListResponse([], 0, 1, 10);
    const fallback = mapper.toListResponse([], -1, 0, 0);

    expect(empty.meta.total_pages).toBe(0);
    expect(fallback.meta).toMatchObject({
      page: 1,
      limit: 1,
      total: 0,
      total_pages: 0,
    });
  });

  it('toNotificationPayload usa policy de INFO, MEDIO, CRITICO e fallback INFO', () => {
    expect(
      mapper.toNotificationPayload(makeRawAlarme({ severidade: 'INFO' }))
        .policy,
    ).toEqual(ALARME_NOTIFICATION_POLICIES.INFO);
    expect(
      mapper.toNotificationPayload(makeRawAlarme({ severidade: 'MEDIO' }))
        .policy,
    ).toEqual(ALARME_NOTIFICATION_POLICIES.MEDIO);
    expect(
      mapper.toNotificationPayload(makeRawAlarme({ severidade: 'CRITICO' }))
        .policy,
    ).toEqual(ALARME_NOTIFICATION_POLICIES.CRITICO);
    const fallback = mapper.toNotificationPayload(
      makeRawAlarme({ severidade: 'DESCONHECIDO' }),
    );

    expect(fallback.policy).toEqual(ALARME_NOTIFICATION_POLICIES.INFO);
    expect(fallback.emitted_at).toBeInstanceOf(Date);
  });

  it('toNotificationPayload usa status efetivo quando resolvido_em esta preenchido', () => {
    const result = mapper.toNotificationPayload(
      makeRawAlarme({
        status_alarme: 'ATIVO',
        resolvido_em: new Date('2026-06-21T10:00:00Z'),
      }),
    );

    expect(result.status_alarme).toBe('RESOLVIDO');
  });

  it('toResolveResult retorna resultado de resolucao padronizado', () => {
    const resolvidoEm = new Date('2026-06-21T10:00:00Z');
    const result = mapper.toResolveResult(
      makeRawAlarme({ status_alarme: 'RESOLVIDO', resolvido_em: resolvidoEm }),
      7,
    );

    expect(result).toMatchObject({
      success: true,
      id_alarme: 10,
      action: 'RESOLVED',
      message: ALARME_MESSAGES.RESOLVED,
      status_alarme: 'RESOLVIDO',
      resolvido_em: resolvidoEm,
      id_usuario_responsavel: 7,
    });
    expect(result.occurred_at).toBeInstanceOf(Date);
  });

  it('toDashboard mapeia dashboard raw e ultimos alarmes', () => {
    const result = mapper.toDashboard(makeRawDashboard());

    expect(result).toMatchObject({
      total: 2,
      ativos: 1,
      resolvidos: 1,
      criticos: 1,
      medios: 1,
      infos: 0,
      por_severidade: [{ severidade: 'CRITICO', total: 1 }],
      por_status: [{ status_alarme: 'ATIVO', total: 1 }],
      por_tipo: [{ tipo_alarme: 'PROCESSO', total: 2 }],
      por_origem: [{ origem_alarme: 'BACKEND', total: 2 }],
    });
    expect(result.ultimos_criticos[0]).toMatchObject({ id_alarme: 10 });
    expect(result.ultimos_ativos[0]).toMatchObject({ id_alarme: 11 });
    expect(result.generated_at).toBeInstanceOf(Date);
  });
});

function makeRawAlarme(
  overrides: Partial<RawAlarmeRecord> = {},
): RawAlarmeRecord {
  return {
    id_alarme: 10,
    id_mqtt_mensagem: 30,
    id_usuario_responsavel: null,
    titulo: 'Falha de pressao',
    descricao: 'Pressao fora do esperado.',
    tipo_alarme: 'PROCESSO',
    severidade: 'CRITICO',
    status_alarme: 'ATIVO',
    origem_alarme: 'BACKEND',
    valor_detectado: '-80',
    unidade: 'kPa',
    ocorrido_em: new Date('2026-06-21T09:00:00Z'),
    resolvido_em: null,
    excluido_em: null,
    id_processo: 20,
    id_processo_tanque: 21,
    id_processo_tanque_sensor: 22,
    ...overrides,
  };
}

function makeRawDetails(): RawAlarmeDetailsRecord {
  return {
    ...makeRawAlarme(),
    processos: {
      id_processo: 20,
      nome_processo: 'Processo A',
      status_processo: 'EM_EXECUCAO',
      vacuo_alvo: '-80',
      iniciado_em: new Date('2026-06-21T08:00:00Z'),
      finalizado_em: null,
    },
    processostanques: {
      id_processo_tanque: 21,
      id_tanque: 5,
      vacuo_alvo: new Prisma.Decimal('-80'),
      status_tanque_processo: 'EM_EXECUCAO',
      tanques: {
        nome: 'Tanque A',
      },
    },
    processostanquessensores: {
      id_processo_tanque_sensor: 22,
      id_sensor: 6,
      sensores: {
        nome: 'Sensor A',
        modelo: 'VAC-1',
        unidade_medida: 'kPa',
        status_sensor: 'ATIVO',
      },
    },
    mqttmensagens: {
      id_mqtt_mensagem: 30,
      topico: 'tsea/alarmes',
      direcao: 'INBOUND',
      origem: 'ESP32',
      criado_em: new Date('2026-06-21T09:00:00Z'),
      payload: { segredo: true },
    },
    usuarios: {
      id_usuario: 7,
      nome: 'Tecnico',
      login: 'tecnico',
      email: 'tecnico@local',
      senha_hash: 'hash-secreto',
    },
  } as unknown as RawAlarmeDetailsRecord;
}

function makeRawDashboard(): RawDashboardInput {
  return {
    total: 2,
    ativos: 1,
    resolvidos: 1,
    criticos: 1,
    medios: 1,
    infos: 0,
    por_severidade: [{ severidade: 'CRITICO', total: 1 }],
    por_status: [{ status_alarme: 'ATIVO', total: 1 }],
    por_tipo: [{ tipo_alarme: 'PROCESSO', total: 2 }],
    por_origem: [{ origem_alarme: 'BACKEND', total: 2 }],
    ultimos_criticos: [makeRawAlarme()],
    ultimos_ativos: [makeRawAlarme({ id_alarme: 11 })],
  };
}
