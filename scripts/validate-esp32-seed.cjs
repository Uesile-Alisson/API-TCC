require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const REQUIRED_MQTT_TOPICS = [
  'topico_configuracoes',
  'topico_acks',
  'topico_comandos',
  'topico_leituras',
  'topico_status',
  'topico_heartbeat',
  'topico_alarmes',
  'topico_acoplamentos',
];

const REQUIRED_CODES = {
  bombas: ['BOMBA_VACUO_PRINCIPAL', 'BOMBA_VACUO_AUXILIAR'],
  valvulas: ['VP_T1', 'VA_T1', 'VP_T2', 'VA_T2', 'VP_T3', 'VA_T3'],
  sensores: [
    'VACUO_T1',
    'VACUO_T2',
    'VACUO_T3',
    'ACOP_T1',
    'ACOP_T2',
    'ACOP_T3',
  ],
  tanques: ['TANQUE_1', 'TANQUE_2', 'TANQUE_3'],
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

async function main() {
  const [bombas, valvulas, sensores, tanques, mqttConfig] = await Promise.all([
    prisma.bombas.findMany({
      where: { codigo_hardware: { not: null } },
      orderBy: { codigo_hardware: 'asc' },
      select: {
        id_bomba: true,
        nome: true,
        tipo_bomba: true,
        codigo_hardware: true,
      },
    }),
    prisma.valvulas.findMany({
      where: { codigo_hardware: { not: null } },
      orderBy: { codigo_hardware: 'asc' },
      select: {
        id_valvula: true,
        nome_valvula: true,
        codigo_hardware: true,
        id_tanque: true,
      },
    }),
    prisma.sensores.findMany({
      where: { codigo_hardware: { not: null } },
      orderBy: { codigo_hardware: 'asc' },
      select: {
        id_sensor: true,
        nome: true,
        tipo_sensor: true,
        codigo_hardware: true,
      },
    }),
    prisma.tanques.findMany({
      where: { codigo_hardware: { not: null } },
      orderBy: { codigo_hardware: 'asc' },
      select: {
        id_tanque: true,
        nome: true,
        codigo_hardware: true,
      },
    }),
    prisma.mqttconfiguracoes.findUnique({
      where: { chave_configuracao: 'MQTT_PRINCIPAL' },
      select: {
        chave_configuracao: true,
        topico_configuracoes: true,
        topico_acks: true,
        topico_comandos: true,
        topico_leituras: true,
        topico_status: true,
        topico_heartbeat: true,
        topico_alarmes: true,
        topico_acoplamentos: true,
      },
    }),
  ]);

  const failures = [
    ...missingCodes('bombas', bombas),
    ...missingCodes('valvulas', valvulas),
    ...missingCodes('sensores', sensores),
    ...missingCodes('tanques', tanques),
    ...missingMqttTopics(mqttConfig),
  ];

  printSummary({ bombas, valvulas, sensores, tanques, mqttConfig });

  if (failures.length > 0) {
    console.error('\n[ESP32 SEED] Falhas encontradas:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log('\n[ESP32 SEED] Validacao aprovada.');
}

function missingCodes(modelName, rows) {
  const foundCodes = new Set(rows.map((row) => row.codigo_hardware));

  return REQUIRED_CODES[modelName]
    .filter((code) => !foundCodes.has(code))
    .map((code) => `${modelName}: codigo_hardware ausente ${code}`);
}

function missingMqttTopics(mqttConfig) {
  if (!mqttConfig) {
    return ['mqttconfiguracoes: MQTT_PRINCIPAL ausente'];
  }

  return REQUIRED_MQTT_TOPICS.filter((topicKey) => {
    const value = mqttConfig[topicKey];
    return typeof value !== 'string' || value.trim().length === 0;
  }).map((topicKey) => `mqttconfiguracoes: ${topicKey} ausente`);
}

function printSummary({ bombas, valvulas, sensores, tanques, mqttConfig }) {
  console.log('[ESP32 SEED] Bombas:');
  printRows(bombas);

  console.log('\n[ESP32 SEED] Valvulas:');
  printRows(valvulas);

  console.log('\n[ESP32 SEED] Sensores:');
  printRows(sensores);

  console.log('\n[ESP32 SEED] Tanques:');
  printRows(tanques);

  console.log('\n[ESP32 SEED] MQTT:');
  console.log(JSON.stringify(mqttConfig, null, 2));
}

function printRows(rows) {
  for (const row of rows) {
    console.log(JSON.stringify(row));
  }
}

main()
  .catch((error) => {
    console.error('[ESP32 SEED] Erro inesperado:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
