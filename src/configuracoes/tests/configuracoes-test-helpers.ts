import { jest } from '@jest/globals';
import {
  Prisma,
  protocolosensor,
  statusbomba,
  statusgeralsistema,
  statussensor,
  statustanque,
  tipobomba,
  tiposensor,
} from '@prisma/client';
import type { Mock } from 'jest-mock';

export type AsyncMock<TResult> = Mock<(...args: unknown[]) => Promise<TResult>>;

export function asyncMock<TResult>(): AsyncMock<TResult> {
  return jest.fn<(...args: unknown[]) => Promise<TResult>>();
}

export const createdAt = new Date('2026-06-25T10:00:00.000Z');
export const updatedAt = new Date('2026-06-25T11:00:00.000Z');

export function makeSistemaRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_configuracao_sistema: 1,
    id_usuario_alteracao: null,
    tempo_maximo_padrao: 60,
    encerramento_automatico: true,
    tempo_estabilizacao_vacuo_segundos: 30,
    estabilizacao_cobertura_minima_percentual: new Prisma.Decimal('80'),
    intervalo_leitura_esperado_ms: 1000,
    timeout_leitura_sensor_ms: 2500,
    tempo_retencao_vacuo_segundos: 30,
    perda_vacuo_maxima_retencao: new Prisma.Decimal('2'),
    limite_seguranca_vacuo: new Prisma.Decimal('-95'),
    vacuo_padrao: new Prisma.Decimal('-80.5'),
    quantidade_maxima_tanques: 4,
    status_geral_sistema: statusgeralsistema.OPERACIONAL,
    versao_sistema: '1.0.0',
    tolerancia_vacuo_percentual: new Prisma.Decimal('10'),
    estagnacao_janela_segundos: 60,
    estagnacao_variacao_minima: new Prisma.Decimal('2'),
    estagnacao_leituras_minimas: 5,
    estagnacao_janelas_consecutivas: 2,
    criado_em: createdAt,
    atualizado_em: updatedAt,
    ...overrides,
  };
}

export function makeTanqueRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_tanque: 1,
    nome: 'Tanque 01',
    volume: new Prisma.Decimal('1000'),
    unidade_volume: 'L',
    vacuo_padrao: new Prisma.Decimal('-80.5'),
    status_tanque: statustanque.ATIVO,
    criado_em: createdAt,
    atualizado_em: updatedAt,
    ...overrides,
  };
}

export function makeBombaRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_bomba: 1,
    id_configuracao_sistema: 1,
    id_usuario_alteracao: null,
    nome: 'Bomba Principal',
    tipo_bomba: tipobomba.PRINCIPAL,
    status_padrao: statusbomba.ATIVA,
    entrada_por_pressao: true,
    entrada_por_tempo: false,
    encerramento_automatico: true,
    criado_em: createdAt,
    atualizado_em: updatedAt,
    ...overrides,
  };
}

export function makeSensorRecord(overrides: Record<string, unknown> = {}) {
  return {
    id_sensor: 1,
    nome: 'Sensor Vacuo 01',
    modelo: 'MPX5700',
    protocolo: protocolosensor.I2C,
    unidade_medida: 'kPa',
    precisao: new Prisma.Decimal('0.01'),
    status_sensor: statussensor.ATIVO,
    tipo_sensor: tiposensor.VACUO,
    fator_calibracao: new Prisma.Decimal('1'),
    criado_em: createdAt,
    ...overrides,
  };
}
