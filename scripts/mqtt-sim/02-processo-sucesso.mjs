import {
  closeMqtt,
  connectMqtt,
  finalizeProcessIfEndpointExists,
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

async function publishReadingsForAll(context, values) {
  const config = loadConfig();

  for (const valorVacuo of values) {
    await publishHeartbeat('ONLINE');
    await maybePublishStatus(
      'OPERACIONAL',
      'Processo de vacuo em execucao',
      true,
      context,
    );

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

function vacuumSuccessSequence(unit) {
  return unit.toLowerCase() === 'mbar'
    ? [1013, 850, 650, 450, 250, 120, 60, 40]
    : [-10, -25, -40, -55, -65, -75, -80];
}

async function main() {
  const config = loadConfig();

  console.log('\n=== TSEA | MQTT PROCESSO COM SUCESSO ===\n');

  await connectMqtt();
  const context = await resolveSimulationContext();

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

  for (let index = 0; index < 3; index += 1) {
    await publishReadyCycle(context);
    await sleep(config.intervalMs);
  }

  await startProcessIfRequested(context);

  await publishAlarm({
    id_processo: context.id_processo,
    tipo_alarme: 'SISTEMA',
    origem_alarme: 'SISTEMA',
    severidade: 'INFO',
    titulo: 'ESP32 sincronizado',
    descricao: 'ESP32 simulado sincronizado para execucao do processo.',
    valor_detectado: 1,
    unidade: 'flag',
  });

  await publishReadingsForAll(context, vacuumSuccessSequence(config.vacuumUnit));
  await publishReadingsForAll(context, [
    config.vacuumUnit.toLowerCase() === 'mbar' ? 40 : -80,
    config.vacuumUnit.toLowerCase() === 'mbar' ? 39 : -81,
    config.vacuumUnit.toLowerCase() === 'mbar' ? 40 : -80,
  ]);

  await publishAlarm({
    id_processo: context.id_processo,
    tipo_alarme: 'PROCESSO',
    origem_alarme: 'SISTEMA',
    severidade: 'INFO',
    titulo: 'Vacuo estabilizado',
    descricao:
      'Processo simulado atingiu estabilidade operacional de vacuo.',
    valor_detectado: config.vacuumUnit.toLowerCase() === 'mbar' ? 40 : -80,
    unidade: config.vacuumUnit,
  });

  await finalizeProcessIfEndpointExists(context);

  for (let index = 0; index < 3; index += 1) {
    await publishReadyCycle(context);
    await sleep(config.intervalMs);
  }

  closeMqtt();
  console.log('\nSimulacao de sucesso concluida sem publicar OFFLINE.\n');
}

main().catch((error) => {
  console.error(`[SIM SUCESSO ERRO] ${error.message}`);
  closeMqtt();
  process.exit(1);
});
