import { describe, expect, it } from '@jest/globals';
import { CommandPayloadBuilder } from './command-payload.builder';
import { MQTT_COMMANDS } from './interfaces/command-name.interface';

describe('CommandPayloadBuilder', () => {
  it('cria envelope oficial v2 com contexto e codigo de hardware', () => {
    const payload = CommandPayloadBuilder.build(
      MQTT_COMMANDS.ABRIR_VALVULA,
      {
        id_valvula: 1,
        codigo_hardware: 'VP_T1',
      },
      {
        correlation_id: 'cmd-1',
        id_processo: 10,
        solicitado_por: 7,
        motivo: 'Teste de contrato',
      },
    );

    expect(payload).toEqual({
      tipo: 'COMANDO',
      schema_version: 2,
      comando: 'ABRIR_VALVULA',
      correlation_id: 'cmd-1',
      enviado_em: expect.any(String),
      id_processo: 10,
      solicitado_por: 7,
      motivo: 'Teste de contrato',
      parametros: {
        id_valvula: 1,
        codigo_hardware: 'VP_T1',
      },
    });
    expect(Number.isNaN(Date.parse(payload.enviado_em))).toBe(false);
  });
});
