import {
  Prisma,
  faseprocesso,
  nivelacesso,
  origemevento,
  origemlogoperacional,
  resultadooperacao,
  severidadeevento,
  statusbomba,
  statusprocesso,
  statussensor,
  statustanque,
  statustanqueprocesso,
  tipoeventoprocesso,
  tipoleiturasensor,
  tipologoperacional,
  tiposensor,
  tiposensorprocesso,
} from '@prisma/client';
import {
  VALIDATION_PREFIX,
  assertValidationSeedAllowed,
  createPrismaClient,
  printSeedSummary,
  type SeedRecordResult,
} from './seed-utils';

const prisma = createPrismaClient();
const BASE_TIME = new Date('2026-06-20T08:00:00.000Z');
const READINGS_PER_PROCESS = 16;

type SeedTx = Prisma.TransactionClient;

interface SeedPrerequisites {
  userId: number;
  tankIds: number[];
  sensorIds: number[];
}

interface ProcessScenario {
  index: number;
  name: string;
  status: statusprocesso;
  tankStatus: statustanqueprocesso;
  phase: faseprocesso;
  startsAt: Date | null;
  endsAt: Date | null;
  pausedAt: Date | null;
  resumedAt: Date | null;
  targetVacuum: string;
  initialVacuum: string;
  finalVacuum: string | null;
  averageVacuum: string | null;
  efficiency: string | null;
  maxTime: number;
  executionTime: number | null;
  emergencyStop: boolean;
}

interface ProcessSeedResult {
  processId: number;
  processTankId: number;
  processTankSensorId: number;
  scenario: ProcessScenario;
}

interface SeedEventInput {
  tipo_evento: tipoeventoprocesso;
  severidade_evento: severidadeevento;
  ocorrido_em: Date;
}

interface SeedLogInput {
  acao: string;
  descricao: string;
  resultado: resultadooperacao;
  criado_em: Date;
}

async function main(): Promise<void> {
  assertValidationSeedAllowed();

  const results = await prisma.$transaction(async (tx) => {
    const seedResults: SeedRecordResult[] = [];
    const prerequisites = await loadPrerequisites(tx);
    const scenarios = buildScenarios();
    const processResults: ProcessSeedResult[] = [];

    for (const scenario of scenarios) {
      processResults.push(
        await ensureProcessScenario(tx, seedResults, prerequisites, scenario),
      );
    }

    for (const processResult of processResults) {
      await ensureReadings(tx, seedResults, processResult);
      await ensureOperationalEvents(tx, seedResults, processResult);
      await ensureOperationalLogs(
        tx,
        seedResults,
        prerequisites.userId,
        processResult,
      );
    }

    return seedResults;
  });

  printSeedSummary(results);
}

async function loadPrerequisites(tx: SeedTx): Promise<SeedPrerequisites> {
  const [config, tanks, pump, sensors, user] = await Promise.all([
    tx.configuracoessistema.findFirst({
      orderBy: { id_configuracao_sistema: 'asc' },
      select: { id_configuracao_sistema: true },
    }),
    tx.tanques.findMany({
      where: {
        nome: { startsWith: `${VALIDATION_PREFIX}TANQUE_` },
        status_tanque: statustanque.ATIVO,
        excluido_em: null,
      },
      orderBy: { id_tanque: 'asc' },
      take: 3,
      select: { id_tanque: true },
    }),
    tx.bombas.findFirst({
      where: {
        nome: { startsWith: `${VALIDATION_PREFIX}BOMBA_` },
        status_padrao: statusbomba.ATIVA,
      },
      select: { id_bomba: true },
    }),
    tx.sensores.findMany({
      where: {
        nome: { startsWith: `${VALIDATION_PREFIX}VACUO_` },
        tipo_sensor: tiposensor.VACUO,
        status_sensor: statussensor.ATIVO,
        excluido_em: null,
      },
      orderBy: { id_sensor: 'asc' },
      take: 3,
      select: { id_sensor: true },
    }),
    tx.usuarios.findFirst({
      where: {
        niveisacessos: {
          nome: { in: [nivelacesso.ADMINISTRADOR, nivelacesso.TECNICO] },
        },
      },
      orderBy: { id_usuario: 'asc' },
      select: { id_usuario: true },
    }),
  ]);

  if (!config) {
    throw new Error(
      'Configuracao do sistema nao encontrada. Rode a Fase Seed 1 antes.',
    );
  }

  if (tanks.length < 2) {
    throw new Error('Tanques ativos insuficientes. Rode a Fase Seed 1 antes.');
  }

  if (!pump) {
    throw new Error(
      'Bomba ativa de validacao nao encontrada. Rode a Fase Seed 1 antes.',
    );
  }

  if (sensors.length < 2) {
    throw new Error(
      'Sensores de vacuo ativos insuficientes. Rode a Fase Seed 1 antes.',
    );
  }

  if (!user) {
    throw new Error(
      'Usuario de teste/admin nao encontrado. Rode o seed de usuario existente antes.',
    );
  }

  return {
    userId: user.id_usuario,
    tankIds: tanks.map((tank) => tank.id_tanque),
    sensorIds: sensors.map((sensor) => sensor.id_sensor),
  };
}

function buildScenarios(): ProcessScenario[] {
  const definitions = [
    {
      status: statusprocesso.CONCLUIDO,
      tankStatus: statustanqueprocesso.CONCLUIDO,
      phase: faseprocesso.FINALIZADO,
      finalVacuum: '50.200',
      efficiency: '96.40',
    },
    {
      status: statusprocesso.CONCLUIDO,
      tankStatus: statustanqueprocesso.CONCLUIDO,
      phase: faseprocesso.FINALIZADO,
      finalVacuum: '49.700',
      efficiency: '94.80',
    },
    {
      status: statusprocesso.CONCLUIDO,
      tankStatus: statustanqueprocesso.CONCLUIDO,
      phase: faseprocesso.FINALIZADO,
      finalVacuum: '51.000',
      efficiency: '92.20',
    },
    {
      status: statusprocesso.EM_EXECUCAO,
      tankStatus: statustanqueprocesso.GERANDO_VACUO,
      phase: faseprocesso.GERANDO_VACUO,
      finalVacuum: null,
      efficiency: null,
    },
    {
      status: statusprocesso.EM_EXECUCAO,
      tankStatus: statustanqueprocesso.VACUO_ESTABILIZADO,
      phase: faseprocesso.VACUO_ESTABILIZADO,
      finalVacuum: null,
      efficiency: null,
    },
    {
      status: statusprocesso.PAUSADO,
      tankStatus: statustanqueprocesso.EM_EXECUCAO,
      phase: faseprocesso.GERANDO_VACUO,
      finalVacuum: null,
      efficiency: '66.00',
    },
    {
      status: statusprocesso.PAUSADO,
      tankStatus: statustanqueprocesso.AGUARDANDO,
      phase: faseprocesso.PRE_CHECAGEM,
      finalVacuum: null,
      efficiency: '58.00',
    },
    {
      status: statusprocesso.INTERROMPIDO,
      tankStatus: statustanqueprocesso.INTERROMPIDO,
      phase: faseprocesso.FINALIZANDO,
      finalVacuum: '34.500',
      efficiency: '61.20',
    },
    {
      status: statusprocesso.INTERROMPIDO,
      tankStatus: statustanqueprocesso.INTERROMPIDO,
      phase: faseprocesso.FINALIZANDO,
      finalVacuum: '30.900',
      efficiency: '55.40',
    },
    {
      status: statusprocesso.FALHA,
      tankStatus: statustanqueprocesso.FALHA,
      phase: faseprocesso.FINALIZANDO,
      finalVacuum: '22.100',
      efficiency: '38.50',
    },
    {
      status: statusprocesso.FALHA,
      tankStatus: statustanqueprocesso.FALHA,
      phase: faseprocesso.FINALIZANDO,
      finalVacuum: '27.800',
      efficiency: '42.30',
    },
    {
      status: statusprocesso.CONFIGURADO,
      tankStatus: statustanqueprocesso.AGUARDANDO,
      phase: faseprocesso.CONFIGURACAO,
      finalVacuum: null,
      efficiency: null,
    },
    {
      status: statusprocesso.CONFIGURADO,
      tankStatus: statustanqueprocesso.CONFIGURADO,
      phase: faseprocesso.PRE_CHECAGEM,
      finalVacuum: null,
      efficiency: null,
    },
    {
      status: statusprocesso.CONCLUIDO,
      tankStatus: statustanqueprocesso.CONCLUIDO,
      phase: faseprocesso.FINALIZADO,
      finalVacuum: '50.500',
      efficiency: '95.10',
    },
  ] satisfies Array<{
    status: statusprocesso;
    tankStatus: statustanqueprocesso;
    phase: faseprocesso;
    finalVacuum: string | null;
    efficiency: string | null;
  }>;

  return definitions.map((definition, index) => {
    const processIndex = index + 1;
    const startsAt = addMinutes(BASE_TIME, index * 90);
    const isConfigured = definition.status === statusprocesso.CONFIGURADO;
    const hasEnd =
      definition.status === statusprocesso.CONCLUIDO ||
      definition.status === statusprocesso.INTERROMPIDO ||
      definition.status === statusprocesso.FALHA;

    return {
      index: processIndex,
      name: `${VALIDATION_PREFIX}PROCESSO_${String(processIndex).padStart(2, '0')}`,
      status: definition.status,
      tankStatus: definition.tankStatus,
      phase: definition.phase,
      startsAt: isConfigured ? null : startsAt,
      endsAt: hasEnd ? addMinutes(startsAt, 48 + index * 2) : null,
      pausedAt:
        definition.status === statusprocesso.PAUSADO
          ? addMinutes(startsAt, 24)
          : null,
      resumedAt: null,
      targetVacuum: '50.000',
      initialVacuum: '5.000',
      finalVacuum: definition.finalVacuum,
      averageVacuum: definition.finalVacuum
        ? averageVacuum('5.000', definition.finalVacuum)
        : '31.000',
      efficiency: definition.efficiency,
      maxTime: 1800,
      executionTime: hasEnd ? 48 * 60 + index * 120 : null,
      emergencyStop:
        definition.status === statusprocesso.FALHA && index % 2 === 0,
    };
  });
}

async function ensureProcessScenario(
  tx: SeedTx,
  results: SeedRecordResult[],
  prerequisites: SeedPrerequisites,
  scenario: ProcessScenario,
): Promise<ProcessSeedResult> {
  const tankId =
    prerequisites.tankIds[(scenario.index - 1) % prerequisites.tankIds.length];
  const sensorId =
    prerequisites.sensorIds[
      (scenario.index - 1) % prerequisites.sensorIds.length
    ];
  const existingProcess = await tx.processos.findFirst({
    where: { nome_processo: scenario.name },
    select: { id_processo: true },
  });
  const processData = {
    id_usuario: prerequisites.userId,
    nome_processo: scenario.name,
    status_processo: scenario.status,
    vacuo_alvo: decimal(scenario.targetVacuum),
    vacuo_inicial: scenario.startsAt ? decimal(scenario.initialVacuum) : null,
    vacuo_final: scenario.finalVacuum ? decimal(scenario.finalVacuum) : null,
    vacuo_medio: scenario.averageVacuum
      ? decimal(scenario.averageVacuum)
      : null,
    eficiencia: scenario.efficiency ? decimal(scenario.efficiency) : null,
    tempo_maximo: scenario.maxTime,
    tempo_execucao: scenario.executionTime,
    iniciado_em: scenario.startsAt,
    pausado_em: scenario.pausedAt,
    retomado_em: scenario.resumedAt,
    finalizado_em: scenario.endsAt,
    parada_emergencia: scenario.emergencyStop,
    fase_processo: scenario.phase,
  };
  const processRecord = existingProcess
    ? await tx.processos.update({
        where: { id_processo: existingProcess.id_processo },
        data: processData,
        select: { id_processo: true },
      })
    : await tx.processos.create({
        data: processData,
        select: { id_processo: true },
      });

  results.push({
    model: 'processos',
    label: scenario.name,
    id: processRecord.id_processo,
    action: existingProcess ? 'updated' : 'created',
  });

  const processTank = await ensureProcessTank(
    tx,
    results,
    processRecord.id_processo,
    tankId,
    scenario,
  );
  const processTankSensor = await ensureProcessTankSensor(
    tx,
    results,
    processTank.id_processo_tanque,
    sensorId,
    scenario,
  );

  await tx.processos.update({
    where: { id_processo: processRecord.id_processo },
    data: { id_processo_tanque_atual: processTank.id_processo_tanque },
    select: { id_processo: true },
  });

  return {
    processId: processRecord.id_processo,
    processTankId: processTank.id_processo_tanque,
    processTankSensorId: processTankSensor.id_processo_tanque_sensor,
    scenario,
  };
}

async function ensureProcessTank(
  tx: SeedTx,
  results: SeedRecordResult[],
  processId: number,
  tankId: number,
  scenario: ProcessScenario,
): Promise<{ id_processo_tanque: number }> {
  const existing = await tx.processostanques.findFirst({
    where: { id_processo: processId, id_tanque: tankId },
    select: { id_processo_tanque: true },
  });
  const data = {
    vacuo_alvo: decimal(scenario.targetVacuum),
    vacuo_inicial: scenario.startsAt ? decimal(scenario.initialVacuum) : null,
    vacuo_final: scenario.finalVacuum ? decimal(scenario.finalVacuum) : null,
    vacuo_medio: scenario.averageVacuum
      ? decimal(scenario.averageVacuum)
      : null,
    eficiencia: scenario.efficiency ? decimal(scenario.efficiency) : null,
    status_tanque_processo: scenario.tankStatus,
    iniciado_em: scenario.startsAt,
    finalizado_em: scenario.endsAt,
    volume_alvo_ml: null,
    volume_enviado_ml: decimal('0.000'),
    vazao_atual_l_min: null,
    nivel_atual_percentual: null,
    vacuo_atingido:
      scenario.status === statusprocesso.CONCLUIDO ||
      scenario.phase === faseprocesso.VACUO_ESTABILIZADO,
    vacuo_estabilizado: scenario.status === statusprocesso.CONCLUIDO,
    alimentacao_iniciada_em: null,
    alimentacao_finalizada_em: null,
  };
  const record = existing
    ? await tx.processostanques.update({
        where: { id_processo_tanque: existing.id_processo_tanque },
        data,
        select: { id_processo_tanque: true },
      })
    : await tx.processostanques.create({
        data: {
          id_processo: processId,
          id_tanque: tankId,
          ...data,
        },
        select: { id_processo_tanque: true },
      });

  results.push({
    model: 'processostanques',
    label: `${scenario.name}_TANQUE`,
    id: record.id_processo_tanque,
    action: existing ? 'updated' : 'created',
  });

  return record;
}

async function ensureProcessTankSensor(
  tx: SeedTx,
  results: SeedRecordResult[],
  processTankId: number,
  sensorId: number,
  scenario: ProcessScenario,
): Promise<{ id_processo_tanque_sensor: number }> {
  const existing = await tx.processostanquessensores.findFirst({
    where: { id_processo_tanque: processTankId, id_sensor: sensorId },
    select: { id_processo_tanque_sensor: true },
  });
  const data = {
    ativo: true,
    removido_em: null,
    observacoes: `${scenario.name} - sensor de vacuo de validacao`,
    tipo_sensor_processo: tiposensorprocesso.VACUO,
  };
  const record = existing
    ? await tx.processostanquessensores.update({
        where: {
          id_processo_tanque_sensor: existing.id_processo_tanque_sensor,
        },
        data,
        select: { id_processo_tanque_sensor: true },
      })
    : await tx.processostanquessensores.create({
        data: {
          id_processo_tanque: processTankId,
          id_sensor: sensorId,
          ...data,
        },
        select: { id_processo_tanque_sensor: true },
      });

  results.push({
    model: 'processostanquessensores',
    label: `${scenario.name}_SENSOR_VACUO`,
    id: record.id_processo_tanque_sensor,
    action: existing ? 'updated' : 'created',
  });

  return record;
}

async function ensureReadings(
  tx: SeedTx,
  results: SeedRecordResult[],
  processResult: ProcessSeedResult,
): Promise<void> {
  if (!processResult.scenario.startsAt) {
    return;
  }

  let created = 0;
  let updated = 0;
  const values = buildVacuumSeries(processResult.scenario);

  for (let index = 0; index < READINGS_PER_PROCESS; index += 1) {
    const leituraEm = addMinutes(processResult.scenario.startsAt, index * 3);
    const existing = await tx.leiturasensores.findFirst({
      where: {
        id_processo_tanque_sensor: processResult.processTankSensorId,
        tipo_leitura: tipoleiturasensor.VACUO,
        leitura_em: leituraEm,
      },
      select: { id_leitura_sensor: true },
    });
    const data = {
      valor_vacuo: decimal(values[index]),
      leitura_em: leituraEm,
      recebido_em: addSeconds(leituraEm, 8),
      tipo_leitura: tipoleiturasensor.VACUO,
      valor: decimal(values[index]),
      unidade_medida: 'kPa',
      volume_acumulado_ml: null,
      percentual_nivel: null,
    };

    if (existing) {
      await tx.leiturasensores.update({
        where: { id_leitura_sensor: existing.id_leitura_sensor },
        data,
        select: { id_leitura_sensor: true },
      });
      updated += 1;
    } else {
      await tx.leiturasensores.create({
        data: {
          id_processo_tanque_sensor: processResult.processTankSensorId,
          ...data,
        },
        select: { id_leitura_sensor: true },
      });
      created += 1;
    }
  }

  results.push({
    model: 'leiturasensores',
    label: `${processResult.scenario.name}_VACUO_SERIE`,
    id: processResult.processTankSensorId,
    action: created > 0 && updated === 0 ? 'created' : 'updated',
  });
}

async function ensureOperationalEvents(
  tx: SeedTx,
  results: SeedRecordResult[],
  processResult: ProcessSeedResult,
): Promise<void> {
  const events = buildEvents(processResult);
  let created = 0;
  let updated = 0;

  for (const event of events) {
    const existing = await tx.eventos.findFirst({
      where: {
        id_processo: processResult.processId,
        tipo_evento: event.tipo_evento,
        ocorrido_em: event.ocorrido_em,
      },
      select: { id_evento_processo: true },
    });
    const data = {
      tipo_evento: event.tipo_evento,
      origem_evento: origemevento.SISTEMA,
      severidade_evento: event.severidade_evento,
      ocorrido_em: event.ocorrido_em,
      id_processo_tanque_sensor: processResult.processTankSensorId,
    };

    if (existing) {
      await tx.eventos.update({
        where: { id_evento_processo: existing.id_evento_processo },
        data,
        select: { id_evento_processo: true },
      });
      updated += 1;
    } else {
      await tx.eventos.create({
        data: {
          id_processo: processResult.processId,
          ...data,
        },
        select: { id_evento_processo: true },
      });
      created += 1;
    }
  }

  results.push({
    model: 'eventos',
    label: `${processResult.scenario.name}_EVENTOS`,
    id: processResult.processId,
    action: created > 0 && updated === 0 ? 'created' : 'updated',
  });
}

async function ensureOperationalLogs(
  tx: SeedTx,
  results: SeedRecordResult[],
  userId: number,
  processResult: ProcessSeedResult,
): Promise<void> {
  const logs = buildLogs(processResult);
  let created = 0;
  let updated = 0;

  for (const log of logs) {
    const existing = await tx.logsoperacionais.findFirst({
      where: {
        id_processo: processResult.processId,
        acao: log.acao,
        criado_em: log.criado_em,
      },
      select: { id_log_operacional: true },
    });
    const data = {
      id_usuario: userId,
      tipo_log: tipologoperacional.PROCESSO,
      acao: log.acao,
      descricao: log.descricao,
      origem: origemlogoperacional.SISTEMA,
      resultado: log.resultado,
      criado_em: log.criado_em,
    };

    if (existing) {
      await tx.logsoperacionais.update({
        where: { id_log_operacional: existing.id_log_operacional },
        data,
        select: { id_log_operacional: true },
      });
      updated += 1;
    } else {
      await tx.logsoperacionais.create({
        data: {
          id_processo: processResult.processId,
          ...data,
        },
        select: { id_log_operacional: true },
      });
      created += 1;
    }
  }

  results.push({
    model: 'logsoperacionais',
    label: `${processResult.scenario.name}_LOGS`,
    id: processResult.processId,
    action: created > 0 && updated === 0 ? 'created' : 'updated',
  });
}

function buildEvents(processResult: ProcessSeedResult): SeedEventInput[] {
  const scenario = processResult.scenario;
  const base = scenario.startsAt ?? addMinutes(BASE_TIME, scenario.index * 90);
  const events: SeedEventInput[] = [
    {
      tipo_evento: tipoeventoprocesso.PROCESSO_CRIADO,
      severidade_evento: severidadeevento.INFO,
      ocorrido_em: addMinutes(base, -5),
    },
  ];

  if (scenario.startsAt) {
    events.push({
      tipo_evento: tipoeventoprocesso.PROCESSO_INICIADO,
      severidade_evento: severidadeevento.INFO,
      ocorrido_em: scenario.startsAt,
    });
  }

  if (scenario.status === statusprocesso.PAUSADO && scenario.pausedAt) {
    events.push({
      tipo_evento: tipoeventoprocesso.PROCESSO_PAUSADO,
      severidade_evento: severidadeevento.AVISO,
      ocorrido_em: scenario.pausedAt,
    });
  }

  if (scenario.status === statusprocesso.CONCLUIDO && scenario.endsAt) {
    events.push({
      tipo_evento: tipoeventoprocesso.VACUO_ALVO_ATINGIDO,
      severidade_evento: severidadeevento.INFO,
      ocorrido_em: addMinutes(scenario.endsAt, -8),
    });
    events.push({
      tipo_evento: tipoeventoprocesso.PROCESSO_CONCLUIDO,
      severidade_evento: severidadeevento.INFO,
      ocorrido_em: scenario.endsAt,
    });
  }

  if (scenario.status === statusprocesso.INTERROMPIDO && scenario.endsAt) {
    events.push({
      tipo_evento: tipoeventoprocesso.PROCESSO_INTERROMPIDO,
      severidade_evento: severidadeevento.AVISO,
      ocorrido_em: scenario.endsAt,
    });
  }

  if (scenario.status === statusprocesso.FALHA && scenario.endsAt) {
    events.push({
      tipo_evento: tipoeventoprocesso.VACUO_FORA_LIMITE,
      severidade_evento: severidadeevento.CRITICO,
      ocorrido_em: addMinutes(scenario.endsAt, -6),
    });
    events.push({
      tipo_evento: tipoeventoprocesso.PROCESSO_FALHA,
      severidade_evento: severidadeevento.CRITICO,
      ocorrido_em: scenario.endsAt,
    });
  }

  return events;
}

function buildLogs(processResult: ProcessSeedResult): SeedLogInput[] {
  const scenario = processResult.scenario;
  const base = scenario.startsAt ?? addMinutes(BASE_TIME, scenario.index * 90);
  const logs: SeedLogInput[] = [
    {
      acao: `${scenario.name}_PROCESSO_CRIADO`,
      descricao: `Seed validacao criou o processo sintetico ${scenario.name}.`,
      resultado: resultadooperacao.SUCESSO,
      criado_em: addMinutes(base, -5),
    },
  ];

  if (scenario.startsAt) {
    logs.push({
      acao: `${scenario.name}_PROCESSO_INICIADO`,
      descricao: `Seed validacao iniciou o processo sintetico ${scenario.name}.`,
      resultado: resultadooperacao.SUCESSO,
      criado_em: scenario.startsAt,
    });
  }

  if (scenario.status === statusprocesso.PAUSADO && scenario.pausedAt) {
    logs.push({
      acao: `${scenario.name}_PROCESSO_PAUSADO`,
      descricao: `Seed validacao pausou o processo sintetico ${scenario.name}.`,
      resultado: resultadooperacao.SUCESSO,
      criado_em: scenario.pausedAt,
    });
  }

  if (scenario.status === statusprocesso.CONCLUIDO && scenario.endsAt) {
    logs.push({
      acao: `${scenario.name}_PROCESSO_FINALIZADO`,
      descricao: `Seed validacao finalizou o processo sintetico ${scenario.name}.`,
      resultado: resultadooperacao.SUCESSO,
      criado_em: scenario.endsAt,
    });
  }

  if (scenario.status === statusprocesso.INTERROMPIDO && scenario.endsAt) {
    logs.push({
      acao: `${scenario.name}_PROCESSO_INTERROMPIDO`,
      descricao: `Seed validacao interrompeu o processo sintetico ${scenario.name}.`,
      resultado: resultadooperacao.CANCELADO,
      criado_em: scenario.endsAt,
    });
  }

  if (scenario.status === statusprocesso.FALHA && scenario.endsAt) {
    logs.push({
      acao: `${scenario.name}_FALHA_OPERACIONAL`,
      descricao: `Seed validacao registrou falha operacional sintetica em ${scenario.name}.`,
      resultado: resultadooperacao.FALHA,
      criado_em: scenario.endsAt,
    });
  }

  return logs;
}

function buildVacuumSeries(scenario: ProcessScenario): string[] {
  const target = Number(scenario.targetVacuum);
  const initial = Number(scenario.initialVacuum);
  const final = Number(scenario.finalVacuum ?? '39.000');
  const values: string[] = [];

  for (let index = 0; index < READINGS_PER_PROCESS; index += 1) {
    const progress = index / (READINGS_PER_PROCESS - 1);
    let value = initial + (final - initial) * progress;

    if (scenario.status === statusprocesso.FALHA) {
      value = initial + 20 * progress + Math.sin(index) * 4;
    }

    if (scenario.status === statusprocesso.INTERROMPIDO) {
      value = initial + (target * 0.7 - initial) * progress;
    }

    if (scenario.status === statusprocesso.EM_EXECUCAO) {
      value = initial + (target * 0.82 - initial) * progress;
    }

    if (scenario.status === statusprocesso.PAUSADO) {
      value = initial + (target * 0.62 - initial) * progress;
    }

    values.push(value.toFixed(3));
  }

  return values;
}

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function averageVacuum(initial: string, final: string): string {
  return ((Number(initial) + Number(final)) / 2).toFixed(3);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    process.stderr.write(`validation_seed_failed ${message}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
