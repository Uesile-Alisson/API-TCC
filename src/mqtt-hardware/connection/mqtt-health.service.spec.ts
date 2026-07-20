import { statusgeralsistema } from '@prisma/client';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { MqttConfigService } from '../config/mqtt-config.service';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { MqttClientService } from './mqtt-client.service';
import { MqttHealthService } from './mqtt-health.service';

describe('MqttHealthService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('marca MQTT e ESP32 indisponiveis imediatamente apos desconexao', () => {
    const { service } = makeService(false);

    service['checkHardwareHealth']();

    expect(service.getCurrentState()).toMatchObject({
      mqttConnected: false,
      esp32Online: false,
      currentStatus: statusgeralsistema.FALHA,
      lastError: 'Cliente MQTT desconectado do broker.',
    });
  });

  it('restaura saude operacional quando recebe heartbeat apos reconexao', () => {
    const { service } = makeService(true);

    service['handleMqttMessage'](heartbeat('ONLINE'));
    service['checkHardwareHealth']();

    expect(service.getCurrentState()).toMatchObject({
      mqttConnected: true,
      esp32Online: true,
      currentStatus: statusgeralsistema.OPERACIONAL,
      lastError: null,
    });
  });

  it('declara ESP32 offline quando o heartbeat vence mesmo com broker conectado', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-17T00:00:00.000Z'));
    const { service } = makeService(true);
    service['timeout_heartbeat'] = 10_000;
    service['handleMqttMessage'](heartbeat('ONLINE'));

    jest.setSystemTime(new Date('2026-07-17T00:00:10.001Z'));
    service['checkHardwareHealth']();

    expect(service.getCurrentState()).toMatchObject({
      mqttConnected: true,
      esp32Online: false,
      currentStatus: statusgeralsistema.FALHA,
    });
    expect(service.getCurrentState().lastError).toContain(
      'Timeout de heartbeat do ESP32',
    );
  });

  it('confirma que a configuracao carregada corresponde ao cliente conectado', async () => {
    const { service, isConfigApplied } = makeService(true);

    await service.reloadHealthConfig();

    expect(service.isCurrentConfigApplied()).toBe(true);
    expect(isConfigApplied).toHaveBeenCalledTimes(1);
  });
});

function makeService(connected: boolean) {
  const mqttClient = {
    getConnectionState: jest.fn(() => connected),
    isConfigApplied: jest.fn(() => connected),
    registerMessageListener: jest.fn(),
    removeMessageListener: jest.fn(),
  };
  const mqttConfig = {
    getConfig: jest.fn(() => Promise.resolve({ timeout_comunicacao: 10_000 })),
  };

  return {
    service: new MqttHealthService(
      mqttConfig as unknown as MqttConfigService,
      mqttClient as unknown as MqttClientService,
    ),
    isConfigApplied: mqttClient.isConfigApplied,
  };
}

function heartbeat(status: 'ONLINE' | 'OFFLINE'): MqttMessage {
  return {
    topic: 'tsea/heartbeat',
    payload: { status },
    rawPayloado: JSON.stringify({ status }),
    qos: 0,
    retain: false,
    receivedAt: new Date(),
  };
}
