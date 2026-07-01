import dotenv from 'dotenv';
import mqtt from 'mqtt';

dotenv.config();
dotenv.config({ path: '.env.mqtt-sim', override: true });

export const TOPICS = {
  alarmes: 'tsea/alarmes',
  acoplamentos: 'tsea/acoplamentos',
  comandos: 'tsea/comandos',
  heartbeat: 'tsea/heartbeat',
  leituras: 'tsea/leituras',
  status: 'tsea/status',
};

let activeClient = null;
let activeConfig = null;
const apiResponseMeta = new WeakMap();

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso() {
  return new Date().toISOString();
}

export function loadConfig() {
  if (activeConfig) {
    return activeConfig;
  }

  activeConfig = {
    mqttUrl: process.env.TSEA_MQTT_URL ?? 'mqtt://localhost:1883',
    mqttUsername: process.env.TSEA_MQTT_USERNAME,
    mqttPassword: process.env.TSEA_MQTT_PASSWORD,
    apiBaseUrl: process.env.TSEA_API_BASE_URL ?? 'http://localhost:3000/api',
    apiLogin: process.env.TSEA_API_LOGIN,
    apiPassword: process.env.TSEA_API_PASSWORD,
    apiToken: process.env.TSEA_API_TOKEN,
    processId: parseOptionalPositiveInt(process.env.TSEA_SIM_PROCESS_ID),
    processName:
      process.env.TSEA_SIM_PROCESS_NAME ??
      'Processo de Vacuo - Reguladores TR-01 a TR-03',
    deviceId: process.env.TSEA_SIM_DEVICE_ID ?? 'esp32-tsea-simulado',
    publishStatus: parseBoolean(process.env.TSEA_SIM_PUBLISH_STATUS, false),
    intervalMs: parsePositiveInt(process.env.TSEA_SIM_INTERVAL_MS, 2500),
    readingIntervalMs: parsePositiveInt(
      process.env.TSEA_SIM_READING_INTERVAL_MS,
      2000,
    ),
    vacuumUnit: process.env.TSEA_SIM_VACUO_UNIDADE ?? 'kPa',
    precheckVacuum: Number(process.env.TSEA_SIM_PRECHECK_VACUO ?? -80),
    ptsIds: parsePositiveIntList(process.env.TSEA_SIM_PTS_IDS),
    acoplamentos: parseAcoplamentos(process.env.TSEA_SIM_ACOPLAMENTOS),
    valveIds: parsePositiveIntList(process.env.TSEA_SIM_VALVULA_IDS),
  };

  if (!activeConfig.mqttUsername || !activeConfig.mqttPassword) {
    throw new Error(
      'Configure TSEA_MQTT_USERNAME e TSEA_MQTT_PASSWORD no .env.mqtt-sim.',
    );
  }

  return activeConfig;
}

export async function connectMqtt() {
  const config = loadConfig();

  const client = mqtt.connect(config.mqttUrl, {
    username: config.mqttUsername,
    password: config.mqttPassword,
    clientId: `${config.deviceId}-${Date.now()}`,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
  });

  client.on('message', (topic, payload) => {
    console.log(`[MQTT COMANDO] ${topic} -> ${payload.toString()}`);
  });

  client.on('error', (error) => {
    console.error(`[MQTT ERRO] ${error.message}`);
  });

  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });

  await new Promise((resolve, reject) => {
    client.subscribe(TOPICS.comandos, { qos: 1 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  activeClient = client;
  console.log(`[MQTT] Conectado em ${config.mqttUrl}`);
  console.log(`[MQTT] Assinando comandos em ${TOPICS.comandos}`);

  return client;
}

export async function publishJson(topic, payload, qos = 0) {
  if (!activeClient) {
    throw new Error('MQTT ainda nao conectado. Chame connectMqtt() antes.');
  }

  const message = JSON.stringify(payload);

  await new Promise((resolve, reject) => {
    activeClient.publish(topic, message, { qos, retain: false }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  console.log(`[MQTT PUB qos=${qos}] ${topic} -> ${message}`);
}

export async function publishHeartbeat(status = 'ONLINE') {
  const config = loadConfig();

  await publishJson(
    TOPICS.heartbeat,
    {
      device_id: config.deviceId,
      status,
      enviado_em: nowIso(),
    },
    0,
  );
}

export async function maybePublishStatus(
  statusGeral = 'OPERACIONAL',
  mensagem = 'ESP32 operacional',
  esp32On = true,
  context = null,
) {
  const config = loadConfig();

  if (!config.publishStatus) {
    console.log(
      '[MQTT STATUS] Desativado por TSEA_SIM_PUBLISH_STATUS=false. Ative true para publicar ACK fisico das valvulas.',
    );
    return;
  }

  const valvulas = context?.valvulas ?? [];
  const valvePayload = buildValveAckPayload(valvulas);

  if (Object.keys(valvePayload).length === 0) {
    throw new Error(
      'TSEA_SIM_PUBLISH_STATUS=true, mas nenhuma valvula foi resolvida para publicar ACK fisico. Configure TSEA_SIM_VALVULA_IDS ou corrija os dados do processo.',
    );
  }

  console.log(
    `[MQTT STATUS] Publicando ACK fisico de valvulas: ${valvulas
      .map((valvula) => valvula.id_valvula)
      .join(',')}.`,
  );

  await publishJson(
    TOPICS.status,
    {
      esp32_on: esp32On,
      status_geral: statusGeral,
      mensagem,
      device_id: config.deviceId,
      sensores_ativos: esp32On ? 3 : 0,
      valvulas: valvePayload,
      tanques: {},
      enviado_em: nowIso(),
    },
    1,
  );
}

export async function publishReading(idPts, valorVacuo) {
  const config = loadConfig();
  assertPositiveId(idPts, 'id_processo_tanque_sensor');

  await publishJson(
    TOPICS.leituras,
    {
      id_processo_tanque_sensor: idPts,
      valor_vacuo: valorVacuo,
      unidade_medida: config.vacuumUnit,
      leitura_em: nowIso(),
    },
    0,
  );
}

export async function publishAcoplamento(
  idSensor,
  idTanque,
  sinalDetectado,
) {
  assertPositiveId(idSensor, 'id_sensor');
  assertPositiveId(idTanque, 'id_tanque');

  await publishJson(
    TOPICS.acoplamentos,
    {
      id_sensor: idSensor,
      id_tanque: idTanque,
      sinal_detectado: sinalDetectado,
      verificado_em: nowIso(),
    },
    1,
  );
}

export async function publishAlarm(payload) {
  await publishJson(
    TOPICS.alarmes,
    {
      ...payload,
      ocorrido_em: payload.ocorrido_em ?? nowIso(),
    },
    1,
  );
}

export async function resolveSimulationContext() {
  const config = loadConfig();

  if (config.acoplamentos.length > 0) {
    try {
      const byDb = await resolveContextFromDatabase(config);
      if (byDb) {
        console.log('[CTX] Acoplamentos informados no .env validados via Prisma.');
        return byDb;
      }
    } catch (error) {
      throw new Error(
        `TSEA_SIM_ACOPLAMENTOS foi informado, mas nao foi possivel validar os pares no banco: ${error.message}`,
      );
    }

    throw new Error(
      'TSEA_SIM_ACOPLAMENTOS foi informado, mas os pares nao pertencem ao processo atual.',
    );
  }

  const byDb = await resolveContextFromDatabase(config).catch((error) => {
    console.warn(`[CTX] Auto-descoberta via Prisma falhou: ${error.message}`);
    return null;
  });

  if (byDb) {
    console.log('[CTX] IDs resolvidos via Prisma.');
    return byDb;
  }

  const byApi = await resolveContextFromApi(config).catch((error) => {
    console.warn(`[CTX] Auto-descoberta via API falhou: ${error.message}`);
    return null;
  });

  if (byApi) {
    console.log('[CTX] IDs resolvidos via API.');
    return byApi;
  }

  throw new Error(
    'Nao foi possivel resolver PTS/acoplamentos/valvulas. Configure TSEA_SIM_PTS_IDS, TSEA_SIM_ACOPLAMENTOS e, se TSEA_SIM_PUBLISH_STATUS=true, TSEA_SIM_VALVULA_IDS no .env.mqtt-sim.',
  );
}

export async function authenticateApiIfNeeded() {
  const config = loadConfig();

  if (config.apiToken) {
    return config.apiToken;
  }

  if (!config.apiLogin || !config.apiPassword) {
    throw new Error(
      'Configure TSEA_API_TOKEN ou TSEA_API_LOGIN/TSEA_API_PASSWORD no .env.mqtt-sim para usar endpoints HTTP.',
    );
  }

  const response = await requestApi({
    operation: 'autenticar na API',
    method: 'POST',
    path: '/auth/signin',
    headers: { 'content-type': 'application/json' },
    body: {
      login: config.apiLogin,
      senha: config.apiPassword,
    },
  });

  const data = await readJsonResponse(response);

  if (!response.ok || !data?.access_token) {
    logHttpResponseError(response, data);
    throw new Error(
      `Falha ao autenticar na API (${response.status}): ${formatApiError(data)}`,
    );
  }

  config.apiToken = data.access_token;
  return config.apiToken;
}

export async function startProcessIfRequested(context) {
  const processInfo = await getProcessStatus(context.id_processo);

  if (processInfo.status_processo === 'EM_EXECUCAO') {
    console.log('[HTTP] Processo ja esta EM_EXECUCAO; simulacao continua.');
    return;
  }

  if (processInfo.status_processo !== 'CONFIGURADO') {
    throw new Error(
      `Processo ${context.id_processo} esta ${processInfo.status_processo}; esperado CONFIGURADO ou EM_EXECUCAO.`,
    );
  }

  const token = await authenticateApiIfNeeded();
  const config = loadConfig();
  const response = await requestApi({
    operation: `iniciar processo ${context.id_processo}`,
    method: 'POST',
    path: `/processos/${context.id_processo}/iniciar`,
    token,
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    logHttpResponseError(response, data);
    throw new Error(
      `Falha ao iniciar processo (${response.status}): ${formatApiError(data)}`,
    );
  }

  console.log(`[HTTP] Processo ${context.id_processo} iniciado.`);
}

export async function finalizeProcessIfEndpointExists(context) {
  const token = await authenticateApiIfNeeded();
  const config = loadConfig();
  const response = await requestApi({
    operation: `finalizar processo ${context.id_processo}`,
    method: 'POST',
    path: `/processos/${context.id_processo}/finalizar`,
    token,
    body: {
      observacao: 'Processo finalizado pela simulacao MQTT de sucesso.',
    },
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    logHttpResponseError(response, data);
    console.warn(
      `[HTTP] Nao foi possivel finalizar automaticamente (${response.status}): ${formatApiError(data)}`,
    );
    console.warn(
      'Nao foi encontrado endpoint HTTP seguro para finalizar processo automaticamente. Simulacao MQTT concluida.',
    );
    return;
  }

  console.log(`[HTTP] Processo ${context.id_processo} finalizado.`);
}

export async function interruptProcessIfEndpointExists(context) {
  const token = await authenticateApiIfNeeded();
  const config = loadConfig();
  const response = await requestApi({
    operation: `interromper processo ${context.id_processo}`,
    method: 'POST',
    path: `/processos/${context.id_processo}/interromper`,
    token,
    body: {
      motivo: 'Mangueira desacoplada durante simulacao MQTT.',
      observacao: 'Falha critica simulada pelo ESP32.',
    },
  });

  const data = await readJsonResponse(response);

  if (!response.ok) {
    logHttpResponseError(response, data);
    console.warn(
      `[HTTP] Nao foi possivel interromper automaticamente (${response.status}): ${formatApiError(data)}`,
    );
    console.warn(
      'Nao foi encontrado endpoint HTTP seguro para interromper processo automaticamente. Falha simulada via MQTT.',
    );
    return;
  }

  console.log(`[HTTP] Processo ${context.id_processo} interrompido.`);
}

export function closeMqtt() {
  if (!activeClient) {
    return;
  }

  activeClient.end(true);
  activeClient = null;
  console.log('[MQTT] Conexao encerrada.');
}

function buildValveAckPayload(valvulas) {
  return Object.fromEntries(
    valvulas.map((valvula) => [
      String(valvula.id_valvula),
      {
        id_valvula: valvula.id_valvula,
        status_valvula: 'FECHADA',
        ack: true,
        falha: false,
      },
    ]),
  );
}

export async function logAcoplamentoDiagnostics(context) {
  if (!process.env.DATABASE_URL) {
    console.log('[DIAG] DATABASE_URL ausente; diagnostico Prisma ignorado.');
    return;
  }

  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const ids = context.acoplamentos.map((item) => item.id_sensor);
    const rows = await prisma.sensoresacoplamentomangueiras.findMany({
      where: { id_sensor: { in: ids } },
      select: {
        id_sensor: true,
        id_tanque: true,
        status_acoplamento: true,
        sinal_detectado: true,
        ultima_verificacao: true,
        ativo: true,
      },
      orderBy: { id_tanque: 'asc' },
    });

    console.log('[DIAG] Estado atual dos acoplamentos no banco:');
    for (const row of rows) {
      console.log(
        `[DIAG] id_sensor=${row.id_sensor}; id_tanque=${row.id_tanque}; status=${row.status_acoplamento}; sinal=${row.sinal_detectado}; ultima_verificacao=${row.ultima_verificacao?.toISOString() ?? 'null'}; ativo=${row.ativo}`,
      );
    }
  } catch (error) {
    console.warn(`[DIAG] Falha ao ler acoplamentos via Prisma: ${error.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function resolveContextFromDatabase(config) {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const processo = await prisma.processos.findFirst({
      where: config.processId
        ? { id_processo: config.processId }
        : { nome_processo: config.processName },
      select: {
        id_processo: true,
        processostanques: {
          select: {
            id_processo_tanque: true,
            id_tanque: true,
            tanques: {
              select: {
                nome: true,
              },
            },
            processostanquessensores: {
              where: {
                ativo: true,
                removido_em: null,
                tipo_sensor_processo: 'VACUO',
              },
              select: { id_processo_tanque_sensor: true },
              orderBy: { id_processo_tanque_sensor: 'asc' },
            },
          },
          orderBy: { id_processo_tanque: 'asc' },
        },
      },
    });

    if (!processo) {
      return null;
    }

    const processTanks = processo.processostanques.map((processTank) => ({
      id_processo_tanque: processTank.id_processo_tanque,
      id_tanque: processTank.id_tanque,
      nome_tanque: processTank.tanques.nome,
    }));

    const ptsIds =
      config.ptsIds.length > 0
        ? validateEnvPtsIds(processo, config.ptsIds)
        : processo.processostanques.flatMap((processTank) =>
            processTank.processostanquessensores.map(
              (sensor) => sensor.id_processo_tanque_sensor,
            ),
          );

    const acoplamentos =
      config.acoplamentos.length > 0
        ? await validateEnvAcoplamentos(prisma, processTanks, config.acoplamentos)
        : await discoverAcoplamentosByProcessTanks(prisma, processTanks);
    const valvulas =
      config.valveIds.length > 0
        ? await validateEnvValvulas(prisma, processTanks, config.valveIds)
        : await discoverValvulasByProcessTanks(prisma, processTanks);

    return validateResolvedContext({
      id_processo: processo.id_processo,
      ptsIds,
      acoplamentos,
      valvulas,
      tanques: processTanks,
      acoplamentos_source:
        config.acoplamentos.length > 0 ? '.env validado por Prisma' : 'Prisma',
    }, { requireValvulas: config.publishStatus });
  } finally {
    await prisma.$disconnect();
  }
}

async function validateEnvValvulas(prisma, processTanks, valveIds) {
  const processTankIds = new Set(processTanks.map((tank) => tank.id_tanque));
  const rows = await prisma.valvulas.findMany({
    where: {
      id_valvula: { in: valveIds },
    },
    select: {
      id_valvula: true,
      id_tanque: true,
      nome_valvula: true,
      ativo: true,
    },
    orderBy: { id_valvula: 'asc' },
  });

  for (const idValvula of valveIds) {
    const row = rows.find((item) => item.id_valvula === idValvula);

    if (!row) {
      throw new Error(`Valvula ${idValvula} nao encontrada.`);
    }

    if (!row.ativo) {
      throw new Error(`Valvula ${idValvula} esta inativa.`);
    }

    if (!row.id_tanque || !processTankIds.has(row.id_tanque)) {
      throw new Error(
        `Valvula ${idValvula} nao pertence aos tanques do processo atual.`,
      );
    }
  }

  return rows.map((row) => ({
    id_valvula: row.id_valvula,
    id_tanque: row.id_tanque,
    nome_valvula: row.nome_valvula,
  }));
}

async function discoverValvulasByProcessTanks(prisma, processTanks) {
  const rows = await prisma.valvulas.findMany({
    where: {
      id_tanque: { in: processTanks.map((tank) => tank.id_tanque) },
      ativo: true,
    },
    select: {
      id_valvula: true,
      id_tanque: true,
      nome_valvula: true,
    },
    orderBy: { id_valvula: 'asc' },
  });

  return rows.map((row) => ({
    id_valvula: row.id_valvula,
    id_tanque: row.id_tanque,
    nome_valvula: row.nome_valvula,
  }));
}

function validateEnvPtsIds(processo, ptsIds) {
  const allowedPtsIds = new Set(
    processo.processostanques.flatMap((processTank) =>
      processTank.processostanquessensores.map(
        (sensor) => sensor.id_processo_tanque_sensor,
      ),
    ),
  );

  const invalid = ptsIds.filter((idPts) => !allowedPtsIds.has(idPts));
  if (invalid.length > 0) {
    throw new Error(
      `TSEA_SIM_PTS_IDS contem IDs que nao pertencem ao processo: ${invalid.join(',')}.`,
    );
  }

  return ptsIds;
}

async function validateEnvAcoplamentos(prisma, processTanks, acoplamentos) {
  const processTankIds = new Set(processTanks.map((tank) => tank.id_tanque));
  const uniquePairs = uniqueAcoplamentos(acoplamentos);

  for (const pair of uniquePairs) {
    if (!processTankIds.has(pair.id_tanque)) {
      throw new Error(
        `Acoplamento ${pair.id_sensor}:${pair.id_tanque} aponta para tanque que nao pertence ao processo atual.`,
      );
    }
  }

  const rows = await prisma.sensoresacoplamentomangueiras.findMany({
    where: {
      id_sensor: { in: uniquePairs.map((item) => item.id_sensor) },
    },
    select: {
      id_sensor: true,
      id_tanque: true,
      ativo: true,
    },
    orderBy: { id_tanque: 'asc' },
  });

  for (const pair of uniquePairs) {
    const row = rows.find((item) => item.id_sensor === pair.id_sensor);

    if (!row) {
      throw new Error(
        `Sensor ${pair.id_sensor} nao existe em sensoresacoplamentomangueiras.`,
      );
    }

    if (!row.ativo) {
      throw new Error(`Sensor de acoplamento ${pair.id_sensor} esta inativo.`);
    }

    if (row.id_tanque !== pair.id_tanque) {
      throw new Error(
        `Sensor de acoplamento ${pair.id_sensor} pertence ao tanque ${row.id_tanque}, mas o .env informou tanque ${pair.id_tanque}.`,
      );
    }
  }

  assertAllProcessTanksHaveAcoplamento(processTanks, uniquePairs);
  return sortAcoplamentosByProcessTanks(processTanks, uniquePairs);
}

async function discoverAcoplamentosByProcessTanks(prisma, processTanks) {
  const rows = await prisma.sensoresacoplamentomangueiras.findMany({
    where: {
      id_tanque: { in: processTanks.map((tank) => tank.id_tanque) },
      ativo: true,
    },
    select: {
      id_sensor: true,
      id_tanque: true,
      ativo: true,
    },
    orderBy: { id_tanque: 'asc' },
  });

  assertAllProcessTanksHaveAcoplamento(processTanks, rows);
  return sortAcoplamentosByProcessTanks(processTanks, rows);
}

function assertAllProcessTanksHaveAcoplamento(processTanks, acoplamentos) {
  const tanksWithAcoplamento = new Set(
    acoplamentos.map((item) => item.id_tanque),
  );
  const missing = processTanks.filter(
    (tank) => !tanksWithAcoplamento.has(tank.id_tanque),
  );

  if (missing.length > 0) {
    throw new Error(
      missing
        .map(
          (tank) =>
            `Tanque ${tank.id_tanque} (${tank.nome_tanque}) nao possui sensor de acoplamento ativo cadastrado.`,
        )
        .join(' '),
    );
  }
}

function sortAcoplamentosByProcessTanks(processTanks, acoplamentos) {
  return processTanks.map((tank) => {
    const acoplamento = acoplamentos.find(
      (item) => item.id_tanque === tank.id_tanque,
    );

    return {
      id_sensor: acoplamento.id_sensor,
      id_tanque: tank.id_tanque,
      nome_tanque: tank.nome_tanque,
    };
  });
}

async function resolveContextFromApi(config) {
  const token = await authenticateApiIfNeeded();
  const processo = config.processId
    ? await apiGet(`/processos/${config.processId}`, token)
    : await findProcessByNameFromApi(config, token);

  const idProcesso = Number(processo?.id_processo);
  if (!Number.isInteger(idProcesso) || idProcesso <= 0) {
    return null;
  }

  const ptsIds = extractPtsIds(processo);
  const acoplamentos = extractAcoplamentos(processo);
  const valvulas = extractValvulas(processo);

  return validateResolvedContext({
    id_processo: idProcesso,
    ptsIds,
    acoplamentos,
    valvulas,
    tanques: extractProcessTanks(processo),
    acoplamentos_source: 'API',
  }, { requireValvulas: config.publishStatus });
}

async function findProcessByNameFromApi(config, token) {
  const list = await apiGet('/processos', token);
  const processos = Array.isArray(list) ? list : (list?.items ?? list?.data);

  if (!Array.isArray(processos)) {
    return null;
  }

  const match = processos.find(
    (processo) => processo?.nome_processo === config.processName,
  );

  if (!match?.id_processo) {
    return null;
  }

  return apiGet(`/processos/${match.id_processo}`, token);
}

async function getProcessStatus(idProcesso) {
  const token = await authenticateApiIfNeeded();
  return apiGet(`/processos/${idProcesso}`, token);
}

async function apiGet(path, token) {
  const response = await requestApi({
    operation: `consultar ${path}`,
    method: 'GET',
    path,
    token,
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    logHttpResponseError(response, data);
    throw new Error(
      `GET ${path} falhou (${response.status}): ${formatApiError(data)}`,
    );
  }

  return data;
}

async function requestApi({
  operation,
  method = 'GET',
  path,
  token,
  headers = {},
  body,
}) {
  const config = loadConfig();
  const fullUrl = buildApiUrl(config.apiBaseUrl, path);
  const requestHeaders = token
    ? { ...authHeaders(token), ...headers }
    : { ...headers };
  const requestOptions = {
    method,
    headers: requestHeaders,
  };

  if (body !== undefined) {
    requestOptions.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(fullUrl, requestOptions);
    apiResponseMeta.set(response, { method, fullUrl, operation });
    return response;
  } catch (error) {
    logFetchError({
      operation,
      method,
      fullUrl,
      error,
    });

    throw new Error(
      `Falha HTTP ao ${operation}: ${method} ${fullUrl} (${error.message})`,
    );
  }
}

function buildApiUrl(baseUrl, path) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function logFetchError({ operation, method, fullUrl, error }) {
  const cause = error.cause;

  console.error(`[HTTP ERRO] Operacao: ${operation}`);
  console.error(`[HTTP ERRO] ${method} ${fullUrl}`);
  console.error(
    `[HTTP ERRO] name=${error.name} message=${error.message} cause=${cause?.code ?? 'n/a'} errno=${cause?.errno ?? 'n/a'} address=${cause?.address ?? 'n/a'} port=${cause?.port ?? 'n/a'}`,
  );
}

function logHttpResponseError(response, data) {
  const meta = apiResponseMeta.get(response);
  const method = meta?.method ?? 'HTTP';
  const url = meta?.fullUrl ?? response.url ?? 'endpoint desconhecido';

  console.error(`[HTTP ${response.status}] ${method} ${url}`);
  console.error(`[HTTP ${response.status}] statusText=${response.statusText}`);
  console.error(`Body: ${formatResponseBodyForLog(data)}`);
}

function formatResponseBodyForLog(data) {
  if (data === null || data === undefined || data === '') {
    return 'sem corpo de resposta';
  }

  if (typeof data === 'string') {
    return data;
  }

  return JSON.stringify(data);
}

function extractPtsIds(processo) {
  const processTanks =
    processo?.processostanques ?? processo?.tanques ?? processo?.processo_tanques;

  if (!Array.isArray(processTanks)) {
    return [];
  }

  return uniquePositiveInts(
    processTanks.flatMap((processTank) => {
      const sensors =
        processTank?.processostanquessensores ??
        processTank?.sensores ??
        processTank?.processo_tanque_sensores;

      if (!Array.isArray(sensors)) {
        return [];
      }

      return sensors.map((sensor) => sensor?.id_processo_tanque_sensor);
    }),
  );
}

function extractAcoplamentos(processo) {
  const processTanks =
    processo?.processostanques ?? processo?.tanques ?? processo?.processo_tanques;

  if (!Array.isArray(processTanks)) {
    return [];
  }

  return processTanks
    .map((processTank) => {
      const idTanque =
        processTank?.id_tanque ?? processTank?.tanque?.id_tanque ?? null;
      const acoplamento =
        processTank?.acoplamento ??
        processTank?.sensoresacoplamentomangueiras ??
        processTank?.tanque?.sensoresacoplamentomangueiras;
      const idSensor =
        acoplamento?.id_sensor ?? processTank?.id_sensor_acoplamento ?? null;

      if (!isPositiveInt(idSensor) || !isPositiveInt(idTanque)) {
        return null;
      }

      return { id_sensor: idSensor, id_tanque: idTanque };
    })
    .filter(Boolean);
}

function extractValvulas(processo) {
  const processTanks =
    processo?.processostanques ?? processo?.tanques ?? processo?.processo_tanques;
  const directValves = processo?.valvulas;

  if (Array.isArray(directValves)) {
    return directValves
      .map(mapValveFromApi)
      .filter((item) => item && isPositiveInt(item.id_valvula));
  }

  if (!Array.isArray(processTanks)) {
    return [];
  }

  return processTanks
    .flatMap((processTank) => processTank?.valvulas ?? [])
    .map(mapValveFromApi)
    .filter((item) => item && isPositiveInt(item.id_valvula));
}

function mapValveFromApi(value) {
  if (!value) {
    return null;
  }

  const idValvula = Number(value.id_valvula);
  if (!isPositiveInt(idValvula)) {
    return null;
  }

  return {
    id_valvula: idValvula,
    id_tanque: value.id_tanque ?? null,
    nome_valvula: value.nome_valvula ?? `Valvula ${idValvula}`,
  };
}

function extractProcessTanks(processo) {
  const processTanks =
    processo?.processostanques ?? processo?.tanques ?? processo?.processo_tanques;

  if (!Array.isArray(processTanks)) {
    return [];
  }

  return processTanks
    .map((processTank) => {
      const idTanque =
        processTank?.id_tanque ?? processTank?.tanque?.id_tanque ?? null;

      if (!isPositiveInt(idTanque)) {
        return null;
      }

      return {
        id_tanque: idTanque,
        nome_tanque:
          processTank?.nome_tanque ??
          processTank?.tanque?.nome ??
          processTank?.tanques?.nome ??
          `Tanque ${idTanque}`,
      };
    })
    .filter(Boolean);
}

function validateResolvedContext(context, options = {}) {
  const ptsIds = uniquePositiveInts(context.ptsIds);
  const acoplamentos = uniqueAcoplamentos(
    context.acoplamentos.filter(
      (item) => isPositiveInt(item.id_sensor) && isPositiveInt(item.id_tanque),
    ),
  );
  const valvulas = uniqueValvulas(
    (context.valvulas ?? []).filter((item) =>
      isPositiveInt(item.id_valvula),
    ),
  );
  const tanques = Array.isArray(context.tanques) ? context.tanques : [];

  if (!isPositiveInt(context.id_processo)) {
    return null;
  }

  if (ptsIds.length === 0 || acoplamentos.length === 0) {
    return null;
  }

  if (options.requireValvulas && valvulas.length === 0) {
    throw new Error(
      'Nao foi possivel resolver valvulas do processo. TSEA_SIM_PUBLISH_STATUS=true exige valvulas reais; configure TSEA_SIM_VALVULA_IDS ou corrija o vinculo das valvulas aos tanques do processo.',
    );
  }

  return {
    id_processo: context.id_processo,
    ptsIds,
    acoplamentos,
    valvulas,
    tanques,
    acoplamentos_source: context.acoplamentos_source ?? 'desconhecida',
  };
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatApiError(data) {
  if (!data) {
    return 'sem corpo de resposta';
  }

  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data.message)) {
    return data.message.join('; ');
  }

  return data.message ?? JSON.stringify(data);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  return ['1', 'true', 'sim', 'yes', 'on'].includes(value.toLowerCase());
}

function parseOptionalPositiveInt(value) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return isPositiveInt(parsed) ? parsed : null;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return isPositiveInt(parsed) ? parsed : fallback;
}

function parsePositiveIntList(value) {
  if (!value) {
    return [];
  }

  return uniquePositiveInts(
    value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter(isPositiveInt),
  );
}

function parseAcoplamentos(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => {
      const [sensor, tanque] = item.split(':').map((part) => Number(part));
      if (!isPositiveInt(sensor) || !isPositiveInt(tanque)) {
        return null;
      }

      return {
        id_sensor: sensor,
        id_tanque: tanque,
      };
    })
    .filter(Boolean);
}

function uniqueAcoplamentos(values) {
  const seen = new Set();
  return values.filter((item) => {
    const key = `${item.id_sensor}:${item.id_tanque}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function uniqueValvulas(values) {
  const seen = new Set();
  return values.filter((item) => {
    if (seen.has(item.id_valvula)) {
      return false;
    }

    seen.add(item.id_valvula);
    return true;
  });
}

function uniquePositiveInts(values) {
  return [...new Set(values.filter(isPositiveInt))];
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function assertPositiveId(value, label) {
  if (!isPositiveInt(value)) {
    throw new Error(`${label} precisa ser inteiro maior que zero.`);
  }
}
