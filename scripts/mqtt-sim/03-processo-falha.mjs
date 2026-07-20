import {
  closeMqtt,
  connectMqtt,
  interruptProcessIfEndpointExists,
  loadConfig,
  maybePublishStatus,
  publishAcoplamento,
  publishAlarm,
  publishHeartbeat,
  publishReading,
  resolveSimulationContext,
  sleep,
  startProcessIfRequested,
} from './shared.mjs';

async function publishReadyCycle(context) {
  const config = loadConfig();

  await publishHeartbeat('ONLINE');
  await maybePublishStatus('OPERACIONAL', 'ESP32 operacional', true, context);

  for (const acoplamento of context.acoplamentos) {
    await publishAcoplamento(
      acoplamento.id_sensor,
      acoplamento.id_tanque,
      true,
    );
  }

  for (const idPts of context.ptsIds) {
    await publishReading(idPts, config.precheckVacuum);
  }
}

async function publishReadingsForAll(context, values, statusGeral, mensagem) {
  const config = loadConfig();

  for (const valorVacuo of values) {
    await publishHeartbeat('ONLINE');
    await maybePublishStatus(statusGeral, mensagem, true, context);

    for (const acoplamento of context.acoplamentos) {
      await publishAcoplamento(
        acoplamento.id_sensor,
        acoplamento.id_tanque,
        true,
      );
    }

    for (const idPts of context.ptsIds) {
      await publishReading(idPts, valorVacuo);
    }

    await sleep(config.readingIntervalMs);
  }
}

function normalSequence(unit) {
  return unit.toLowerCase() === 'mbar'
    ? [1013, 900, 760, 620, 500, 390]
    : [-10, -22, -36, -48, -58, -68];
}

function unstableSequence(unit) {
  return unit.toLowerCase() === 'mbar'
    ? [260, 180, 230, 170, 210, 160]
    : [-72, -54, -69, -51, -66, -48];
}

async function main() {
  const config = loadConfig();

  console.log('\n=== TSEA | MQTT PROCESSO COM FALHA ===\n');

  await connectMqtt();
  const context = await resolveSimulationContext();
  const firstPtsId = context.ptsIds[0];
  const firstAcoplamento = context.acoplamentos[0];

  console.log(`[CTX] id_processo=${context.id_processo}`);
  console.log(
    `[CTX] Tanques=${context.tanques
      .map((item) => `${item.id_tanque}:${item.nome_tanque}`)
      .join(',')}`,
  );
  console.log(`[CTX] PTS=${context.ptsIds.join(',')}`);
  console.log(
    `[CTX] Valvulas=${context.valvulas
      .map((item) => `${item.id_valvula}:${item.nome_valvula}`)
      .join(',')}`,
  );
  console.log(
    `[CTX] Acoplamentos (${context.acoplamentos_source})=${context.acoplamentos
      .map((item) => `${item.id_sensor}:${item.id_tanque}`)
      .join(',')}`,
  );
  console.log(
    `[FALHA] O tanque ${firstAcoplamento.id_tanque} sera desacoplado usando o sensor ${firstAcoplamento.id_sensor}.`,
  );

  for (let index = 0; index < 3; index += 1) {
    await publishReadyCycle(context);
    await sleep(config.intervalMs);
  }

  await startProcessIfRequested(context);

  console.log('[INFO] ESP32 simulado sincronizado antes da falha operacional.');

  await publishReadingsForAll(
    context,
    normalSequence(config.vacuumUnit),
    'OPERACIONAL',
    'Processo de vacuo em execucao',
  );

  const firstWarningValue =
    config.vacuumUnit.toLowerCase() === 'mbar' ? 260 : -54;

  await publishReading(firstPtsId, firstWarningValue);
  await publishAlarm({
    id_processo_tanque_sensor: firstPtsId,
    tipo_alarme: 'SENSOR',
    origem_alarme: 'SENSOR',
    severidade: 'MEDIO',
    titulo: 'Oscilacao na leitura de vacuo',
    descricao:
      'Sensor de vacuo apresentou oscilacao durante o processo simulado.',
    valor_detectado: firstWarningValue,
    unidade: config.vacuumUnit,
  });

  await publishReadingsForAll(
    context,
    unstableSequence(config.vacuumUnit),
    'ALERTA',
    'Processo em alerta por instabilidade de vacuo',
  );

  const secondWarningValue =
    config.vacuumUnit.toLowerCase() === 'mbar' ? 210 : -48;

  await publishAlarm({
    id_processo: context.id_processo,
    tipo_alarme: 'PROCESSO',
    origem_alarme: 'ESP32',
    severidade: 'MEDIO',
    titulo: 'Vacuo fora da faixa esperada',
    descricao:
      'Processo simulado apresentou vacuo fora da faixa operacional esperada.',
    valor_detectado: secondWarningValue,
    unidade: config.vacuumUnit,
  });

  await publishAcoplamento(
    firstAcoplamento.id_sensor,
    firstAcoplamento.id_tanque,
    false,
  );

  await publishAlarm({
    id_processo: context.id_processo,
    tipo_alarme: 'ESP32',
    origem_alarme: 'ESP32',
    severidade: 'CRITICO',
    titulo: 'Mangueira desacoplada durante processo',
    descricao:
      'Falha critica simulada: mangueira desacoplada durante o processo.',
    valor_detectado: 1,
    unidade: 'flag',
  });

  await maybePublishStatus(
    'FALHA',
    'Falha simulada por mangueira desacoplada',
    true,
    context,
  );

  await interruptProcessIfEndpointExists(context);

  for (let index = 0; index < 3; index += 1) {
    await publishHeartbeat('ONLINE');
    await publishAcoplamento(
      firstAcoplamento.id_sensor,
      firstAcoplamento.id_tanque,
      false,
    );
    await sleep(config.intervalMs);
  }

  closeMqtt();
  console.log('\nSimulacao de falha concluida sem publicar OFFLINE.\n');
}

main().catch((error) => {
  console.error(`[SIM FALHA ERRO] ${error.message}`);
  closeMqtt();
  process.exit(1);
});
