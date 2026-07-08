import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { HardwareCommand } from '../enums/hardware-commands.enum';
import { MqttCommandoValidator } from './mqtt-command.validator';

describe('MqttCommandoValidator', () => {
  it.each([HardwareCommand.ABRIR_VALVULA, HardwareCommand.FECHAR_VALVULA])(
    'aceita %s com id_valvula positivo',
    (comando) => {
      const result = MqttCommandoValidator.validate({
        comando,
        id_valvula: 10,
        origem: 'teste',
      });

      expect(result).toMatchObject({
        comando,
        id_valvula: 10,
      });
    },
  );

  it('rejeita comando de valvula sem id_valvula', () => {
    expect(() =>
      MqttCommandoValidator.validate({
        comando: HardwareCommand.ABRIR_VALVULA,
        origem: 'teste',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejeita comando de valvula direcionado por id_bomba', () => {
    expect(() =>
      MqttCommandoValidator.validate({
        comando: HardwareCommand.FECHAR_VALVULA,
        id_bomba: 1,
        origem: 'teste',
      }),
    ).toThrow(BadRequestException);
  });
});
