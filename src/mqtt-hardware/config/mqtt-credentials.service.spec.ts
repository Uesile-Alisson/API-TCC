import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ActiveMqttConfig } from '../interfaces/active-mqtt-config.interface';
import { statusconexaomqtt } from '@prisma/client';
import { MqttConfigService } from './mqtt-config.service';
import { MqttCredentialsService } from './mqtt-credentials.service';

describe('MqttCredentialsService', () => {
  let temporaryDirectory: string;
  let credentialsPath: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tsea-mqtt-'));
    credentialsPath = join(temporaryDirectory, 'mqtt-credentials.json');

    if (process.platform !== 'win32') {
      await chmod(temporaryDirectory, 0o700);
    }
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('grava o arquivo externo atomicamente e persiste somente indicadores', async () => {
    const { service, updateCredentialState } = makeService(credentialsPath);

    await service.configureCredentials(
      {
        usuario_mqtt: ' usuario-externo ',
        senha_mqtt: 'senha-externa',
      },
      7,
    );

    const stored = JSON.parse(await readFile(credentialsPath, 'utf8')) as {
      versao: number;
      usuario_mqtt: string;
      senha_mqtt: string;
      atualizado_em: string;
    };
    expect(stored).toMatchObject({
      versao: 1,
      usuario_mqtt: 'usuario-externo',
      senha_mqtt: 'senha-externa',
    });
    expect(new Date(stored.atualizado_em).toString()).not.toBe('Invalid Date');
    expect(updateCredentialState).toHaveBeenCalledWith(
      {
        usuario_mqtt_configurado: true,
        senha_mqtt_configurada: true,
        credenciais_verificadas_em: null,
        ultima_falha_credenciais: null,
      },
      {
        idUsuarioAlteracao: 7,
        recordHistory: true,
        force: true,
      },
    );
    expect(JSON.stringify(updateCredentialState.mock.calls)).not.toContain(
      'senha-externa',
    );
    expect(service.getCredentialReadiness()).toMatchObject({
      usuarioConfigurado: true,
      senhaConfigurada: true,
      credenciaisConfiguradas: true,
      credenciaisVerificadas: false,
      verificadasEm: null,
    });
  });

  it('le credenciais validas sem consultar usuario ou senha no banco', async () => {
    const { service, updateCredentialState } = makeService(credentialsPath);
    await writeSecureCredentialsFile(credentialsPath, {
      versao: 1,
      usuario_mqtt: 'usuario-externo',
      senha_mqtt: 'senha-externa',
      atualizado_em: '2026-07-17T12:00:00.000Z',
    });

    await expect(service.readCredentials()).resolves.toEqual({
      username: 'usuario-externo',
      password: 'senha-externa',
    });
    expect(updateCredentialState).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_mqtt_configurado: true,
        senha_mqtt_configurada: true,
      }),
      expect.objectContaining({ recordHistory: true }),
    );
  });

  it('inicializa sem arquivo e sincroniza estado indisponivel sem derrubar a API', async () => {
    const { service, updateCredentialState } = makeService(credentialsPath);

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(updateCredentialState).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_mqtt_configurado: false,
        senha_mqtt_configurada: false,
        credenciais_verificadas_em: null,
        ultima_falha_credenciais:
          'O arquivo externo de credenciais MQTT ainda nao existe.',
      }),
      expect.objectContaining({ recordHistory: true }),
    );
  });

  it('distingue usuario presente de senha ausente em arquivo incompleto', async () => {
    const { service, updateCredentialState } = makeService(credentialsPath);
    await writeSecureCredentialsFile(credentialsPath, {
      versao: 1,
      usuario_mqtt: 'usuario-externo',
      senha_mqtt: '',
      atualizado_em: '2026-07-17T12:00:00.000Z',
    });

    await expect(service.readCredentials()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(updateCredentialState).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_mqtt_configurado: true,
        senha_mqtt_configurada: false,
        credenciais_verificadas_em: null,
      }),
      expect.any(Object),
    );
  });

  it('recusa caminho relativo ou localizado dentro do projeto', async () => {
    const relativeService = makeService('mqtt-credentials.json').service;
    const internalService = makeService(
      join(process.cwd(), 'mqtt-credentials-test.json'),
    ).service;
    const input = {
      usuario_mqtt: 'usuario',
      senha_mqtt: 'senha',
    };

    await expect(
      relativeService.configureCredentials(input, 7),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      internalService.configureCredentials(input, 7),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('distingue configuracao, verificacao no broker e falha de autenticacao', async () => {
    const { service } = makeService(credentialsPath);
    await writeSecureCredentialsFile(credentialsPath, {
      versao: 1,
      usuario_mqtt: 'usuario-externo',
      senha_mqtt: 'senha-externa',
      atualizado_em: '2026-07-17T12:00:00.000Z',
    });

    await service.readCredentials();
    expect(service.getCredentialReadiness()).toMatchObject({
      credenciaisConfiguradas: true,
      credenciaisVerificadas: false,
    });

    await service.markCredentialsVerified();
    expect(service.getCredentialReadiness()).toMatchObject({
      credenciaisConfiguradas: true,
      credenciaisVerificadas: true,
      ultimaFalha: null,
    });

    await service.markAuthenticationFailure('Not authorized');
    expect(service.getCredentialReadiness()).toMatchObject({
      credenciaisConfiguradas: true,
      credenciaisVerificadas: false,
      verificadasEm: null,
      ultimaFalha: 'Not authorized',
    });
  });

  it('invalida a verificacao quando o conteudo do arquivo externo muda', async () => {
    const { service } = makeService(credentialsPath);
    await writeSecureCredentialsFile(credentialsPath, {
      versao: 1,
      usuario_mqtt: 'usuario-externo',
      senha_mqtt: 'senha-antiga',
      atualizado_em: '2026-07-17T12:00:00.000Z',
    });
    await service.readCredentials();
    await service.markCredentialsVerified();

    await writeSecureCredentialsFile(credentialsPath, {
      versao: 1,
      usuario_mqtt: 'usuario-externo',
      senha_mqtt: 'senha-nova',
      atualizado_em: '2026-07-17T13:00:00.000Z',
    });
    await service.readCredentials();

    expect(service.getCredentialReadiness()).toMatchObject({
      credenciaisConfiguradas: true,
      credenciaisVerificadas: false,
      verificadasEm: null,
    });
  });
});

function makeService(path: string) {
  let currentConfig = makeConfig();
  const updateCredentialState = jest.fn((state: Partial<ActiveMqttConfig>) => {
    currentConfig = { ...currentConfig, ...state };
    return Promise.resolve(currentConfig);
  });
  const mqttConfigService = {
    getConfig: jest.fn(() => Promise.resolve(currentConfig)),
    updateCredentialState,
  };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'MQTT_CREDENTIALS_FILE_PATH' ? path : undefined,
    ),
  };

  return {
    service: new MqttCredentialsService(
      configService as unknown as ConfigService,
      mqttConfigService as unknown as MqttConfigService,
    ),
    updateCredentialState,
  };
}

async function writeSecureCredentialsFile(
  path: string,
  value: Record<string, unknown>,
): Promise<void> {
  await writeFile(path, JSON.stringify(value), {
    encoding: 'utf8',
    mode: 0o600,
  });

  if (process.platform !== 'win32') {
    await chmod(path, 0o600);
  }
}

function makeConfig(): ActiveMqttConfig {
  return {
    id_mqtt_configuracao: 1,
    chave_configuracao: 'MQTT_PRINCIPAL',
    id_usuario_alteracao: null,
    broker_url: 'mqtt://localhost',
    porta: 1883,
    usuario_mqtt_configurado: false,
    senha_mqtt_configurada: false,
    credenciais_verificadas_em: null,
    ultima_falha_credenciais: null,
    topico_leituras: 'tsea/leituras',
    topico_comandos: 'tsea/comandos',
    topico_alarmes: 'tsea/alarmes',
    topico_heartbeat: 'tsea/heartbeat',
    topico_status: 'tsea/status',
    topico_acoplamentos: 'tsea/acoplamentos',
    topico_configuracoes: 'tsea/config',
    topico_acks: 'tsea/acks',
    reconexao_automatica: true,
    timeout_comunicacao: 10_000,
    status_conexao: statusconexaomqtt.DESCONECTADO,
    ultima_conexao: null,
    ultima_sincronizacao: null,
    ultima_falha: null,
    criado_em: new Date('2026-07-17T00:00:00.000Z'),
    atualizado_em: new Date('2026-07-17T00:00:00.000Z'),
    ativo: true,
  };
}
