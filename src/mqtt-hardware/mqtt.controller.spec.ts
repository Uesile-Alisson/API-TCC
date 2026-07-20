import { describe, expect, it, jest } from '@jest/globals';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { MqttController } from './mqtt.controller';
import { MqttService } from './mqtt.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMqttCredentialsDTO } from './dto/update-mqtt-credentials.dto';

describe('MqttController - credenciais externas', () => {
  it('delega a atualizacao sem devolver usuario ou senha', async () => {
    const safeResponse = {
      credenciais_atualizadas: true as const,
      usuario_mqtt_configurado: true,
      senha_mqtt_configurada: true,
      credenciais_configuradas: true,
      credenciais_verificadas: false,
      credenciais_verificadas_em: null,
      ultima_falha_credenciais: null,
      connected: false,
    };
    const updateCredentials = jest.fn(() => Promise.resolve(safeResponse));
    const controller = new MqttController({
      updateCredentials,
    } as unknown as MqttService);
    const dto = {
      usuario_mqtt: 'usuario-externo',
      senha_mqtt: 'senha-externa',
    };

    const result = await controller.updateCredentials(dto, {
      id_usuario: 7,
      nivel_acesso: 'ADMINISTRADOR',
    });

    expect(updateCredentials).toHaveBeenCalledWith(dto, 7);
    expect(result).toBe(safeResponse);
    expect(JSON.stringify(result)).not.toContain('usuario-externo');
    expect(JSON.stringify(result)).not.toContain('senha-externa');
  });

  it('mantem a rota de credenciais restrita a administrador', () => {
    const handler = Object.getOwnPropertyDescriptor(
      MqttController.prototype,
      'updateCredentials',
    )?.value as object;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['ADMINISTRADOR']);
  });

  it('valida caracteres de controle e limites das credenciais', async () => {
    const valid = plainToInstance(UpdateMqttCredentialsDTO, {
      usuario_mqtt: 'usuario-seguro',
      senha_mqtt: 'senha-segura',
    });
    const invalid = plainToInstance(UpdateMqttCredentialsDTO, {
      usuario_mqtt: '   ',
      senha_mqtt: 'senha\nquebrada',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect((await validate(invalid)).length).toBeGreaterThanOrEqual(2);
  });
});

describe('MqttController - comandos administrativos', () => {
  it('propaga a identidade autenticada nas operacoes de conexao', async () => {
    const reconnect = jest.fn(() => Promise.resolve({ success: true }));
    const disconnect = jest.fn(() => Promise.resolve({ success: true }));
    const controller = new MqttController({
      reconnect,
      disconnect,
    } as unknown as MqttService);
    const user = {
      id_usuario: 7,
      nivel_acesso: 'ADMINISTRADOR',
    };

    await controller.reconnect(user);
    await controller.disconnect(user);

    expect(reconnect).toHaveBeenCalledWith(7);
    expect(disconnect).toHaveBeenCalledWith(7);
  });

  it('mantem a parada de emergencia disponivel ao operador', () => {
    const handler = Object.getOwnPropertyDescriptor(
      MqttController.prototype,
      'paradaEmergencia',
    )?.value as object;

    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      'ADMINISTRADOR',
      'TECNICO',
      'OPERADOR',
    ]);
  });

  it('propaga processo alvo e identidade autenticada para o coordenador', async () => {
    const paradaEmergencia = jest.fn(() => Promise.resolve({ success: true }));
    const controller = new MqttController({
      paradaEmergencia,
    } as unknown as MqttService);

    await controller.paradaEmergencia(
      {
        id_processo: 42,
        motivo: 'Risco identificado pelo operador',
      },
      {
        id_usuario: 7,
        nivel_acesso: 'OPERADOR',
      },
    );

    expect(paradaEmergencia).toHaveBeenCalledWith({
      id_processo: 42,
      motivo: 'Risco identificado pelo operador',
      solicitado_por: 7,
      qos: undefined,
      correlation_id: undefined,
    });
  });
});
