import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProcessoLeituraValidator } from '../validators';
import type {
  EventoProcessoContext,
  LeituraProcessoContext,
  ProcessoTanqueSensorContext,
} from '../validators';
import { beforeEach, describe, expect, it } from '@jest/globals';

describe('ProcessoLeituraValidator', () => {
  let validator: ProcessoLeituraValidator;

  beforeEach(() => {
    validator = new ProcessoLeituraValidator();
  });

  it('deve estar definido', () => {
    expect(validator).toBeDefined();
  });

  it('deve validar existencia de leitura', () => {
    expect(() => validator.validateLeituraExists(null)).toThrow(
      NotFoundException,
    );
    expect(() => validator.validateLeituraExists(undefined)).toThrow(
      NotFoundException,
    );
    expect(() => validator.validateLeituraExists(buildLeitura())).not.toThrow();
  });

  it('deve validar existencia de evento', () => {
    expect(() => validator.validateEventoExists(null)).toThrow(
      NotFoundException,
    );
    expect(() => validator.validateEventoExists(buildEvento())).not.toThrow();
  });

  it('deve validar existencia de vinculo processo/tanque/sensor', () => {
    expect(() => validator.validateProcessSensorExists(null)).toThrow(
      NotFoundException,
    );
    expect(() =>
      validator.validateProcessSensorExists(buildProcessSensor()),
    ).not.toThrow();
  });

  it('deve validar leitura pertencente ao processo', () => {
    expect(() =>
      validator.validateLeituraBelongsToProcess(buildLeitura(), 9),
    ).not.toThrow();
    expect(() =>
      validator.validateLeituraBelongsToProcess(
        {
          id_leitura_sensor: 1,
          id_processo_tanque_sensor: 2,
          processo_tanque_sensor: {
            id_processo_tanque_sensor: 2,
            id_processo: 9,
          },
        },
        9,
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateLeituraBelongsToProcess(
        {
          id_leitura_sensor: 1,
          id_processo_tanque_sensor: 2,
          processo_tanque_sensor: {
            id_processo_tanque_sensor: 2,
            processo_tanque: {
              id_processo_tanque: 3,
              id_processo: 9,
            },
          },
        },
        9,
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateLeituraBelongsToProcess(buildLeitura(), 8),
    ).toThrow(ConflictException);
    expect(() => validator.validateLeituraBelongsToProcess(null, 9)).toThrow(
      NotFoundException,
    );
  });

  it('deve validar evento pertencente ao processo', () => {
    expect(() =>
      validator.validateEventoBelongsToProcess(buildEvento(), 9),
    ).not.toThrow();
    expect(() =>
      validator.validateEventoBelongsToProcess(buildEvento(), 8),
    ).toThrow(ConflictException);
    expect(() => validator.validateEventoBelongsToProcess(null, 9)).toThrow(
      NotFoundException,
    );
  });

  it('deve validar sensor pertencente ao processo', () => {
    expect(() =>
      validator.validateProcessSensorBelongsToProcess(buildProcessSensor(), 9),
    ).not.toThrow();
    expect(() =>
      validator.validateProcessSensorBelongsToProcess(
        {
          id_processo_tanque_sensor: 2,
          processo_tanque: {
            id_processo_tanque: 3,
            id_processo: 9,
          },
        },
        9,
      ),
    ).not.toThrow();
    expect(() =>
      validator.validateProcessSensorBelongsToProcess(buildProcessSensor(), 8),
    ).toThrow(ConflictException);
    expect(() =>
      validator.validateProcessSensorBelongsToProcess(null, 9),
    ).toThrow(NotFoundException);
  });

  it('deve extrair id de processo da leitura por prioridade', () => {
    expect(validator.extractProcessIdFromLeitura(buildLeitura())).toBe(9);
    expect(
      validator.extractProcessIdFromLeitura({
        id_leitura_sensor: 1,
        id_processo_tanque_sensor: 2,
        processo_tanque_sensor: {
          id_processo_tanque_sensor: 2,
          id_processo: 8,
          processo_tanque: {
            id_processo_tanque: 3,
            id_processo: 7,
          },
        },
      }),
    ).toBe(8);
    expect(
      validator.extractProcessIdFromLeitura({
        id_leitura_sensor: 1,
        id_processo_tanque_sensor: 2,
      }),
    ).toBeNull();
  });

  it('deve extrair id de processo do sensor por prioridade', () => {
    expect(
      validator.extractProcessIdFromProcessSensor(buildProcessSensor()),
    ).toBe(9);
    expect(
      validator.extractProcessIdFromProcessSensor({
        id_processo_tanque_sensor: 2,
        processo_tanque: {
          id_processo_tanque: 3,
          id_processo: 8,
        },
      }),
    ).toBe(8);
    expect(
      validator.extractProcessIdFromProcessSensor({
        id_processo_tanque_sensor: 2,
      }),
    ).toBeNull();
  });

  it('deve identificar inteiro positivo', () => {
    expect(validator.isPositiveInt(1)).toBe(true);
    expect(validator.isPositiveInt(0)).toBe(false);
    expect(validator.isPositiveInt(-1)).toBe(false);
    expect(validator.isPositiveInt(1.5)).toBe(false);
    expect(validator.isPositiveInt('1')).toBe(false);
  });
});

function buildLeitura(): LeituraProcessoContext {
  return {
    id_leitura_sensor: 1,
    id_processo_tanque_sensor: 2,
    id_processo: 9,
  };
}

function buildEvento(): EventoProcessoContext {
  return {
    id_evento_processo: 1,
    id_processo: 9,
    id_processo_tanque_sensor: 2,
  };
}

function buildProcessSensor(): ProcessoTanqueSensorContext {
  return {
    id_processo_tanque_sensor: 2,
    id_processo_tanque: 3,
    id_processo: 9,
  };
}
