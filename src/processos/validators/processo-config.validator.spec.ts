import { BadRequestException } from '@nestjs/common';
import { modooperacaoauxiliar } from '@prisma/client';
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
        vacuo_alvo: -80,
        modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
        encerramento_automatico: true,
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

  it.each([0, 80])('bloqueia vacuo_alvo nao negativo: %s', (vacuo_alvo) => {
    const dto = buildValidDto({ vacuo_alvo });

    expect(() => validator.validateCreate(dto)).toThrow(BadRequestException);
  });

  it('permite configuracao valida com vacuo manometrico negativo', () => {
    expect(() => validator.validateCreate(buildValidDto())).not.toThrow();
  });

  it('bloqueia vacuo_alvo positivo em um tanque', () => {
    const dto = buildValidDto({
      tanques: [
        {
          id_tanque: 1,
          vacuo_alvo: 80,
          sensores: [{ id_sensor: 1 }],
        },
      ],
    });

    expect(() => validator.validateCreate(dto)).toThrow(BadRequestException);
  });

  it('permite atualizar alvo geral e individual com valores negativos', () => {
    expect(() =>
      validator.validateUpdate({
        vacuo_alvo: -82.5,
        tanques: [
          {
            id_tanque: 1,
            vacuo_alvo: -81.25,
            sensores: [{ id_sensor: 1 }],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('bloqueia vacuo_alvo positivo na atualizacao', () => {
    expect(() => validator.validateUpdate({ vacuo_alvo: 82.5 })).toThrow(
      BadRequestException,
    );
  });

  it('bloqueia criacao sem modo do subsistema auxiliar', () => {
    const dto = buildValidDto();
    delete (dto as Partial<CreateProcessoDTO>).modo_operacao_auxiliar;

    expect(() => validator.validateCreate(dto)).toThrow(BadRequestException);
  });

  it('bloqueia criacao sem escolha de encerramento automatico', () => {
    const dto = buildValidDto();
    delete (dto as Partial<CreateProcessoDTO>).encerramento_automatico;

    expect(() => validator.validateCreate(dto)).toThrow(BadRequestException);
  });

  it('aceita atualizacao contendo somente o modo auxiliar', () => {
    expect(() =>
      validator.validateUpdate({
        modo_operacao_auxiliar: modooperacaoauxiliar.ASSISTIDO,
      }),
    ).not.toThrow();
  });

  function buildValidDto(
    override: Partial<CreateProcessoDTO> = {},
  ): CreateProcessoDTO {
    return {
      tempo_maximo: 120,
      vacuo_alvo: -80,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      encerramento_automatico: true,
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
