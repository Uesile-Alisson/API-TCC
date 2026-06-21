import { BadRequestException } from '@nestjs/common';
import { CreateProcessoDTO } from '../dto';
import { ProcessoConfigValidator } from './processo-config.validator';
import { beforeEach, describe, expect, it } from '@jest/globals';

describe('ProcessoConfigValidator', () => {
  let validator: ProcessoConfigValidator;

  beforeEach(() => {
    validator = new ProcessoConfigValidator();
  });

  it('bloqueia processo sem tanques', () => {
    expect(() =>
      validator.validateCreate({
        tempo_maximo: 60,
        vacuo_alvo: 80,
        tanques: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('bloqueia mais de 3 tanques', () => {
    const dto = buildValidDto({
      tanques: [1, 2, 3, 4].map((id_tanque) => ({
        id_tanque,
        sensores: [{ id_sensor: id_tanque }],
      })),
    });

    expect(() => validator.validateCreate(dto)).toThrow(BadRequestException);
  });

  it('bloqueia tanque duplicado', () => {
    const dto = buildValidDto({
      tanques: [
        { id_tanque: 1, sensores: [{ id_sensor: 1 }] },
        { id_tanque: 1, sensores: [{ id_sensor: 2 }] },
      ],
    });

    expect(() => validator.validateCreate(dto)).toThrow(BadRequestException);
  });

  it('bloqueia sensor duplicado no mesmo tanque', () => {
    const dto = buildValidDto({
      tanques: [
        {
          id_tanque: 1,
          sensores: [{ id_sensor: 1 }, { id_sensor: 1 }],
        },
      ],
    });

    expect(() => validator.validateCreate(dto)).toThrow(BadRequestException);
  });

  it('bloqueia sensor usado em dois tanques diferentes', () => {
    const dto = buildValidDto({
      tanques: [
        { id_tanque: 1, sensores: [{ id_sensor: 10 }] },
        { id_tanque: 2, sensores: [{ id_sensor: 10 }] },
      ],
    });

    expect(() => validator.validateCreate(dto)).toThrow(BadRequestException);
  });

  it('bloqueia vacuo_alvo menor ou igual a zero', () => {
    const dto = buildValidDto({ vacuo_alvo: 0 });

    expect(() => validator.validateCreate(dto)).toThrow(BadRequestException);
  });

  it('permite configuração válida de vácuo', () => {
    expect(() => validator.validateCreate(buildValidDto())).not.toThrow();
  });

  function buildValidDto(
    override: Partial<CreateProcessoDTO> = {},
  ): CreateProcessoDTO {
    return {
      tempo_maximo: 120,
      vacuo_alvo: 80,
      tanques: [
        {
          id_tanque: 1,
          sensores: [{ id_sensor: 1 }],
        },
      ],
      ...override,
    };
  }
});
