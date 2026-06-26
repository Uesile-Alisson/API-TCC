import {
  Prisma,
  nivelacesso,
  origemalarme,
  origemevento,
  origemlogoperacional,
  resultadooperacao,
  severidadealarme,
  severidadeevento,
  statusalarme,
  statusprocesso,
  statussensor,
  tipoalarme,
  tipoeventoprocesso,
  tipologoperacional,
  tiposensor,
} from '@prisma/client';
import {
  VALIDATION_PREFIX,
  assertValidationSeedAllowed,
  createPrismaClient,
  printSeedSummary,
  type SeedRecordResult,
} from './seed-utils';

const prisma = createPrismaClient();
const BASE_TIME = new Date('2026-06-20T08:12:00.000Z');
const FINAL_OR_FAILED_STATUSES: readonly statusprocesso[] = [
  statusprocesso.CONCLUIDO,
  statusprocesso.FALHA,
];

type SeedTx = Prisma.TransactionClient;

interface ValidationProcessContext {
  id_processo: number;
  nome_processo: string;
  status_processo: statusprocesso;
  id_processo_tanque: number;
  id_tanque: number;
  id_processo_tanque_sensor: number;
  id_sensor: number;
}

interface SeedPrerequisites {
  userId: number;
  processes: ValidationProcessContext[];
  couplingSensorId: number | null;
}

interface AlarmScenario {
  index: number;
  suffix: string;
  title: string;
  description: string;
  type: tipoalarme;
  severity: severidadealarme;
  status: statusalarme;
  origin: origemalarme;
  value: string | null;
  unit: string | null;
  occurredAt: Date;
  resolvedAt: Date | null;
  process: ValidationProcessContext;
  eventType: tipoeventoprocesso;
  eventSeverity: severidadeevento;
  logAction: string;
  logDescription: string;
}

interface SeededAlarm {
  id_alarme: number;
  scenario: AlarmScenario;
}

async function main(): Promise<void> {
  assertValidationSeedAllowed();

  const results = await prisma.$transaction(async (tx) => {
    const seedResults: SeedRecordResult[] = [];
    const prerequisites = await loadPrerequisites(tx);
    const scenarios = buildAlarmScenarios(prerequisites);
    const alarms: SeededAlarm[] = [];

    for (const scenario of scenarios) {
      alarms.push(await ensureAlarm(tx, seedResults, prerequisites, scenario));
    }

    for (const alarm of alarms) {
      await ensureAlarmEvent(tx, seedResults, alarm);
      await ensureAlarmLogs(tx, seedResults, prerequisites.userId, alarm);
    }

    return seedResults;
  });

  printSeedSummary(results);
}

async function loadPrerequisites(tx: SeedTx): Promise<SeedPrerequisites> {
  const [user, vacuumSensors, tanks, couplingSensor, processes] =
    await Promise.all([
      tx.usuarios.findFirst({
        where: {
          niveisacessos: {
            nome: { in: [nivelacesso.ADMINISTRADOR, nivelacesso.TECNICO] },
            ativo: true,
          },
        },
        orderBy: { id_usuario: 'asc' },
        select: { id_usuario: true },
      }),
      tx.sensores.findMany({
        where: {
          nome: { startsWith: `${VALIDATION_PREFIX}VACUO_` },
          tipo_sensor: tiposensor.VACUO,
          status_sensor: statussensor.ATIVO,
          excluido_em: null,
        },
        orderBy: { id_sensor: 'asc' },
        select: { id_sensor: true },
      }),
      tx.tanques.findMany({
        where: {
          nome: { startsWith: `${VALIDATION_PREFIX}TANQUE_` },
          excluido_em: null,
        },
        orderBy: { id_tanque: 'asc' },
        select: { id_tanque: true },
      }),
      tx.sensores.findFirst({
        where: {
          nome: { startsWith: `${VALIDATION_PREFIX}ACOPLAMENTO_` },
          tipo_sensor: tiposensor.ACOPLAMENTO,
          status_sensor: statussensor.ATIVO,
          excluido_em: null,
        },
        orderBy: { id_sensor: 'asc' },
        select: { id_sensor: true },
      }),
      tx.processos.findMany({
        where: {
          nome_processo: { startsWith: `${VALIDATION_PREFIX}PROCESSO_` },
        },
        orderBy: { id_processo: 'asc' },
        select: {
          id_processo: true,
          nome_processo: true,
          status_processo: true,
          processostanques: {
            orderBy: { id_processo_tanque: 'asc' },
            take: 1,
            select: {
              id_processo_tanque: true,
              id_tanque: true,
              processostanquessensores: {
                orderBy: { id_processo_tanque_sensor: 'asc' },
                take: 1,
                select: {
                  id_processo_tanque_sensor: true,
                  id_sensor: true,
                },
              },
            },
          },
        },
      }),
    ]);

  if (processes.length === 0) {
    throw new Error(
      'Processos de validação não encontrados. Rode a Fase Seed 2 antes.',
    );
  }

  if (!user) {
    throw new Error(
      'Usuario ADMINISTRADOR ou TECNICO nao encontrado. A seed nao cria usuarios.',
    );
  }

  if (tanks.length === 0) {
    throw new Error(
      'Tanques de validacao nao encontrados. Rode a Fase Seed 1 antes.',
    );
  }

  if (vacuumSensors.length === 0) {
    throw new Error(
      'Sensores de vacuo de validacao nao encontrados. Rode a Fase Seed 1 antes.',
    );
  }

  const finalOrFailed = processes.some((process) =>
    FINAL_OR_FAILED_STATUSES.includes(process.status_processo),
  );

  if (!finalOrFailed) {
    throw new Error(
      'Nenhum processo de validacao concluido ou falho encontrado. Rode a Fase Seed 2 antes.',
    );
  }

  const normalizedProcesses = processes.flatMap((process) => {
    const currentTank = process.processostanques[0];
    const currentSensor = currentTank?.processostanquessensores[0];

    if (!currentTank || !currentSensor || !process.nome_processo) {
      return [];
    }

    return [
      {
        id_processo: process.id_processo,
        nome_processo: process.nome_processo,
        status_processo: process.status_processo,
        id_processo_tanque: currentTank.id_processo_tanque,
        id_tanque: currentTank.id_tanque,
        id_processo_tanque_sensor: currentSensor.id_processo_tanque_sensor,
        id_sensor: currentSensor.id_sensor,
      },
    ];
  });

  if (normalizedProcesses.length < 12) {
    throw new Error(
      'Processos de validacao com tanque e sensor insuficientes. Rode a Fase Seed 2 antes.',
    );
  }

  return {
    userId: user.id_usuario,
    processes: normalizedProcesses,
    couplingSensorId: couplingSensor?.id_sensor ?? null,
  };
}

function buildAlarmScenarios(
  prerequisites: SeedPrerequisites,
): AlarmScenario[] {
  const processes = prerequisites.processes;
  const definitions = [
    {
      suffix: 'VACUO_NAO_ATINGIDO_CRITICO',
      description: 'Vacuo ficou abaixo do alvo esperado durante validacao.',
      type: tipoalarme.PROCESSO,
      severity: severidadealarme.CRITICO,
      status: statusalarme.RESOLVIDO,
      origin: origemalarme.SENSOR,
      value: '31.200',
      unit: 'kPa',
      eventType: tipoeventoprocesso.VACUO_FORA_LIMITE,
      eventSeverity: severidadeevento.CRITICO,
    },
    {
      suffix: 'LIMITE_SEGURANCA_VACUO',
      description: 'Limite de seguranca de vacuo excedido no ciclo.',
      type: tipoalarme.SEGURANCA,
      severity: severidadealarme.CRITICO,
      status: statusalarme.ATIVO,
      origin: origemalarme.BACKEND,
      value: '82.900',
      unit: 'kPa',
      eventType: tipoeventoprocesso.PARADA_EMERGENCIA,
      eventSeverity: severidadeevento.CRITICO,
    },
    {
      suffix: 'FALHA_SENSOR_VACUO',
      description: 'Sensor de vacuo apresentou oscilacao fora da tolerancia.',
      type: tipoalarme.SENSOR,
      severity: severidadealarme.CRITICO,
      status: statusalarme.RESOLVIDO,
      origin: origemalarme.SENSOR,
      value: '0.000',
      unit: 'kPa',
      eventType: tipoeventoprocesso.SENSOR_OSCILANDO,
      eventSeverity: severidadeevento.CRITICO,
    },
    {
      suffix: 'PROCESSO_INTERROMPIDO_CRITICO',
      description: 'Processo interrompido por condicao operacional critica.',
      type: tipoalarme.PROCESSO,
      severity: severidadealarme.CRITICO,
      status: statusalarme.ATIVO,
      origin: origemalarme.SISTEMA,
      value: null,
      unit: null,
      eventType: tipoeventoprocesso.PROCESSO_INTERROMPIDO,
      eventSeverity: severidadeevento.CRITICO,
    },
    {
      suffix: 'BOMBA_INDISPONIVEL',
      description: 'Bomba principal indisponivel para ciclo de validacao.',
      type: tipoalarme.BOMBA,
      severity: severidadealarme.MEDIO,
      status: statusalarme.RESOLVIDO,
      origin: origemalarme.BACKEND,
      value: null,
      unit: null,
      eventType: tipoeventoprocesso.BOMBA_DESATIVADA,
      eventSeverity: severidadeevento.AVISO,
    },
    {
      suffix: 'PERDA_COMUNICACAO_ESP32',
      description: 'ESP32 ficou sem comunicacao durante a operacao.',
      type: tipoalarme.ESP32,
      severity: severidadealarme.MEDIO,
      status: statusalarme.ATIVO,
      origin: origemalarme.ESP32,
      value: null,
      unit: null,
      eventType: tipoeventoprocesso.ESP32_DESCONECTADO,
      eventSeverity: severidadeevento.AVISO,
    },
    {
      suffix: 'MQTT_DESCONEXAO_TEMPORARIA',
      description: 'Broker MQTT registrou desconexao temporaria.',
      type: tipoalarme.MQTT,
      severity: severidadealarme.MEDIO,
      status: statusalarme.RESOLVIDO,
      origin: origemalarme.MQTT,
      value: null,
      unit: null,
      eventType: tipoeventoprocesso.MQTT_DESCONECTADO,
      eventSeverity: severidadeevento.AVISO,
    },
    {
      suffix: 'MANGUEIRA_DESACOPLADA',
      description: buildCouplingDescription(prerequisites.couplingSensorId),
      type: tipoalarme.MANGUEIRA,
      severity: severidadealarme.MEDIO,
      status: statusalarme.ATIVO,
      origin: origemalarme.SENSOR,
      value: null,
      unit: null,
      eventType: tipoeventoprocesso.MANGUEIRA_DESACOPLADA,
      eventSeverity: severidadeevento.AVISO,
    },
    {
      suffix: 'INFORMATIVO_OPERACIONAL',
      description: 'Evento informativo de acompanhamento operacional.',
      type: tipoalarme.SISTEMA,
      severity: severidadealarme.INFO,
      status: statusalarme.RESOLVIDO,
      origin: origemalarme.SISTEMA,
      value: null,
      unit: null,
      eventType: tipoeventoprocesso.PROCESSO_INICIADO,
      eventSeverity: severidadeevento.INFO,
    },
    {
      suffix: 'TANQUE_ESTABILIZADO',
      description: 'Tanque estabilizado apos variacao controlada de vacuo.',
      type: tipoalarme.TANQUE,
      severity: severidadealarme.INFO,
      status: statusalarme.ATIVO,
      origin: origemalarme.SISTEMA,
      value: '50.000',
      unit: 'kPa',
      eventType: tipoeventoprocesso.TANQUE_ESTABILIZADO,
      eventSeverity: severidadeevento.INFO,
    },
    {
      suffix: 'SENSOR_ATIVO_RECUPERADO',
      description: 'Sensor voltou a responder apos leitura instavel.',
      type: tipoalarme.SENSOR,
      severity: severidadealarme.INFO,
      status: statusalarme.RESOLVIDO,
      origin: origemalarme.SENSOR,
      value: '49.800',
      unit: 'kPa',
      eventType: tipoeventoprocesso.SENSOR_ATIVO,
      eventSeverity: severidadeevento.INFO,
    },
    {
      suffix: 'ROTINA_DASHBOARD',
      description: 'Marcador informativo para validacao de dashboard.',
      type: tipoalarme.SISTEMA,
      severity: severidadealarme.INFO,
      status: statusalarme.ATIVO,
      origin: origemalarme.BACKEND,
      value: null,
      unit: null,
      eventType: tipoeventoprocesso.ESP32_SINCRONIZADO,
      eventSeverity: severidadeevento.INFO,
    },
  ] satisfies Array<{
    suffix: string;
    description: string;
    type: tipoalarme;
    severity: severidadealarme;
    status: statusalarme;
    origin: origemalarme;
    value: string | null;
    unit: string | null;
    eventType: tipoeventoprocesso;
    eventSeverity: severidadeevento;
  }>;

  return definitions.map((definition, index) => {
    const alarmIndex = index + 1;
    const occurredAt = addMinutes(BASE_TIME, index * 90);
    const resolvedAt =
      definition.status === statusalarme.RESOLVIDO
        ? addMinutes(occurredAt, 18)
        : null;

    return {
      index: alarmIndex,
      suffix: definition.suffix,
      title: `${VALIDATION_PREFIX}ALARME_${String(alarmIndex).padStart(2, '0')}_${definition.suffix}`,
      description: definition.description,
      type: definition.type,
      severity: definition.severity,
      status: definition.status,
      origin: definition.origin,
      value: definition.value,
      unit: definition.unit,
      occurredAt,
      resolvedAt,
      process: processes[index % processes.length],
      eventType: definition.eventType,
      eventSeverity: definition.eventSeverity,
      logAction: `ALARME_${definition.status === statusalarme.RESOLVIDO ? 'RESOLVIDO' : 'CRIADO'}_${definition.suffix}`,
      logDescription: `Seed Fase 3 registrou alarme ${definition.suffix}.`,
    };
  });
}

async function ensureAlarm(
  tx: SeedTx,
  seedResults: SeedRecordResult[],
  prerequisites: SeedPrerequisites,
  scenario: AlarmScenario,
): Promise<SeededAlarm> {
  const existing = await tx.alarmes.findFirst({
    where: { titulo: scenario.title },
    select: { id_alarme: true },
  });
  const data = {
    id_usuario_responsavel:
      scenario.status === statusalarme.RESOLVIDO ? prerequisites.userId : null,
    titulo: scenario.title,
    descricao: scenario.description,
    tipo_alarme: scenario.type,
    severidade: scenario.severity,
    status_alarme: scenario.status,
    origem_alarme: scenario.origin,
    valor_detectado: scenario.value ? decimal(scenario.value) : null,
    unidade: scenario.unit,
    ocorrido_em: scenario.occurredAt,
    resolvido_em: scenario.resolvedAt,
    excluido_em: null,
    id_processo: scenario.process.id_processo,
    id_processo_tanque: scenario.process.id_processo_tanque,
    id_processo_tanque_sensor:
      scenario.type === tipoalarme.MANGUEIRA
        ? null
        : scenario.process.id_processo_tanque_sensor,
  };

  const alarm = existing
    ? await tx.alarmes.update({
        where: { id_alarme: existing.id_alarme },
        data,
        select: { id_alarme: true },
      })
    : await tx.alarmes.create({
        data,
        select: { id_alarme: true },
      });

  seedResults.push({
    model: 'alarmes',
    label: scenario.title,
    id: alarm.id_alarme,
    action: existing ? 'updated' : 'created',
  });

  return {
    id_alarme: alarm.id_alarme,
    scenario,
  };
}

async function ensureAlarmEvent(
  tx: SeedTx,
  seedResults: SeedRecordResult[],
  alarm: SeededAlarm,
): Promise<void> {
  const existing = await tx.eventos.findFirst({
    where: {
      id_processo: alarm.scenario.process.id_processo,
      id_processo_tanque_sensor:
        alarm.scenario.type === tipoalarme.MANGUEIRA
          ? null
          : alarm.scenario.process.id_processo_tanque_sensor,
      tipo_evento: alarm.scenario.eventType,
      ocorrido_em: alarm.scenario.occurredAt,
    },
    select: { id_evento_processo: true },
  });
  const data = {
    id_processo: alarm.scenario.process.id_processo,
    tipo_evento: alarm.scenario.eventType,
    origem_evento: mapAlarmOriginToEventOrigin(alarm.scenario.origin),
    severidade_evento: alarm.scenario.eventSeverity,
    ocorrido_em: alarm.scenario.occurredAt,
    id_processo_tanque_sensor:
      alarm.scenario.type === tipoalarme.MANGUEIRA
        ? null
        : alarm.scenario.process.id_processo_tanque_sensor,
  };

  const event = existing
    ? await tx.eventos.update({
        where: { id_evento_processo: existing.id_evento_processo },
        data,
        select: { id_evento_processo: true },
      })
    : await tx.eventos.create({
        data,
        select: { id_evento_processo: true },
      });

  seedResults.push({
    model: 'eventos',
    label: `${alarm.scenario.title}_EVENTO`,
    id: event.id_evento_processo,
    action: existing ? 'updated' : 'created',
  });
}

async function ensureAlarmLogs(
  tx: SeedTx,
  seedResults: SeedRecordResult[],
  userId: number,
  alarm: SeededAlarm,
): Promise<void> {
  await ensureLog(tx, seedResults, {
    label: `${alarm.scenario.title}_LOG_CRIACAO`,
    id_usuario: userId,
    id_processo: alarm.scenario.process.id_processo,
    acao: `ALARME_CRIADO_${alarm.scenario.suffix}`,
    descricao: alarm.scenario.logDescription,
    resultado: resultadooperacao.SUCESSO,
    criado_em: alarm.scenario.occurredAt,
  });

  if (alarm.scenario.status === statusalarme.RESOLVIDO) {
    await ensureLog(tx, seedResults, {
      label: `${alarm.scenario.title}_LOG_RESOLUCAO`,
      id_usuario: userId,
      id_processo: alarm.scenario.process.id_processo,
      acao: alarm.scenario.logAction,
      descricao: `Seed Fase 3 marcou resolucao do alarme ${alarm.id_alarme}.`,
      resultado: resultadooperacao.SUCESSO,
      criado_em: alarm.scenario.resolvedAt ?? alarm.scenario.occurredAt,
    });
  }
}

async function ensureLog(
  tx: SeedTx,
  seedResults: SeedRecordResult[],
  input: {
    label: string;
    id_usuario: number;
    id_processo: number;
    acao: string;
    descricao: string;
    resultado: resultadooperacao;
    criado_em: Date;
  },
): Promise<void> {
  const existing = await tx.logsoperacionais.findFirst({
    where: {
      id_processo: input.id_processo,
      acao: input.acao,
      criado_em: input.criado_em,
    },
    select: { id_log_operacional: true },
  });
  const data = {
    id_usuario: input.id_usuario,
    id_processo: input.id_processo,
    tipo_log: tipologoperacional.ALARME,
    acao: input.acao,
    descricao: input.descricao,
    origem: origemlogoperacional.SISTEMA,
    resultado: input.resultado,
    criado_em: input.criado_em,
  };

  const log = existing
    ? await tx.logsoperacionais.update({
        where: { id_log_operacional: existing.id_log_operacional },
        data,
        select: { id_log_operacional: true },
      })
    : await tx.logsoperacionais.create({
        data,
        select: { id_log_operacional: true },
      });

  seedResults.push({
    model: 'logsoperacionais',
    label: input.label,
    id: log.id_log_operacional,
    action: existing ? 'updated' : 'created',
  });
}

function buildCouplingDescription(couplingSensorId: number | null): string {
  if (!couplingSensorId) {
    return 'Mangueira desacoplada registrada sem vinculo direto ao sensor porque o schema de alarmes nao possui id_sensor direto.';
  }

  return `Mangueira desacoplada detectada pelo sensor de acoplamento ${couplingSensorId}; o alarme fica no tanque/processo porque o schema nao possui id_sensor direto.`;
}

function mapAlarmOriginToEventOrigin(origin: origemalarme): origemevento {
  const map: Record<origemalarme, origemevento> = {
    [origemalarme.SENSOR]: origemevento.SENSOR,
    [origemalarme.ESP32]: origemevento.ESP32,
    [origemalarme.MQTT]: origemevento.MQTT,
    [origemalarme.BACKEND]: origemevento.BACKEND,
    [origemalarme.SISTEMA]: origemevento.SISTEMA,
    [origemalarme.USUARIO]: origemevento.USUARIO,
  };

  return map[origin];
}

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`validation_seed_failed ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
