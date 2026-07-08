require('dotenv/config');
require('dotenv').config({ path: '.env.mqtt-sim', override: true });

const mqtt = require('mqtt');

const DEVICE_ID = process.env.TSEA_SIM_DEVICE_ID ?? 'ESP32_SIMULADOR';
const FIRMWARE_VERSION = 'tsea-esp32-sim-1.0.0';
const STARTED_AT = Date.now();

const TOPICS = {
  config: 'tsea/config',
  comandos: 'tsea/comandos',
  acks: 'tsea/acks',
  leituras: 'tsea/leituras',
  status: 'tsea/status',
  heartbeat: 'tsea/heartbeat',
  acoplamentos: 'tsea/acoplamentos',
};

const ACK_COMMANDS = new Set([
  'INICIAR_PROCESSO_VACUO',
  'PARAR_PROCESSO',
  'PARADA_EMERGENCIA',
  'LIGAR_BOMBA',
  'DESLIGAR_BOMBA',
  'ABRIR_VALVULA',
  'FECHAR_VALVULA',
  'DESLIGAR_TODAS_BOMBAS',
  'ABRIR_TODAS_VALVULAS',
  'FECHAR_TODAS_VALVULAS',
  'SINCRONIZAR_HARDWARE',
  'REINICIAR_COMUNICACAO',
]);

const state = {
  client: null,
  activeProcess: null,
  currentVacuumByPts: new Map(),
  acoplamentoByCode: new Map(),
  acoplamentoByTank: new Map(),
  vacuoSensorByCode: new Map(),
  diagnosticVacuumByCode: new Map(),
  valvulaByCode: new Map(),
  valvulaById: new Map(),
  bombaById: new Map(),
  openValveCodes: new Set(),
  pumpOnCodes: new Set(),
  emergencyActive: false,
  timers: [],
};

if (process.argv.includes('--check')) {
  printStartupConfig();
  console.log('[SIM] Check OK. Use npm run simulate:esp32 para iniciar.');
  process.exit(0);
}

main().catch((error) => {
  console.error(`[SIM ERRO] ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const config = loadConfig();
  printStartupConfig();

  const client = mqtt.connect(config.url, {
    username: config.username,
    password: config.password,
    clientId: `${DEVICE_ID}-${Date.now()}`,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
  });

  state.client = client;

  client.on('connect', async () => {
    console.log('ESP32 MQTT Simulator conectado');
    await subscribeRequiredTopics(client);
    startPeriodicPublishers();
  });

  client.on('message', (topic, payload) => {
    void handleMessage(topic, payload);
  });

  client.on('reconnect', () => {
    console.log('[SIM MQTT] Reconectando ao broker...');
  });

  client.on('error', (error) => {
    console.error(`[SIM MQTT ERRO] ${error.message}`);
  });

  client.on('close', () => {
    console.log('[SIM MQTT] Conexao encerrada.');
  });

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
}

function loadConfig() {
  return {
    url: process.env.TSEA_MQTT_URL ?? process.env.MQTT_URL ?? 'mqtt://localhost:1883',
    username: process.env.TSEA_MQTT_USERNAME ?? process.env.MQTT_USERNAME,
    password: process.env.TSEA_MQTT_PASSWORD ?? process.env.MQTT_PASSWORD,
  };
}

function printStartupConfig() {
  const config = loadConfig();

  console.log('[SIM] Configuracao:');
  console.log(`- broker: ${config.url}`);
  console.log(`- usuario: ${config.username ? 'informado' : 'nao informado'}`);
  console.log(`- senha: ${config.password ? 'informada' : 'nao informada'}`);
}

async function subscribeRequiredTopics(client) {
  await subscribe(client, TOPICS.config, 1);
  await subscribe(client, TOPICS.comandos, 1);

  console.log('Topicos assinados:');
  console.log(`- ${TOPICS.config}`);
  console.log(`- ${TOPICS.comandos}`);
}

function subscribe(client, topic, qos) {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, { qos }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function handleMessage(topic, rawPayload) {
  const raw = rawPayload.toString('utf8');
  console.log(`\n[SIM MQTT RX] ${topic}`);
  console.log(raw);

  const parsed = parseJson(raw);

  if (!parsed.ok) {
    console.error(`[SIM MQTT RX ERRO] ${parsed.error}`);
    return;
  }

  if (topic === TOPICS.config) {
    await handleSyncConfig(parsed.value);
    return;
  }

  if (topic === TOPICS.comandos) {
    await handleCommand(parsed.value);
    return;
  }

  console.log(`[SIM MQTT] Topico ignorado: ${topic}`);
}

async function handleSyncConfig(payload) {
  console.log('[SIM CONFIG] Payload recebido:');
  console.log(JSON.stringify(payload, null, 2));

  const missing = requiredFields(payload, [
    'tipo',
    'schema_version',
    'correlation_id',
    'sistema',
    'hardware',
    'mqtt',
  ]);

  ingestSyncConfig(payload);

  if (missing.length > 0) {
    await publishAck({
      correlationId: payload.correlation_id,
      comando: 'SINCRONIZAR_HARDWARE',
      status: 'ERRO',
      mensagem: `SYNC_CONFIG invalido. Campos ausentes: ${missing.join(', ')}`,
      erro: 'PAYLOAD_INVALIDO',
    });
    return;
  }

  await publishAck({
    correlationId: payload.correlation_id,
    comando: 'SINCRONIZAR_HARDWARE',
    status: 'EXECUTADO',
    mensagem: 'Configuracao sincronizada pelo simulador ESP32.',
  });
}

async function handleCommand(payload) {
  console.log('[SIM COMANDO] Payload recebido:');
  console.log(JSON.stringify(payload, null, 2));

  const correlationId = payload.correlation_id;
  const comando = resolveCommandName(payload);

  if (!correlationId) {
    console.error('[SIM COMANDO ERRO] correlation_id ausente.');
    await publishAck({
      correlationId: `sim-error-${Date.now()}`,
      comando,
      status: 'ERRO',
      mensagem: 'correlation_id ausente no comando recebido.',
      erro: 'CORRELATION_ID_AUSENTE',
    });
    return;
  }

  if (comando === 'INICIAR_PROCESSO_VACUO') {
    await handleStartVacuumProcess(payload, correlationId);
    return;
  }

  if (comando === 'PARAR_PROCESSO' || comando === 'PARADA_EMERGENCIA') {
    await stopActiveProcess(comando, correlationId);
    return;
  }

  const commandResult = applyGenericCommand(comando, payload);

  if (!commandResult.ok) {
    await publishAck({
      correlationId,
      comando,
      status: 'ERRO',
      mensagem: commandResult.error,
      erro: commandResult.code,
    });
    return;
  }

  await publishAck({
    correlationId,
    comando,
    status: 'EXECUTADO',
    mensagem: `Comando ${comando} executado pelo simulador ESP32.`,
  });
}

async function handleStartVacuumProcess(payload, correlationId) {
  const validation = validateStartPayload(payload);

  if (!validation.ok) {
    await publishAck({
      correlationId,
      comando: 'INICIAR_PROCESSO_VACUO',
      status: 'ERRO',
      mensagem: `INICIAR_PROCESSO_VACUO invalido. ${validation.error}`,
      erro: 'PAYLOAD_INVALIDO',
    });
    return;
  }

  const activeTanks = payload.tanques.map((tank) => ({
    id_tanque: tank.id_tanque,
    codigo_hardware: tank.codigo_hardware,
    id_processo_tanque: tank.id_processo_tanque,
    id_processo_tanque_sensor: tank.id_processo_tanque_sensor,
    sensor_vacuo_codigo: tank.sensor_vacuo.codigo_hardware,
    sensor_acoplamento: tank.sensor_acoplamento,
    valvulas: tank.valvulas,
    vacuo_alvo: tank.vacuo_alvo,
    unidade: tank.unidade,
  }));

  state.activeProcess = {
    id_processo: payload.id_processo,
    vacuo_alvo: payload.vacuo_alvo,
    unidade: payload.unidade,
    bomba: payload.bomba,
    tanques: activeTanks,
  };
  state.pumpOnCodes.add(payload.bomba.codigo_hardware);
  state.emergencyActive = false;
  state.openValveCodes.clear();

  for (const tank of activeTanks) {
    state.currentVacuumByPts.set(tank.id_processo_tanque_sensor, 0);
    for (const valve of tank.valvulas) {
      state.openValveCodes.add(valve.codigo_hardware);
      rememberValveFromStart(valve);
    }
    rememberAcoplamentoFromStart(tank);
  }

  await publishAck({
    correlationId,
    comando: 'INICIAR_PROCESSO_VACUO',
    status: 'EXECUTADO',
    idProcesso: payload.id_processo,
    mensagem: 'Processo de vacuo iniciado pelo simulador ESP32.',
  });

  console.log(
    `[SIM PROCESSO] Processo ativo iniciado: ${payload.id_processo}. Tanques: ${activeTanks.length}.`,
  );
}

async function stopActiveProcess(comando, correlationId) {
  state.activeProcess = null;
  state.currentVacuumByPts.clear();
  state.openValveCodes.clear();
  state.pumpOnCodes.clear();
  state.emergencyActive = comando === 'PARADA_EMERGENCIA';

  await publishAck({
    correlationId,
    comando,
    status: 'EXECUTADO',
    mensagem: `${comando} executado pelo simulador ESP32.`,
  });

  console.log(`[SIM PROCESSO] ${comando} executado. Leituras interrompidas.`);

  if (state.emergencyActive) {
    await publishStatus();
    state.emergencyActive = false;
  }
}

function applyGenericCommand(comando, payload) {
  if (comando === 'LIGAR_BOMBA') {
    const bomba = resolveCommandPump(payload);
    if (!bomba) {
      return {
        ok: false,
        code: 'BOMBA_DESCONHECIDA',
        error: 'Bomba desconhecida ou ausente no comando.',
      };
    }
    state.pumpOnCodes.add(bomba.codigo_hardware);
  }

  if (comando === 'DESLIGAR_BOMBA') {
    const bomba = resolveCommandPump(payload);
    if (!bomba) {
      return {
        ok: false,
        code: 'BOMBA_DESCONHECIDA',
        error: 'Bomba desconhecida ou ausente no comando.',
      };
    }
    state.pumpOnCodes.delete(bomba.codigo_hardware);
    clearActiveProcessReadings(
      `${comando} recebido. Leituras fake interrompidas pelo simulador.`,
    );
  }

  if (comando === 'DESLIGAR_TODAS_BOMBAS') {
    state.pumpOnCodes.clear();
    clearActiveProcessReadings(
      `${comando} recebido. Leituras fake interrompidas pelo simulador.`,
    );
  }

  if (comando === 'ABRIR_VALVULA') {
    const valve = resolveCommandValve(payload);
    if (!valve) {
      return {
        ok: false,
        code: 'VALVULA_DESCONHECIDA',
        error: 'Valvula desconhecida ou ausente no comando.',
      };
    }
    state.openValveCodes.add(valve.codigo_hardware);
  }

  if (comando === 'FECHAR_VALVULA') {
    const valve = resolveCommandValve(payload);
    if (!valve) {
      return {
        ok: false,
        code: 'VALVULA_DESCONHECIDA',
        error: 'Valvula desconhecida ou ausente no comando.',
      };
    }
    state.openValveCodes.delete(valve.codigo_hardware);
  }

  if (comando === 'ABRIR_TODAS_VALVULAS') {
    for (const valve of state.valvulaByCode.values()) {
      state.openValveCodes.add(valve.codigo_hardware);
    }
  }

  if (comando === 'FECHAR_TODAS_VALVULAS') {
    state.openValveCodes.clear();
  }

  return { ok: true };
}

function clearActiveProcessReadings(reason) {
  if (!state.activeProcess) {
    return;
  }

  state.activeProcess = null;
  state.currentVacuumByPts.clear();
  console.log(`[SIM PROCESSO] ${reason}`);
}

function validateStartPayload(payload) {
  const missing = requiredFields(payload, [
    'id_processo',
    'tanques',
    'bomba',
    'vacuo_alvo',
    'limite_seguranca_vacuo',
    'tolerancia_vacuo_percentual',
    'unidade',
  ]);

  if (missing.length > 0) {
    return { ok: false, error: `Campos ausentes: ${missing.join(', ')}` };
  }

  if (!Array.isArray(payload.tanques) || payload.tanques.length === 0) {
    return { ok: false, error: 'tanques precisa ter pelo menos um tanque.' };
  }

  for (const [index, tank] of payload.tanques.entries()) {
    const tankMissing = requiredFields(tank, [
      'id_tanque',
      'codigo_hardware',
      'id_processo_tanque',
      'id_processo_tanque_sensor',
      'sensor_vacuo',
      'sensor_acoplamento',
      'valvulas',
      'vacuo_alvo',
      'unidade',
    ]);

    if (tankMissing.length > 0) {
      return {
        ok: false,
        error: `tanques[${index}] campos ausentes: ${tankMissing.join(', ')}`,
      };
    }

    if (!Array.isArray(tank.valvulas) || tank.valvulas.length === 0) {
      return {
        ok: false,
        error: `tanques[${index}].valvulas precisa ter ao menos uma valvula.`,
      };
    }
  }

  return { ok: true };
}

function startPeriodicPublishers() {
  if (state.timers.length > 0) {
    return;
  }

  state.timers.push(setInterval(() => void publishHeartbeat(), 3000));
  state.timers.push(setInterval(() => void publishStatus(), 5000));
  state.timers.push(setInterval(() => void publishAcoplamentos(), 5000));
  state.timers.push(setInterval(() => void publishDiagnosticReadings(), 2000));
  state.timers.push(setInterval(() => void publishReadings(), 1000));
}

async function publishHeartbeat() {
  await publishJson(TOPICS.heartbeat, {
    device_id: DEVICE_ID,
    device: DEVICE_ID,
    device_is: DEVICE_ID,
    status: 'ONLINE',
    enviado_em: nowIso(),
  }, 0);
  console.log('[SIM HEARTBEAT] Publicado.');
}

async function publishStatus() {
  await publishJson(TOPICS.status, {
    esp32_on: true,
    tipo: 'HARDWARE_STATUS',
    schema_version: 1,
    device_id: DEVICE_ID,
    device: DEVICE_ID,
    firmware_version: FIRMWARE_VERSION,
    status_geral: state.emergencyActive ? 'FALHA' : 'OPERACIONAL',
    emergencia_ativa: state.emergencyActive,
    erro_atual: state.emergencyActive ? 'PARADA_EMERGENCIA' : null,
    bombas: buildBombasStatus(),
    acoplamentos: buildAcoplamentosStatus(),
    enviado_em: nowIso(),
    ...buildLegacyValveStatusField(),
  }, 1);
  console.log('[SIM STATUS] Publicado.');
}

async function publishAcoplamentos() {
  const acoplamentos = [...state.acoplamentoByCode.values()];

  if (acoplamentos.length === 0) {
    console.log(
      '[SIM ACOPLAMENTO] Aguardando SYNC_CONFIG ou INICIAR_PROCESSO_VACUO para obter id_sensor.',
    );
    return;
  }

  for (const acoplamento of acoplamentos) {
    await publishJson(TOPICS.acoplamentos, {
      id_sensor: acoplamento.id_sensor,
      id_tanque: acoplamento.id_tanque,
      codigo_hardware: acoplamento.codigo_hardware,
      sinal_detectado: true,
      verificado_em: nowIso(),
    }, 1);
    console.log(
      `[SIM ACOPLAMENTO] Publicado ${acoplamento.codigo_hardware} tanque ${acoplamento.id_tanque}.`,
    );
  }
}

async function publishReadings() {
  if (!state.activeProcess) {
    return;
  }

  for (const tank of state.activeProcess.tanques) {
    const previous =
      state.currentVacuumByPts.get(tank.id_processo_tanque_sensor) ?? 0;
    const target = Number(tank.vacuo_alvo);
    const next = nextVacuumValue(previous, target);

    state.currentVacuumByPts.set(tank.id_processo_tanque_sensor, next);

    await publishJson(TOPICS.leituras, {
      id_processo_tanque_sensor: tank.id_processo_tanque_sensor,
      codigo_hardware: tank.sensor_vacuo_codigo,
      valor_vacuo: next,
      unidade_medida: tank.unidade,
      leitura_em: nowIso(),
    }, 0);
    console.log(
      `[SIM LEITURA] PTS ${tank.id_processo_tanque_sensor}: ${next} ${tank.unidade}.`,
    );
  }
}

async function publishDiagnosticReadings() {
  const sensors = [...state.vacuoSensorByCode.values()];

  if (sensors.length === 0) {
    console.log(
      '[SIM DIAGNOSTICO] Aguardando SYNC_CONFIG para obter sensores de vacuo.',
    );
    return;
  }

  for (const sensor of sensors) {
    const previous =
      state.diagnosticVacuumByCode.get(sensor.codigo_hardware) ?? 0;
    const next = nextDiagnosticVacuumValue(previous);
    state.diagnosticVacuumByCode.set(sensor.codigo_hardware, next);

    await publishJson(TOPICS.leituras, {
      tipo: 'SENSOR_READING',
      schema_version: 1,
      modo: 'DIAGNOSTICO',
      codigo_hardware: sensor.codigo_hardware,
      id_sensor: sensor.id_sensor,
      valor: next,
      unidade: sensor.unidade_medida ?? 'kPa',
      timestamp: nowIso(),
    }, 0);
    console.log(
      `[SIM DIAGNOSTICO] ${sensor.codigo_hardware}: ${next} ${sensor.unidade_medida ?? 'kPa'}.`,
    );
  }
}

async function publishAck(input) {
  const payload = {
    tipo: 'ACK',
    schema_version: 1,
    correlation_id: input.correlationId,
    comando: normalizeAckCommand(input.comando),
    status: input.status,
    codigo_hardware: DEVICE_ID,
    id_processo: input.idProcesso,
    mensagem: input.mensagem,
    erro: input.erro,
    recebido_em: nowIso(),
  };

  await publishJson(TOPICS.acks, removeUndefined(payload), 1);
  console.log(
    `[SIM ACK] ${payload.comando} ${payload.status} correlation_id=${payload.correlation_id}`,
  );
}

function buildBombasStatus() {
  const bombas =
    state.bombaById.size > 0
      ? [...state.bombaById.values()]
      : [
          { codigo_hardware: 'BOMBA_VACUO_PRINCIPAL' },
          { codigo_hardware: 'BOMBA_VACUO_AUXILIAR' },
        ];

  return bombas.map((bomba) => ({
    codigo_hardware: bomba.codigo_hardware,
    ligada: state.pumpOnCodes.has(bomba.codigo_hardware),
    disponivel: true,
  }));
}

function buildLegacyValveStatusField() {
  if (state.valvulaByCode.size === 0) {
    return {};
  }

  const valvulas = {};

  for (const valve of state.valvulaByCode.values()) {
    const aberta = state.openValveCodes.has(valve.codigo_hardware);
    valvulas[String(valve.id_valvula)] = {
      id_valvula: valve.id_valvula,
      status_valvula: aberta ? 'ABERTA' : 'FECHADA',
      ack: true,
      falha: false,
    };
  }

  return { valvulas };
}

function buildAcoplamentosStatus() {
  const defaults = [
    { codigo_hardware: 'ACOP_T1', id_tanque: 1 },
    { codigo_hardware: 'ACOP_T2', id_tanque: 2 },
    { codigo_hardware: 'ACOP_T3', id_tanque: 3 },
  ];

  return defaults.map((fallback) => {
    const current = state.acoplamentoByCode.get(fallback.codigo_hardware);

    return {
      codigo_hardware: fallback.codigo_hardware,
      id_tanque: current?.id_tanque ?? fallback.id_tanque,
      acoplado: true,
    };
  });
}

function ingestSyncConfig(payload) {
  const sensors = payload?.hardware?.sensores_acoplamento;
  const vacuumSensors = payload?.hardware?.sensores_vacuo;
  const valves = payload?.hardware?.valvulas;
  const pumps = payload?.hardware?.bombas;

  ingestSyncBombas(pumps);
  ingestSyncVacuumSensors(vacuumSensors);

  if (!Array.isArray(sensors)) {
    ingestSyncValves(valves);
    return;
  }

  for (const sensor of sensors) {
    if (
      Number.isInteger(sensor.id_sensor) &&
      Number.isInteger(sensor.id_tanque) &&
      typeof sensor.codigo_hardware === 'string'
    ) {
      rememberAcoplamento({
        id_sensor: sensor.id_sensor,
        id_tanque: sensor.id_tanque,
        codigo_hardware: sensor.codigo_hardware,
      });
    }
  }

  ingestSyncValves(valves);
}

function ingestSyncBombas(pumps) {
  if (!Array.isArray(pumps)) {
    return;
  }

  for (const pump of pumps) {
    if (
      Number.isInteger(pump.id_bomba) &&
      typeof pump.codigo_hardware === 'string'
    ) {
      state.bombaById.set(pump.id_bomba, {
        id_bomba: pump.id_bomba,
        codigo_hardware: pump.codigo_hardware,
      });
    }
  }
}

function ingestSyncVacuumSensors(sensors) {
  if (!Array.isArray(sensors)) {
    return;
  }

  for (const sensor of sensors) {
    if (
      Number.isInteger(sensor.id_sensor) &&
      typeof sensor.codigo_hardware === 'string'
    ) {
      state.vacuoSensorByCode.set(sensor.codigo_hardware, {
        id_sensor: sensor.id_sensor,
        codigo_hardware: sensor.codigo_hardware,
        unidade_medida: sensor.unidade_medida,
      });
    }
  }
}

function ingestSyncValves(valves) {
  if (!Array.isArray(valves)) {
    return;
  }

  for (const valve of valves) {
    if (
      Number.isInteger(valve.id_valvula) &&
      typeof valve.codigo_hardware === 'string'
    ) {
      state.valvulaByCode.set(valve.codigo_hardware, {
        id_valvula: valve.id_valvula,
        codigo_hardware: valve.codigo_hardware,
        tipo: valve.tipo,
      });
      state.valvulaById.set(valve.id_valvula, {
        id_valvula: valve.id_valvula,
        codigo_hardware: valve.codigo_hardware,
        tipo: valve.tipo,
      });
    }
  }
}

function rememberAcoplamentoFromStart(tank) {
  const sensor = tank.sensor_acoplamento;

  if (
    sensor &&
    Number.isInteger(sensor.id_sensor) &&
    typeof sensor.codigo_hardware === 'string'
  ) {
    rememberAcoplamento({
      id_sensor: sensor.id_sensor,
      id_tanque: tank.id_tanque,
      codigo_hardware: sensor.codigo_hardware,
    });
  }
}

function rememberAcoplamento(input) {
  state.acoplamentoByCode.set(input.codigo_hardware, input);
  state.acoplamentoByTank.set(input.id_tanque, input);
}

function rememberValveFromStart(valve) {
  if (
    Number.isInteger(valve.id_valvula) &&
    typeof valve.codigo_hardware === 'string'
  ) {
    state.valvulaByCode.set(valve.codigo_hardware, {
      id_valvula: valve.id_valvula,
      codigo_hardware: valve.codigo_hardware,
      tipo: valve.tipo,
    });
    state.valvulaById.set(valve.id_valvula, {
      id_valvula: valve.id_valvula,
      codigo_hardware: valve.codigo_hardware,
      tipo: valve.tipo,
    });
  }
}

function resolveCommandValve(payload) {
  const idValvula = Number(payload?.parametros?.id_valvula ?? payload?.id_valvula);

  if (!Number.isInteger(idValvula) || idValvula <= 0) {
    return null;
  }

  return state.valvulaById.get(idValvula) ?? null;
}

function resolveCommandPump(payload) {
  const idBomba = Number(payload?.parametros?.id_bomba ?? payload?.id_bomba);

  if (!Number.isInteger(idBomba) || idBomba <= 0) {
    return null;
  }

  return state.bombaById.get(idBomba) ?? null;
}

function resolveCommandName(payload) {
  return payload.tipo ?? payload.comando ?? 'REINICIAR_COMUNICACAO';
}

function normalizeAckCommand(command) {
  if (command === 'SYNC_CONFIG') {
    return 'SINCRONIZAR_HARDWARE';
  }

  if (ACK_COMMANDS.has(command)) {
    return command;
  }

  console.warn(`[SIM ACK] Comando desconhecido para ACK: ${command}`);
  return 'REINICIAR_COMUNICACAO';
}

function requiredFields(payload, fields) {
  if (!payload || typeof payload !== 'object') {
    return fields;
  }

  return fields.filter((field) => {
    const value = payload[field];
    return value === undefined || value === null || value === '';
  });
}

function parseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function nextVacuumValue(current, target) {
  const delta = target - current;
  const step = delta * 0.18;
  const noise = (Math.random() - 0.5) * 0.8;
  const next = current + step + noise;

  if (target < current) {
    return Number(Math.max(next, target + noise).toFixed(3));
  }

  return Number(Math.min(next, target + noise).toFixed(3));
}

function nextDiagnosticVacuumValue(current) {
  const drift = (Math.random() - 0.5) * 0.6;
  const next = current * 0.7 + drift;

  return Number(next.toFixed(3));
}

function publishJson(topic, payload, qos) {
  const client = state.client;

  if (!client || !client.connected) {
    console.error(`[SIM MQTT PUB] Cliente desconectado. Topico ignorado: ${topic}`);
    return Promise.resolve();
  }

  const message = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    client.publish(topic, message, { qos, retain: false }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      console.log(`[SIM MQTT TX qos=${qos}] ${topic} -> ${message}`);
      resolve();
    });
  });
}

function removeUndefined(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function nowIso() {
  return new Date().toISOString();
}

function shutdown(code) {
  for (const timer of state.timers) {
    clearInterval(timer);
  }

  if (state.client) {
    state.client.end(true);
  }

  const uptimeMs = Date.now() - STARTED_AT;
  console.log(`[SIM] Encerrado. uptime_ms=${uptimeMs}`);
  process.exit(code);
}
