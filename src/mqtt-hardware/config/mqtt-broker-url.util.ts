const MQTT_PROTOCOLS = new Set(['mqtt:', 'mqtts:']);

export function normalizeMqttBrokerUrl(
  input: string,
  defaultPort = 1883,
): string {
  const value = input.trim();

  if (!value) {
    throw new Error('Broker MQTT nao configurado.');
  }

  if (value.includes('://')) {
    return normalizeAbsoluteMqttUrl(value, defaultPort);
  }

  return normalizeHostAndPort(value, defaultPort);
}

export function sanitizeMqttBrokerUrlForLog(input: string): string {
  try {
    const url = new URL(input);

    if (url.username) {
      url.username = '[usuario]';
    }

    if (url.password) {
      url.password = '[senha]';
    }

    return url.toString();
  } catch {
    return '[broker MQTT invalido]';
  }
}

function normalizeAbsoluteMqttUrl(input: string, defaultPort: number): string {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error('Broker MQTT invalido.');
  }

  if (!MQTT_PROTOCOLS.has(url.protocol)) {
    throw new Error('Broker MQTT deve usar protocolo mqtt:// ou mqtts://.');
  }

  if (!url.hostname) {
    throw new Error('Broker MQTT deve informar um host.');
  }

  if (!url.port) {
    url.port = String(defaultPort);
  }

  return url.toString();
}

function normalizeHostAndPort(input: string, defaultPort: number): string {
  const [host, port, extra] = input.split(':');

  if (!host || extra !== undefined) {
    throw new Error('Broker MQTT invalido.');
  }

  const resolvedPort = port ?? String(defaultPort);

  return normalizeAbsoluteMqttUrl(
    `mqtt://${host}:${resolvedPort}`,
    defaultPort,
  );
}
