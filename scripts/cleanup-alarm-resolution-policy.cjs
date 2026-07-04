require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Cleanup de validacao de alarmes bloqueado em production.');
}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const VALIDATION_PREFIX = '[VALIDAÇÃO DEV - ALARM_POLICY]';
const LEGACY_ALARM_TITLES = [
  'VALIDACAO ATIVO SEM PROCESSO BLOQUEANTE',
  'VALIDACAO ATIVO EM EXECUCAO',
  'VALIDACAO ATIVO EM_EXECUCAO',
  'VALIDACAO ATIVO PAUSADO',
  'VALIDACAO ATIVO CONFIGURADO',
  'VALIDACAO NORMALIZADO CONFIGURADO',
  'VALIDACAO CONCLUIDO',
  'VALIDACAO ATIVO CONCLUIDO',
  'VALIDACAO INTERROMPIDO',
  'VALIDACAO ATIVO INTERROMPIDO',
  'VALIDACAO FALHA',
  'VALIDACAO ATIVO FALHA',
];
const LEGACY_PROCESS_PREFIX = 'VALIDACAO_POLITICA_ALARME_';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const confirm = args.has('--confirm');
const includeLegacy = args.has('--include-legacy');

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value)))];
}

function ids(records, key) {
  return uniqueNumbers(records.map((record) => record[key]).filter(Boolean));
}

async function findValidationData() {
  const prefixedAlarms = await prisma.alarmes.findMany({
    where: {
      OR: [
        { titulo: { contains: VALIDATION_PREFIX } },
        { descricao: { contains: VALIDATION_PREFIX } },
      ],
    },
    select: {
      id_alarme: true,
      titulo: true,
      id_processo: true,
    },
    orderBy: { id_alarme: 'asc' },
  }).then((records) =>
    records.filter(
      (record) =>
        record.titulo.startsWith(VALIDATION_PREFIX) ||
        record.descricao.startsWith(VALIDATION_PREFIX),
    ),
  );

  const legacyAlarms = includeLegacy
    ? await prisma.alarmes.findMany({
        where: {
          titulo: { in: LEGACY_ALARM_TITLES },
        },
        select: {
          id_alarme: true,
          titulo: true,
          id_processo: true,
        },
        orderBy: { id_alarme: 'asc' },
      })
    : [];

  const alarmIds = uniqueNumbers([
    ...ids(prefixedAlarms, 'id_alarme'),
    ...ids(legacyAlarms, 'id_alarme'),
  ]);
  const processIdsFromAlarms = uniqueNumbers([
    ...ids(prefixedAlarms, 'id_processo'),
    ...ids(legacyAlarms, 'id_processo'),
  ]);

  const prefixedProcesses = await prisma.processos.findMany({
    where: {
      nome_processo: { contains: VALIDATION_PREFIX },
    },
    select: {
      id_processo: true,
      nome_processo: true,
    },
    orderBy: { id_processo: 'asc' },
  }).then((records) =>
    records.filter((record) =>
      record.nome_processo?.startsWith(VALIDATION_PREFIX),
    ),
  );

  const legacyProcesses =
    includeLegacy && processIdsFromAlarms.length > 0
      ? await prisma.processos.findMany({
          where: {
            id_processo: { in: processIdsFromAlarms },
            nome_processo: { contains: LEGACY_PROCESS_PREFIX },
          },
          select: {
            id_processo: true,
            nome_processo: true,
          },
          orderBy: { id_processo: 'asc' },
        }).then((records) =>
          records.filter((record) =>
            record.nome_processo?.startsWith(LEGACY_PROCESS_PREFIX),
          ),
        )
      : [];

  const processCandidates = [...prefixedProcesses, ...legacyProcesses];
  const processIds = uniqueNumbers(ids(processCandidates, 'id_processo'));
  const processSafety = await inspectProcessSafety(processIds, alarmIds);
  const safeProcessIds = processSafety.safeProcessIds;
  const validationEventIds = processSafety.validationEventIds;
  const removableEventIds = processSafety.removableEventIds;
  const blockingEventIds = processSafety.blockingEventIds;

  const acknowledgementCount =
    alarmIds.length > 0
      ? await prisma.alarmesreconhecimentos.count({
          where: { id_alarme: { in: alarmIds } },
        })
      : 0;
  const recoveryAttemptCount =
    alarmIds.length > 0
      ? await prisma.alarmesrecuperacoestentativas.count({
          where: { id_alarme: { in: alarmIds } },
        })
      : 0;
  const logCount = await countValidationLogs(alarmIds, safeProcessIds);

  return {
    prefixedAlarms,
    legacyAlarms,
    alarmIds,
    prefixedProcesses,
    legacyProcesses,
    processIds,
    safeProcessIds,
    validationEventIds,
    removableEventIds,
    blockingEventIds,
    acknowledgementCount,
    recoveryAttemptCount,
    logCount,
  };
}

async function inspectProcessSafety(processIds, alarmIds) {
  const safeIds = [];
  const validationEventIds = [];
  const removableEventIds = [];
  const blockingEventIds = [];

  for (const idProcesso of processIds) {
    const [nonValidationAlarms, reports, processTanks, events, mqttHistory] =
      await Promise.all([
        prisma.alarmes.count({
          where: {
            id_processo: idProcesso,
            id_alarme: { notIn: alarmIds.length > 0 ? alarmIds : [-1] },
          },
        }),
        prisma.relatorios.count({
          where: { id_processo: idProcesso },
        }),
        prisma.processostanques.count({
          where: { id_processo: idProcesso },
        }),
        prisma.eventos.count({
          where: { id_processo: idProcesso },
        }),
        prisma.processosmqttconfiguracoeshistorico.count({
          where: { id_processo: idProcesso },
        }),
      ]);
    const processEvents =
      events > 0
        ? await prisma.eventos.findMany({
            where: { id_processo: idProcesso },
            select: { id_evento_processo: true },
            orderBy: { id_evento_processo: 'asc' },
          })
        : [];
    const processEventIds = ids(processEvents, 'id_evento_processo');
    validationEventIds.push(...processEventIds);
    const hasUnexpectedBlockingLink =
      nonValidationAlarms > 0 ||
      reports > 0 ||
      processTanks > 0 ||
      mqttHistory > 0;

    if (!hasUnexpectedBlockingLink) {
      safeIds.push(idProcesso);
      removableEventIds.push(...processEventIds);
      continue;
    }

    blockingEventIds.push(...processEventIds);
    console.warn(
      `[SKIP] Processo ${idProcesso} possui vinculo inesperado: alarmes_reais=${nonValidationAlarms}, relatorios=${reports}, tanques=${processTanks}, eventos=${events}, mqtt_historico=${mqttHistory}.`,
    );
  }

  return {
    safeProcessIds: safeIds,
    validationEventIds: uniqueNumbers(validationEventIds),
    removableEventIds: uniqueNumbers(removableEventIds),
    blockingEventIds: uniqueNumbers(blockingEventIds),
  };
}

async function countValidationLogs(alarmIds, processIds) {
  return prisma.logsoperacionais.count({
    where: buildLogWhere(alarmIds, processIds),
  });
}

function buildLogWhere(alarmIds, processIds) {
  const or = [
    { descricao: { contains: VALIDATION_PREFIX } },
  ];

  if (alarmIds.length > 0) {
    or.push(
      ...alarmIds.map((idAlarme) => ({
        descricao: { contains: `Alarme #${idAlarme}` },
      })),
    );
  }

  if (processIds.length > 0) {
    or.push({ id_processo: { in: processIds } });
  }

  return { OR: or };
}

function printSummary(data) {
  console.log('\n=== Cleanup alarm-resolution-policy ===\n');
  console.log(`Prefixo novo: ${VALIDATION_PREFIX}`);
  console.log(`Incluir legado: ${includeLegacy ? 'sim' : 'nao'}`);
  console.log(`Dry-run: ${dryRun ? 'sim' : 'nao'}`);
  console.log(`Confirmado: ${confirm ? 'sim' : 'nao'}`);
  console.log('');
  console.log(`Alarmes com prefixo: ${data.prefixedAlarms.length}`);
  console.log(`Alarmes legados exatos: ${data.legacyAlarms.length}`);
  console.log(`IDs alarmes: ${data.alarmIds.join(', ') || 'nenhum'}`);
  console.log(`Processos com prefixo: ${data.prefixedProcesses.length}`);
  console.log(`Processos legados candidatos: ${data.legacyProcesses.length}`);
  console.log(`Processos legados seguros: ${countSafeLegacyProcesses(data)}`);
  console.log(`Processos seguros: ${data.safeProcessIds.length}`);
  console.log(
    `IDs processos seguros: ${data.safeProcessIds.join(', ') || 'nenhum'}`,
  );
  console.log(`Reconhecimentos vinculados: ${data.acknowledgementCount}`);
  console.log(`Tentativas vinculadas: ${data.recoveryAttemptCount}`);
  console.log(`Logs identificaveis: ${data.logCount}`);
  console.log('');
  console.log(
    `Eventos vinculados a processos de validacao: ${data.validationEventIds.length}`,
  );
  console.log(
    `IDs eventos vinculados: ${data.validationEventIds.join(', ') || 'nenhum'}`,
  );
  console.log(
    `IDs eventos removiveis: ${data.removableEventIds.join(', ') || 'nenhum'}`,
  );
  console.log(`Eventos que impedem remocao: ${data.blockingEventIds.length}`);
  console.log(
    `IDs eventos bloqueantes: ${data.blockingEventIds.join(', ') || 'nenhum'}`,
  );

  if (!includeLegacy && data.legacyAlarms.length === 0) {
    console.log(
      '\nMassa legada so sera considerada com a flag --include-legacy.',
    );
  }
}

function countSafeLegacyProcesses(data) {
  const safeProcessIds = new Set(data.safeProcessIds);

  return data.legacyProcesses.filter((processo) =>
    safeProcessIds.has(processo.id_processo),
  ).length;
}

function hasNothingToClean(data) {
  return (
    data.alarmIds.length === 0 &&
    data.safeProcessIds.length === 0 &&
    data.removableEventIds.length === 0 &&
    data.logCount === 0
  );
}

async function executeCleanup(data) {
  await prisma.$transaction(async (tx) => {
    if (data.alarmIds.length > 0) {
      await tx.alarmesreconhecimentos.deleteMany({
        where: { id_alarme: { in: data.alarmIds } },
      });
      await tx.alarmesrecuperacoestentativas.deleteMany({
        where: { id_alarme: { in: data.alarmIds } },
      });
    }

    await tx.logsoperacionais.deleteMany({
      where: buildLogWhere(data.alarmIds, data.safeProcessIds),
    });

    if (data.removableEventIds.length > 0) {
      await tx.eventos.deleteMany({
        where: { id_evento_processo: { in: data.removableEventIds } },
      });
    }

    if (data.alarmIds.length > 0) {
      await tx.alarmes.deleteMany({
        where: { id_alarme: { in: data.alarmIds } },
      });
    }

    if (data.safeProcessIds.length > 0) {
      await tx.processos.deleteMany({
        where: {
          id_processo: { in: data.safeProcessIds },
        },
      });
    }
  });
}

async function main() {
  if (!dryRun && !confirm) {
    console.log('Use --dry-run para simular ou --confirm para remover.');
    return;
  }

  const before = await findValidationData();
  printSummary(before);

  if (hasNothingToClean(before)) {
    console.log('\nNenhuma massa de validacao encontrada para limpar.');
    return;
  }

  if (dryRun) {
    console.log('\nDry-run: nenhum registro foi removido.');
    return;
  }

  await executeCleanup(before);

  const after = await findValidationData();
  console.log('\nCleanup executado com confirmacao.');
  console.log(
    `Depois: alarmes=${after.alarmIds.length}, processos_seguros=${after.safeProcessIds.length}, eventos=${after.removableEventIds.length}, logs=${after.logCount}.`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Falha desconhecida'}\n`,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
