const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setServers } = require('node:dns');
const { lstat, readFile } = require('node:fs/promises');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
setServers(['8.8.8.8', '1.1.1.1']);

const REQUIRED_OPT_IN = 'RUN_REAL_INFRASTRUCTURE_CHECK';
const MAX_CREDENTIALS_FILE_SIZE = 16 * 1024;
const PRIVATE_DIRECTORY_MASK = 0o077;

async function main() {
  if (process.env[REQUIRED_OPT_IN] !== 'true') {
    throw new Error(
      `${REQUIRED_OPT_IN}=true e obrigatoria para confirmar o uso dos servicos reais.`,
    );
  }

  const checks = {};
  const postgres = await capture(checks, 'postgres', () =>
    validatePostgres(
      requiredEnvironment(
        process.env.DIRECT_URL || process.env.DATABASE_URL,
        'DIRECT_URL ou DATABASE_URL',
      ),
    ),
  );
  await Promise.all([
    capture(checks, 'mongodb', () =>
      validateMongo(
        requiredEnvironment(process.env.MONGODB_URI, 'MONGODB_URI'),
      ),
    ),
    capture(checks, 'mqtt', () => {
      if (!postgres.ok) {
        throw new Error('depende de uma configuracao lida no PostgreSQL.');
      }
      return validateMqtt(
        postgres.value,
        requiredEnvironment(
          process.env.MQTT_CREDENTIALS_FILE_PATH,
          'MQTT_CREDENTIALS_FILE_PATH',
        ),
      );
    }),
    capture(checks, 'smtp', validateSmtp),
  ]);

  const success = Object.values(checks).every((result) => result === 'ok');
  await new Promise((resolve) =>
    process.stdout.write(
      `${JSON.stringify({
        success,
        checks,
        mutation: 'none',
        checked_at: new Date().toISOString(),
      })}\n`,
      resolve,
    ),
  );
  process.exit(success ? 0 : 1);
}

async function capture(checks, name, operation) {
  try {
    const value = await withTimeout(operation(), name, 15_000);
    checks[name] = 'ok';
    return { ok: true, value };
  } catch (error) {
    checks[name] =
      error instanceof Error ? error.message : 'falha desconhecida';
    return { ok: false, value: undefined };
  }
}

async function withTimeout(promise, name, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${name}: timeout apos ${timeoutMs} ms.`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function validatePostgres(connectionString) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
  });

  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const health = await client.query(`
      SELECT
        (SELECT count(*)::int
           FROM _prisma_migrations
          WHERE finished_at IS NOT NULL
            AND rolled_back_at IS NULL) AS applied_migrations,
        (SELECT count(*)::int FROM processos) AS process_count
    `);
    const mqttResult = await client.query(`
      SELECT broker_url, porta, ativo
        FROM mqttconfiguracoes
       WHERE chave_configuracao = 'MQTT_PRINCIPAL'
       LIMIT 1
    `);
    await client.query('ROLLBACK');

    if (!health.rows[0] || health.rows[0].applied_migrations < 1) {
      throw new Error('schema Prisma sem migracoes aplicadas.');
    }

    const config = mqttResult.rows[0];
    if (!config || config.ativo !== true) {
      throw new Error('configuracao MQTT principal ativa nao encontrada.');
    }

    return config;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw stepError('PostgreSQL', error);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function validateMongo(uri) {
  const client = new MongoClient(uri, {
    connectTimeoutMS: 10_000,
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    await client.connect();
    await client.db().command({ ping: 1 });
  } catch (error) {
    throw stepError('MongoDB', error);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function validateMqtt(config, credentialsPath) {
  const credentials = await readMqttCredentials(credentialsPath);
  const brokerUrl = normalizeBrokerUrl(config.broker_url, config.porta);
  let client;

  try {
    client = await mqtt.connectAsync(brokerUrl, {
      username: credentials.usuario_mqtt,
      password: credentials.senha_mqtt,
      clientId: `tsea-infrastructure-check-${randomUUID()}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 10_000,
    });
  } catch (error) {
    throw stepError('MQTT', error);
  } finally {
    if (client) {
      await client.endAsync().catch(() => undefined);
    }
  }
}

async function readMqttCredentials(credentialsPath) {
  if (!path.isAbsolute(credentialsPath)) {
    throw new Error('MQTT_CREDENTIALS_FILE_PATH deve ser absoluto.');
  }

  let stats;
  try {
    stats = await lstat(credentialsPath);
  } catch (error) {
    throw stepError('Credenciais MQTT', error);
  }

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error('Arquivo de credenciais MQTT nao e um arquivo regular.');
  }
  if (stats.size > MAX_CREDENTIALS_FILE_SIZE) {
    throw new Error('Arquivo de credenciais MQTT excede 16 KiB.');
  }
  if (
    process.platform !== 'win32' &&
    (stats.mode & PRIVATE_DIRECTORY_MASK) !== 0
  ) {
    throw new Error(
      'Arquivo de credenciais MQTT possui permissoes excessivas.',
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(credentialsPath, 'utf8'));
  } catch (error) {
    throw stepError('Credenciais MQTT', error);
  }

  if (
    parsed?.versao !== 1 ||
    typeof parsed.usuario_mqtt !== 'string' ||
    !parsed.usuario_mqtt.trim() ||
    typeof parsed.senha_mqtt !== 'string' ||
    !parsed.senha_mqtt
  ) {
    throw new Error('Arquivo de credenciais MQTT possui formato invalido.');
  }

  return parsed;
}

function normalizeBrokerUrl(rawBrokerUrl, rawPort) {
  if (typeof rawBrokerUrl !== 'string' || !rawBrokerUrl.trim()) {
    throw new Error('Broker MQTT nao configurado.');
  }

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(rawBrokerUrl)
    ? rawBrokerUrl
    : `mqtt://${rawBrokerUrl}`;
  const url = new URL(candidate);

  if (!['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('Broker MQTT usa protocolo nao permitido.');
  }
  if (url.username || url.password) {
    throw new Error('Broker MQTT nao pode conter credenciais na URL.');
  }
  if (!url.port && Number.isInteger(rawPort) && rawPort > 0) {
    url.port = String(rawPort);
  }

  return url.toString();
}

async function validateSmtp() {
  const port = Number(requiredEnvironment(process.env.MAIL_PORT, 'MAIL_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('MAIL_PORT invalida.');
  }

  const transport = nodemailer.createTransport({
    host: requiredEnvironment(process.env.MAIL_HOST, 'MAIL_HOST'),
    port,
    secure: port === 465,
    auth: {
      user: requiredEnvironment(process.env.MAIL_USER, 'MAIL_USER'),
      pass: requiredEnvironment(process.env.MAIL_PASS, 'MAIL_PASS'),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

  try {
    await transport.verify();
  } catch (error) {
    throw stepError('SMTP', error);
  } finally {
    transport.close();
  }
}

function requiredEnvironment(value, key) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} nao configurada.`);
  }
  return value.trim();
}

function stepError(step, error) {
  const rawMessage =
    error instanceof Error ? error.message : 'falha desconhecida';
  const sensitiveValues = [
    process.env.DATABASE_URL,
    process.env.DIRECT_URL,
    process.env.MONGODB_URI,
    process.env.MAIL_PASS,
  ].filter((value) => typeof value === 'string' && value.length > 0);
  let message = rawMessage;

  for (const value of sensitiveValues) {
    message = message.replaceAll(value, '[REDACTED]');
  }
  message = message.replace(
    /([a-z][a-z\d+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi,
    '$1[REDACTED]@',
  );

  return new Error(`${step}: ${message}`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Falha desconhecida.'}\n`,
  );
  process.exitCode = 1;
});
