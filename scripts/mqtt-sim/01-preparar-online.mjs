import {
  closeMqtt,
  connectMqtt,
  loadConfig,
  logAcoplamentoDiagnostics,
  maybePublishStatus,
  publishAcoplamento,
  publishHeartbeat,
  publishReading,
  resolveSimulationContext,
  sleep,
} from './shared.mjs';

let stopped = false;

process.once('SIGINT', () => {
  stopped = true;
});

async function publishPrecheckCycle(context) {
  const config = loadConfig();

  await publishHeartbeat('ONLINE');

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

  await maybePublishStatus(
    'OPERACIONAL',
    'ESP32 operacional para pre-checagem',
    true,
    context,
  );
}

async function main() {
  const config = loadConfig();

  console.log('\n=== TSEA | MQTT PREPARO / ONLINE / PRE-CHECAGEM ===\n');

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

  if (!config.publishStatus) {
    console.log(
      '[STATUS] Publicacao de tsea/status desligada por padrao por causa do bug conhecido statusAt.toISOString.',
    );
  }

  console.log('\nRodando ate CTRL+C. Nao sera publicado OFFLINE ao sair.\n');
  console.log(
    'Se a pre-checagem ainda reprovar acoplamento, confira se os pares id_sensor:id_tanque abaixo pertencem ao processo atual.',
  );

  let diagnosticLogged = false;
  while (!stopped) {
    await publishPrecheckCycle(context);
    if (!diagnosticLogged) {
      await logAcoplamentoDiagnostics(context);
      diagnosticLogged = true;
    }
    await sleep(config.intervalMs);
  }

  closeMqtt();
}

main().catch((error) => {
  console.error(`[SIM PREPARO ERRO] ${error.message}`);
  closeMqtt();
  process.exit(1);
});
