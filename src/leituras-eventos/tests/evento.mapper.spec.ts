import {
  origemevento,
  severidadeevento,
  tipoeventoprocesso,
} from '@prisma/client';
import { EventoMapper } from '../mappers';
import { beforeEach, describe, expect, it } from '@jest/globals';

type EventoRaw = Parameters<EventoMapper['toResponse']>[0];
type EventoDetailsRaw = Parameters<EventoMapper['toDetails']>[0];

describe('EventoMapper', () => {
  let mapper: EventoMapper;

  beforeEach(() => {
    mapper = new EventoMapper();
  });

  it('deve estar definido', () => {
    expect(mapper).toBeDefined();
  });

  it('deve mapear campos simples sem dados extras', () => {
    const evento: EventoRaw = {
      id_evento_processo: 1,
      id_processo: 2,
      id_processo_tanque_sensor: null,
      tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
      origem_evento: origemevento.SISTEMA,
      severidade_evento: severidadeevento.INFO,
      ocorrido_em: new Date('2026-01-01T10:00:00Z'),
    };

    const response = mapper.toResponse(evento);

    expect(response).toEqual(evento);
    expect(response).not.toHaveProperty('senha_hash');
    expect(response).not.toHaveProperty('token');
  });

  it('deve mapear detalhes resumidos', () => {
    const evento: EventoDetailsRaw = {
      id_evento_processo: 1,
      id_processo: 2,
      id_processo_tanque_sensor: 3,
      tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
      origem_evento: origemevento.SISTEMA,
      severidade_evento: severidadeevento.CRITICO,
      ocorrido_em: new Date('2026-01-01T10:00:00Z'),
      processo: {
        id_processo: 2,
        nome_processo: 'Processo 2',
        status_processo: 'EM_EXECUCAO',
        iniciado_em: new Date('2026-01-01T09:00:00Z'),
        finalizado_em: null,
      },
      processo_tanque_sensor: {
        id_processo_tanque_sensor: 3,
        id_processo_tanque: 4,
        id_sensor: 5,
      },
      sensor: {
        id_sensor: 5,
        nome_sensor: 'Sensor 5',
        modelo_sensor: 'VX',
        unidade_medida: 'kPa',
        status_sensor: 'ATIVO',
      },
      tanque: {
        id_processo_tanque: 4,
        id_tanque: 6,
        nome_tanque: 'Tanque 6',
        status_tanque_processo: 'EM_EXECUCAO',
      },
    };

    const details = mapper.toDetails(evento);

    expect(details.processo?.id_processo).toBe(2);
    expect(details.processo_tanque_sensor?.id_sensor).toBe(5);
    expect(details.sensor?.nome_sensor).toBe('Sensor 5');
    expect(details.tanque?.nome_tanque).toBe('Tanque 6');
    expect(details).not.toHaveProperty('login');
    expect(details).not.toHaveProperty('email');
  });

  it('deve retornar relacoes ausentes como null', () => {
    const evento: EventoDetailsRaw = {
      id_evento_processo: 1,
      id_processo: 2,
      id_processo_tanque_sensor: null,
      tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
      origem_evento: origemevento.SISTEMA,
      severidade_evento: severidadeevento.INFO,
      ocorrido_em: new Date('2026-01-01T10:00:00Z'),
      processo: null,
      processo_tanque_sensor: null,
      sensor: null,
      tanque: null,
    };

    const details = mapper.toDetails(evento);

    expect(details.processo).toBeNull();
    expect(details.processo_tanque_sensor).toBeNull();
    expect(details.sensor).toBeNull();
    expect(details.tanque).toBeNull();
  });

  it('deve montar lista com metadados de paginacao', () => {
    const evento: EventoRaw = {
      id_evento_processo: 1,
      id_processo: 2,
      id_processo_tanque_sensor: 3,
      tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
      origem_evento: origemevento.SISTEMA,
      severidade_evento: severidadeevento.INFO,
      ocorrido_em: new Date('2026-01-01T10:00:00Z'),
    };

    const response = mapper.toListResponse([evento], 11, 2, 5);

    expect(response.data).toHaveLength(1);
    expect(response.meta.total_pages).toBe(3);
    expect(response.meta.has_next_page).toBe(true);
    expect(response.meta.has_previous_page).toBe(true);
  });
});
