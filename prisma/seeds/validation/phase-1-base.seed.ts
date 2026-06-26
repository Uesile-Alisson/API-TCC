import {
  Prisma,
  StatusAcoplamentoMangueira,
  StatusValvula,
  TipoValvula,
  funcaovalvula,
  protocolosensor,
  statusbomba,
  statusconexaomqtt,
  statusgeralsistema,
  statussensor,
  statustanque,
  tipobomba,
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

type SeedTx = Prisma.TransactionClient;

interface NamedRecord {
  nome: string;
}

interface SeedTankInput {
  nome: string;
  volume: string;
  vacuoPadrao: string;
  statusTanque: statustanque;
}

interface SeedSensorInput {
  nome: string;
  modelo: string;
  protocolo: protocolosensor;
  unidadeMedida: string;
  precisao: string;
  statusSensor: statussensor;
  tipoSensor: tiposensor;
  fatorCalibracao: string;
}

interface SeedPumpInput {
  nome: string;
  tipoBomba: tipobomba;
  statusPadrao: statusbomba;
  entradaPorPressao: boolean;
  entradaPorTempo: boolean;
  encerramentoAutomatico: boolean;
}

interface SeedContext {
  tankIds: number[];
  pumpIds: number[];
}

async function main(): Promise<void> {
  assertValidationSeedAllowed();

  const results = await prisma.$transaction(async (tx) => {
    const seedResults: SeedRecordResult[] = [];
    const config = await ensureSystemConfig(tx, seedResults);

    await ensureMqttConfig(tx, seedResults);

    const tanks = await ensureTanks(tx, seedResults);
    const pumps = await ensurePumps(
      tx,
      seedResults,
      config.id_configuracao_sistema,
    );
    await ensureVacuumSensors(tx, seedResults);
    await ensureCouplingSensors(tx, seedResults, tanks);

    await ensureValves(tx, seedResults, {
      tankIds: tanks.map((tank) => tank.id_tanque),
      pumpIds: pumps.map((pump) => pump.id_bomba),
    });

    return seedResults;
  });

  printSeedSummary(results);
}

async function ensureSystemConfig(
  tx: SeedTx,
  results: SeedRecordResult[],
): Promise<{ id_configuracao_sistema: number }> {
  const data = {
    tempo_maximo_padrao: 1800,
    encerramento_automatico: true,
    limite_seguranca_vacuo: new Prisma.Decimal('85.000'),
    vacuo_padrao: new Prisma.Decimal('50.000'),
    quantidade_maxima_tanques: 3,
    status_geral_sistema: statusgeralsistema.OPERACIONAL,
    versao_sistema: '1.0.0-validacao',
    tolerancia_vacuo_percentual: new Prisma.Decimal('10.00'),
    limite_nivel_maximo_percentual: new Prisma.Decimal('95.00'),
    tolerancia_volume_percentual: new Prisma.Decimal('5.00'),
    vazao_minima_l_min: new Prisma.Decimal('0.100'),
    vazao_maxima_l_min: new Prisma.Decimal('5.000'),
    atualizado_em: new Date(),
  };
  const existing = await tx.configuracoessistema.findFirst({
    orderBy: { id_configuracao_sistema: 'asc' },
    select: { id_configuracao_sistema: true },
  });

  if (existing) {
    const updated = await tx.configuracoessistema.update({
      where: {
        id_configuracao_sistema: existing.id_configuracao_sistema,
      },
      data,
      select: { id_configuracao_sistema: true },
    });

    results.push({
      model: 'configuracoessistema',
      label: 'singleton',
      id: updated.id_configuracao_sistema,
      action: 'updated',
    });

    return updated;
  }

  const created = await tx.configuracoessistema.create({
    data,
    select: { id_configuracao_sistema: true },
  });

  results.push({
    model: 'configuracoessistema',
    label: 'singleton',
    id: created.id_configuracao_sistema,
    action: 'created',
  });

  return created;
}

async function ensureMqttConfig(
  tx: SeedTx,
  results: SeedRecordResult[],
): Promise<void> {
  const label = 'MQTT_PRINCIPAL';
  const existing = await tx.mqttconfiguracoes.findUnique({
    where: { chave_configuracao: label },
    select: { id_mqtt_configuracao: true },
  });
  const record = await tx.mqttconfiguracoes.upsert({
    where: { chave_configuracao: label },
    update: {
      broker_url: 'mqtt://localhost:1883',
      porta: 1883,
      topico_leituras: 'tsea/leituras',
      topico_comandos: 'tsea/comandos',
      topico_status: 'tsea/status',
      topico_alarmes: 'tsea/alarmes',
      topico_heartbeat: 'tsea/heartbeat',
      topico_acoplamentos: 'tsea/acoplamentos',
      reconexao_automatica: true,
      timeout_comunicacao: 1000,
      status_conexao: statusconexaomqtt.DESCONECTADO,
      ativo: true,
      atualizado_em: new Date(),
      usuario_mqtt: null,
      senha_mqtt_hash: null,
      ultima_falha: null,
    },
    create: {
      chave_configuracao: label,
      broker_url: 'mqtt://localhost:1883',
      porta: 1883,
      topico_leituras: 'tsea/leituras',
      topico_comandos: 'tsea/comandos',
      topico_status: 'tsea/status',
      topico_alarmes: 'tsea/alarmes',
      topico_heartbeat: 'tsea/heartbeat',
      topico_acoplamentos: 'tsea/acoplamentos',
      reconexao_automatica: true,
      timeout_comunicacao: 1000,
      status_conexao: statusconexaomqtt.DESCONECTADO,
      ativo: true,
    },
    select: { id_mqtt_configuracao: true },
  });

  results.push({
    model: 'mqttconfiguracoes',
    label,
    id: record.id_mqtt_configuracao,
    action: existing ? 'updated' : 'created',
  });
}

async function ensureTanks(
  tx: SeedTx,
  results: SeedRecordResult[],
): Promise<Array<{ id_tanque: number; nome: string }>> {
  const tanks: SeedTankInput[] = [
    {
      nome: `${VALIDATION_PREFIX}TANQUE_01`,
      volume: '120.00',
      vacuoPadrao: '45.000',
      statusTanque: statustanque.ATIVO,
    },
    {
      nome: `${VALIDATION_PREFIX}TANQUE_02`,
      volume: '250.00',
      vacuoPadrao: '50.000',
      statusTanque: statustanque.ATIVO,
    },
    {
      nome: `${VALIDATION_PREFIX}TANQUE_03`,
      volume: '400.00',
      vacuoPadrao: '55.000',
      statusTanque: statustanque.MANUTENCAO,
    },
  ];

  const records: Array<{ id_tanque: number; nome: string }> = [];

  for (const tank of tanks) {
    const existing = await tx.tanques.findUnique({
      where: { nome: tank.nome },
      select: { id_tanque: true },
    });
    const record = await tx.tanques.upsert({
      where: { nome: tank.nome },
      update: {
        volume: new Prisma.Decimal(tank.volume),
        unidade_volume: 'L',
        vacuo_padrao: new Prisma.Decimal(tank.vacuoPadrao),
        status_tanque: tank.statusTanque,
        excluido_em: null,
        atualizado_em: new Date(),
      },
      create: {
        nome: tank.nome,
        volume: new Prisma.Decimal(tank.volume),
        unidade_volume: 'L',
        vacuo_padrao: new Prisma.Decimal(tank.vacuoPadrao),
        status_tanque: tank.statusTanque,
      },
      select: { id_tanque: true, nome: true },
    });

    records.push(record);
    pushNamedResult(
      results,
      'tanques',
      record,
      existing ? 'updated' : 'created',
    );
  }

  return records;
}

async function ensurePumps(
  tx: SeedTx,
  results: SeedRecordResult[],
  configId: number,
): Promise<Array<{ id_bomba: number; nome: string }>> {
  const pumps: SeedPumpInput[] = [
    {
      nome: `${VALIDATION_PREFIX}BOMBA_01`,
      tipoBomba: tipobomba.PRINCIPAL,
      statusPadrao: statusbomba.ATIVA,
      entradaPorPressao: true,
      entradaPorTempo: false,
      encerramentoAutomatico: true,
    },
    {
      nome: `${VALIDATION_PREFIX}BOMBA_02`,
      tipoBomba: tipobomba.AUXILIAR,
      statusPadrao: statusbomba.ATIVA,
      entradaPorPressao: false,
      entradaPorTempo: true,
      encerramentoAutomatico: true,
    },
  ];
  const records: Array<{ id_bomba: number; nome: string }> = [];

  for (const pump of pumps) {
    const existing = await tx.bombas.findUnique({
      where: { nome: pump.nome },
      select: { id_bomba: true },
    });
    const record = await tx.bombas.upsert({
      where: { nome: pump.nome },
      update: {
        id_configuracao_sistema: configId,
        tipo_bomba: pump.tipoBomba,
        status_padrao: pump.statusPadrao,
        entrada_por_pressao: pump.entradaPorPressao,
        entrada_por_tempo: pump.entradaPorTempo,
        encerramento_automatico: pump.encerramentoAutomatico,
        atualizado_em: new Date(),
      },
      create: {
        id_configuracao_sistema: configId,
        nome: pump.nome,
        tipo_bomba: pump.tipoBomba,
        status_padrao: pump.statusPadrao,
        entrada_por_pressao: pump.entradaPorPressao,
        entrada_por_tempo: pump.entradaPorTempo,
        encerramento_automatico: pump.encerramentoAutomatico,
      },
      select: { id_bomba: true, nome: true },
    });

    records.push(record);
    pushNamedResult(
      results,
      'bombas',
      record,
      existing ? 'updated' : 'created',
    );
  }

  return records;
}

async function ensureVacuumSensors(
  tx: SeedTx,
  results: SeedRecordResult[],
): Promise<Array<{ id_sensor: number; nome: string }>> {
  const sensors: SeedSensorInput[] = [
    {
      nome: `${VALIDATION_PREFIX}VACUO_01`,
      modelo: 'VALIDACAO-VAC-01',
      protocolo: protocolosensor.I2C,
      unidadeMedida: 'kPa',
      precisao: '0.100',
      statusSensor: statussensor.ATIVO,
      tipoSensor: tiposensor.VACUO,
      fatorCalibracao: '1.0000',
    },
    {
      nome: `${VALIDATION_PREFIX}VACUO_02`,
      modelo: 'VALIDACAO-VAC-02',
      protocolo: protocolosensor.ANALOGICO,
      unidadeMedida: 'kPa',
      precisao: '0.100',
      statusSensor: statussensor.ATIVO,
      tipoSensor: tiposensor.VACUO,
      fatorCalibracao: '1.0000',
    },
    {
      nome: `${VALIDATION_PREFIX}VACUO_03`,
      modelo: 'VALIDACAO-VAC-03',
      protocolo: protocolosensor.DIGITAL,
      unidadeMedida: 'kPa',
      precisao: '0.200',
      statusSensor: statussensor.INATIVO,
      tipoSensor: tiposensor.VACUO,
      fatorCalibracao: '1.0000',
    },
  ];

  return ensureSensors(tx, results, sensors);
}

async function ensureCouplingSensors(
  tx: SeedTx,
  results: SeedRecordResult[],
  tanks: Array<{ id_tanque: number; nome: string }>,
): Promise<Array<{ id_sensor: number; nome: string }>> {
  const sensorInputs: SeedSensorInput[] = [
    {
      nome: `${VALIDATION_PREFIX}ACOPLAMENTO_01`,
      modelo: 'VALIDACAO-ACOP-01',
      protocolo: protocolosensor.DIGITAL,
      unidadeMedida: 'bool',
      precisao: '1.000',
      statusSensor: statussensor.ATIVO,
      tipoSensor: tiposensor.ACOPLAMENTO,
      fatorCalibracao: '1.0000',
    },
    {
      nome: `${VALIDATION_PREFIX}ACOPLAMENTO_02`,
      modelo: 'VALIDACAO-ACOP-02',
      protocolo: protocolosensor.DIGITAL,
      unidadeMedida: 'bool',
      precisao: '1.000',
      statusSensor: statussensor.ATIVO,
      tipoSensor: tiposensor.ACOPLAMENTO,
      fatorCalibracao: '1.0000',
    },
  ];
  const sensors = await ensureSensors(tx, results, sensorInputs);
  const statuses = [
    StatusAcoplamentoMangueira.ACOPLADA,
    StatusAcoplamentoMangueira.DESACOPLADA,
  ];

  for (let index = 0; index < sensors.length; index += 1) {
    const sensor = sensors[index];
    const tank = tanks[index];

    if (!tank) {
      throw new Error(
        'Tanque de validacao ausente para sensor de acoplamento.',
      );
    }

    const existing = await tx.sensoresacoplamentomangueiras.findUnique({
      where: { id_sensor: sensor.id_sensor },
      select: { id_sensor: true },
    });
    const dataBase = {
      id_tanque: tank.id_tanque,
      status_acoplamento: statuses[index],
      sinal_detectado: statuses[index] === StatusAcoplamentoMangueira.ACOPLADA,
      ativo: true,
    };

    if (existing) {
      results.push({
        model: 'sensoresacoplamentomangueiras',
        label: sensor.nome,
        id: sensor.id_sensor,
        action: 'updated',
      });
    } else {
      await tx.sensoresacoplamentomangueiras.create({
        data: {
          id_sensor: sensor.id_sensor,
          ...dataBase,
        },
      });
      results.push({
        model: 'sensoresacoplamentomangueiras',
        label: sensor.nome,
        id: sensor.id_sensor,
        action: 'created',
      });
    }
  }

  return sensors;
}

async function ensureSensors(
  tx: SeedTx,
  results: SeedRecordResult[],
  sensors: SeedSensorInput[],
): Promise<Array<{ id_sensor: number; nome: string }>> {
  const records: Array<{ id_sensor: number; nome: string }> = [];

  for (const sensor of sensors) {
    const existing = await tx.sensores.findUnique({
      where: { nome: sensor.nome },
      select: { id_sensor: true },
    });
    const record = await tx.sensores.upsert({
      where: { nome: sensor.nome },
      update: {
        modelo: sensor.modelo,
        protocolo: sensor.protocolo,
        unidade_medida: sensor.unidadeMedida,
        precisao: new Prisma.Decimal(sensor.precisao),
        status_sensor: sensor.statusSensor,
        tipo_sensor: sensor.tipoSensor,
        fator_calibracao: new Prisma.Decimal(sensor.fatorCalibracao),
        excluido_em: null,
      },
      create: {
        nome: sensor.nome,
        modelo: sensor.modelo,
        protocolo: sensor.protocolo,
        unidade_medida: sensor.unidadeMedida,
        precisao: new Prisma.Decimal(sensor.precisao),
        status_sensor: sensor.statusSensor,
        tipo_sensor: sensor.tipoSensor,
        fator_calibracao: new Prisma.Decimal(sensor.fatorCalibracao),
      },
      select: { id_sensor: true, nome: true },
    });

    records.push(record);
    pushNamedResult(
      results,
      'sensores',
      record,
      existing ? 'updated' : 'created',
    );
  }

  return records;
}

async function ensureValves(
  tx: SeedTx,
  results: SeedRecordResult[],
  context: SeedContext,
): Promise<void> {
  const valves = [
    {
      pumpId: context.pumpIds[0],
      tankId: context.tankIds[0],
      numeroSaidaManifold: 1,
      nome: `${VALIDATION_PREFIX}VALVULA_01`,
      funcao: funcaovalvula.VACUO,
      status: StatusValvula.FECHADA,
      tipo: TipoValvula.SOLENOIDE,
    },
    {
      pumpId: context.pumpIds[0],
      tankId: context.tankIds[1],
      numeroSaidaManifold: 2,
      nome: `${VALIDATION_PREFIX}VALVULA_02`,
      funcao: funcaovalvula.FLUIDO,
      status: StatusValvula.FECHADA,
      tipo: TipoValvula.SOLENOIDE,
    },
    {
      pumpId: context.pumpIds[1],
      tankId: context.tankIds[2],
      numeroSaidaManifold: 1,
      nome: `${VALIDATION_PREFIX}VALVULA_03`,
      funcao: funcaovalvula.SEGURANCA,
      status: StatusValvula.DESCONHECIDA,
      tipo: TipoValvula.VAZAO,
    },
  ];

  for (const valve of valves) {
    if (valve.pumpId === undefined || valve.tankId === undefined) {
      throw new Error('Bomba ou tanque de validacao ausente para valvula.');
    }

    const existing = await tx.valvulas.findFirst({
      where: {
        id_bomba: valve.pumpId,
        numero_saida_manifold: valve.numeroSaidaManifold,
      },
      select: { id_valvula: true },
    });
    const data = {
      nome_valvula: valve.nome,
      tipo_valvula: valve.tipo,
      status_valvula: valve.status,
      ativo: true,
      funcao_valvula: valve.funcao,
      id_tanque: valve.tankId,
    };

    if (existing) {
      const updated = await tx.valvulas.update({
        where: { id_valvula: existing.id_valvula },
        data: {
          ...data,
          atualizado_em: new Date(),
        },
        select: { id_valvula: true },
      });

      results.push({
        model: 'valvulas',
        label: valve.nome,
        id: updated.id_valvula,
        action: 'updated',
      });
    } else {
      const created = await tx.valvulas.create({
        data: {
          id_bomba: valve.pumpId,
          numero_saida_manifold: valve.numeroSaidaManifold,
          ...data,
        },
        select: { id_valvula: true },
      });

      results.push({
        model: 'valvulas',
        label: valve.nome,
        id: created.id_valvula,
        action: 'created',
      });
    }
  }
}

function pushNamedResult(
  results: SeedRecordResult[],
  model: string,
  record: NamedRecord & { [key: string]: number | string },
  action: 'created' | 'updated',
): void {
  const idEntry = Object.entries(record).find(([key]) => key.startsWith('id_'));

  if (!idEntry || typeof idEntry[1] !== 'number') {
    throw new Error(`Registro sem identificador numerico para ${model}.`);
  }

  results.push({
    model,
    label: record.nome,
    id: idEntry[1],
    action,
  });
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
