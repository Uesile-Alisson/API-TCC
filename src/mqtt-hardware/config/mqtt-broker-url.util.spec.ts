import {
  normalizeMqttBrokerUrl,
  sanitizeMqttBrokerUrlForLog,
} from './mqtt-broker-url.util';
import { describe, expect, it } from '@jest/globals';

describe('normalizeMqttBrokerUrl', () => {
  it('normaliza localhost sem porta', () => {
    expect(normalizeMqttBrokerUrl('localhost')).toBe('mqtt://localhost:1883');
  });

  it('normaliza localhost com porta', () => {
    expect(normalizeMqttBrokerUrl('localhost:1883')).toBe(
      'mqtt://localhost:1883',
    );
  });

  it('mantem URL mqtt valida', () => {
    expect(normalizeMqttBrokerUrl('mqtt://localhost:1883')).toBe(
      'mqtt://localhost:1883',
    );
  });

  it('mantem URL mqtts valida', () => {
    expect(normalizeMqttBrokerUrl('mqtts://broker.exemplo:8883')).toBe(
      'mqtts://broker.exemplo:8883',
    );
  });

  it('rejeita string vazia', () => {
    expect(() => normalizeMqttBrokerUrl('')).toThrow(
      'Broker MQTT nao configurado.',
    );
  });

  it('rejeita protocolo invalido', () => {
    expect(() => normalizeMqttBrokerUrl('http://localhost:1883')).toThrow(
      'Broker MQTT deve usar protocolo mqtt:// ou mqtts://.',
    );
  });

  it('usa porta configurada quando o broker nao informa porta', () => {
    expect(normalizeMqttBrokerUrl('localhost', 1884)).toBe(
      'mqtt://localhost:1884',
    );
  });
});

describe('sanitizeMqttBrokerUrlForLog', () => {
  it('mascara credenciais antes de logar', () => {
    expect(
      sanitizeMqttBrokerUrlForLog('mqtt://usuario:senha@localhost:1883'),
    ).toBe('mqtt://%5Busuario%5D:%5Bsenha%5D@localhost:1883');
  });
});
