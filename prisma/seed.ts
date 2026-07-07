import 'dotenv/config';
import bcrypt from 'bcrypt';
import {
  criticidadepermissao,
  faseprocesso,
  funcaovalvula,
  modulosistema,
  nivelacesso,
  origemlogoperacional,
  Prisma,
  PrismaClient,
  protocolosensor,
  resultadooperacao,
  StatusAcoplamentoMangueira,
  statusbomba,
  statusconexaomqtt,
  statusgeralsistema,
  statusprocesso,
  statussensor,
  statustanque,
  statustanqueprocesso,
  TipoValvula,
  StatusValvula,
  tipobomba,
  tipoleiturasensor,
  tipologoperacional,
  tiposensor,
  tiposensorprocesso,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

const now = (): Date => new Date();
const decimal = (value: string): Prisma.Decimal => new Prisma.Decimal(value);

type SeedUserInput = {
  nome: string;
  login: string;
  email: string;
  senha: string;
  nivel: nivelacesso;
};

type SeedTankInput = {
  nome: string;
  volume: string;
  codigo_hardware: string;
};

type SeedSensorInput = {
  nome: string;
  codigo_hardware: string;
  tipo_sensor: tiposensor;
  modelo: string;
  protocolo: protocolosensor;
  unidade_medida: string;
  precisao: string | null;
  ultimo_valor_lido: string | null;
};

type SeedValveInput = {
  nome_valvula: string;
  codigo_hardware: string;
  numero_saida_manifold: number;
  tanqueNome: string;
};

type PermissionRecord = Prisma.permissoesGetPayload<object>;
type ProcessTankRecord = Prisma.processostanquesGetPayload<object>;
type ProcessTankSensorRecord =
  Prisma.processostanquessensoresGetPayload<object>;

const levelInputs = [
  {
    nome: nivelacesso.OPERADOR,
    prioridade: 1,
    descricao:
      'Operador responsavel por acompanhar processos, visualizar dashboards e acionar parada de emergencia.',
  },
  {
    nome: nivelacesso.TECNICO,
    prioridade: 2,
    descricao:
      'Tecnico responsavel por configurar, iniciar, pausar, retomar e acompanhar processos operacionais.',
  },
  {
    nome: nivelacesso.ADMINISTRADOR,
    prioridade: 3,
    descricao:
      'Administrador com controle total do sistema, usuarios, configuracoes, backups e permissoes.',
  },
] as const;

const userInputs: SeedUserInput[] = [
  {
    nome: 'Wesley Alves de Carvalho',
    login: 'Wesley',
    email: 'wesley.admin@tsea.local',
    senha: 'Admin@123',
    nivel: nivelacesso.ADMINISTRADOR,
  },
  {
    nome: 'Julio Cossilo',
    login: 'julio',
    email: 'julio.tecnico@tsea.local',
    senha: 'Tecnico@123',
    nivel: nivelacesso.TECNICO,
  },
  {
    nome: 'Pedro Augusto',
    login: 'pedro',
    email: 'pedro.operador@tsea.local',
    senha: 'Operador@123',
    nivel: nivelacesso.OPERADOR,
  },
];

const tankInputs: SeedTankInput[] = [
  {
    nome: 'Tanque Regulador TR-01',
    volume: '20.00',
    codigo_hardware: 'TANQUE_1',
  },
  {
    nome: 'Tanque Regulador TR-02',
    volume: '20.00',
    codigo_hardware: 'TANQUE_2',
  },
  {
    nome: 'Tanque Regulador TR-03',
    volume: '20.00',
    codigo_hardware: 'TANQUE_3',
  },
];

const vacuumSensorInputs: SeedSensorInput[] = [
  {
    nome: 'Sensor de Vacuo TR-01',
    codigo_hardware: 'VACUO_T1',
    tipo_sensor: tiposensor.VACUO,
    modelo: 'XGZP6847D001MP',
    protocolo: protocolosensor.I2C,
    unidade_medida: 'kPa',
    precisao: '0.100',
    ultimo_valor_lido: '-80.000',
  },
  {
    nome: 'Sensor de Vacuo TR-02',
    codigo_hardware: 'VACUO_T2',
    tipo_sensor: tiposensor.VACUO,
    modelo: 'XGZP6847D001MP',
    protocolo: protocolosensor.I2C,
    unidade_medida: 'kPa',
    precisao: '0.100',
    ultimo_valor_lido: '-80.000',
  },
  {
    nome: 'Sensor de Vacuo TR-03',
    codigo_hardware: 'VACUO_T3',
    tipo_sensor: tiposensor.VACUO,
    modelo: 'XGZP6847D001MP',
    protocolo: protocolosensor.I2C,
    unidade_medida: 'kPa',
    precisao: '0.100',
    ultimo_valor_lido: '-80.000',
  },
];

const couplingSensorInputs: SeedSensorInput[] = [
  {
    nome: 'Sensor de Acoplamento TR-01',
    codigo_hardware: 'ACOP_T1',
    tipo_sensor: tiposensor.ACOPLAMENTO,
    modelo: 'Sensor de contato para acoplamento de mangueira',
    protocolo: protocolosensor.DIGITAL,
    unidade_medida: 'estado',
    precisao: null,
    ultimo_valor_lido: null,
  },
  {
    nome: 'Sensor de Acoplamento TR-02',
    codigo_hardware: 'ACOP_T2',
    tipo_sensor: tiposensor.ACOPLAMENTO,
    modelo: 'Sensor de contato para acoplamento de mangueira',
    protocolo: protocolosensor.DIGITAL,
    unidade_medida: 'estado',
    precisao: null,
    ultimo_valor_lido: null,
  },
  {
    nome: 'Sensor de Acoplamento TR-03',
    codigo_hardware: 'ACOP_T3',
    tipo_sensor: tiposensor.ACOPLAMENTO,
    modelo: 'Sensor de contato para acoplamento de mangueira',
    protocolo: protocolosensor.DIGITAL,
    unidade_medida: 'estado',
    precisao: null,
    ultimo_valor_lido: null,
  },
];

const valveInputs: SeedValveInput[] = [
  {
    nome_valvula: 'Valvula Solenoide de Vacuo TR-01',
    codigo_hardware: 'VP_T1',
    numero_saida_manifold: 1,
    tanqueNome: 'Tanque Regulador TR-01',
  },
  {
    nome_valvula: 'Valvula Solenoide de Vacuo TR-02',
    codigo_hardware: 'VP_T2',
    numero_saida_manifold: 2,
    tanqueNome: 'Tanque Regulador TR-02',
  },
  {
    nome_valvula: 'Valvula Solenoide de Vacuo TR-03',
    codigo_hardware: 'VP_T3',
    numero_saida_manifold: 3,
    tanqueNome: 'Tanque Regulador TR-03',
  },
];

const permissionsByModule: Record<modulosistema, string[]> = {
  [modulosistema.DASHBOARD]: ['VISUALIZAR'],
  [modulosistema.PROCESSOS]: [
    'VISUALIZAR',
    'CRIAR',
    'EDITAR',
    'EXECUTAR',
    'PARADA_EMERGENCIA',
  ],
  [modulosistema.HISTORICO]: ['VISUALIZAR'],
  [modulosistema.ALARMES]: ['VISUALIZAR', 'RESOLVER'],
  [modulosistema.RELATORIOS]: ['VISUALIZAR', 'GERAR_RELATORIO', 'BAIXAR'],
  [modulosistema.CONFIGURACOES]: ['VISUALIZAR', 'EDITAR', 'CONFIGURAR'],
  [modulosistema.USUARIOS]: ['VISUALIZAR', 'CRIAR', 'EDITAR', 'EXCLUIR'],
  [modulosistema.MQTT]: ['VISUALIZAR', 'CONFIGURAR', 'EXECUTAR'],
  [modulosistema.HARDWARE]: ['VISUALIZAR', 'CONFIGURAR', 'EXECUTAR'],
  [modulosistema.BACKUPS]: ['VISUALIZAR', 'BACKUP', 'RESTAURAR'],
  [modulosistema.SISTEMA]: ['VISUALIZAR', 'CONFIGURAR'],
};

async function main(): Promise<void> {
  const levels = await seedAccessLevels();
  const users = await seedUsers(levels);
  const admin = users.get(nivelacesso.ADMINISTRADOR);

  if (!admin) {
    throw new Error('Usuario administrador inicial nao foi criado.');
  }

  await seedPermissions(levels);
  const systemConfig = await seedSystemConfig(admin.id_usuario);
  await seedMqttConfig(admin.id_usuario);
  const tanks = await seedTanks();
  const vacuumSensors = await seedSensors(vacuumSensorInputs);
  const couplingSensors = await seedSensors(couplingSensorInputs);
  await seedCouplings(tanks, couplingSensors);
  const mainPump = await seedPumps(
    systemConfig.id_configuracao_sistema,
    admin.id_usuario,
  );
  await seedValves(mainPump.id_bomba, tanks);
  const process = await seedInitialProcess(admin.id_usuario);
  const processTanks = await seedProcessTanks(process.id_processo, tanks);
  const processTankSensors = await seedProcessTankSensors(
    processTanks,
    vacuumSensors,
  );
  await seedInitialReadings(processTankSensors);
  await seedOperationalLog(admin.id_usuario, process.id_processo);

  console.log('Seed oficial TSEA concluido com sucesso.');
}

async function seedAccessLevels() {
  const entries: Prisma.niveisacessosGetPayload<object>[] = [];

  for (const level of levelInputs) {
    const existingByName = await prisma.niveisacessos.findUnique({
      where: { nome: level.nome },
    });

    const existingByPriority = await prisma.niveisacessos.findUnique({
      where: { prioridade: level.prioridade },
    });

    if (existingByPriority && existingByPriority.nome !== level.nome) {
      await prisma.niveisacessos.update({
        where: { id_nivel_acesso: existingByPriority.id_nivel_acesso },
        data: {
          prioridade: existingByPriority.id_nivel_acesso + 100,
          atualizado_em: now(),
        },
      });
    }

    entries.push(
      existingByName
        ? await prisma.niveisacessos.update({
            where: { id_nivel_acesso: existingByName.id_nivel_acesso },
            data: {
              descricao: level.descricao,
              prioridade: level.prioridade,
              ativo: true,
              atualizado_em: now(),
            },
          })
        : await prisma.niveisacessos.create({
            data: {
              nome: level.nome,
              descricao: level.descricao,
              prioridade: level.prioridade,
              ativo: true,
            },
          }),
    );
  }

  return new Map(entries.map((level) => [level.nome, level]));
}

async function seedUsers(levels: Awaited<ReturnType<typeof seedAccessLevels>>) {
  const entries = await Promise.all(
    userInputs.map(async (user) => {
      const level = levels.get(user.nivel);
      if (!level) {
        throw new Error(`Nivel de acesso ausente: ${user.nivel}`);
      }

      const senha_hash = await bcrypt.hash(user.senha, 10);

      return prisma.usuarios.upsert({
        where: { login: user.login },
        update: {
          nome: user.nome,
          email: user.email,
          senha_hash,
          id_nivel_acesso: level.id_nivel_acesso,
          primeiro_acesso: false,
          atualizado_em: now(),
        },
        create: {
          nome: user.nome,
          login: user.login,
          email: user.email,
          senha_hash,
          id_nivel_acesso: level.id_nivel_acesso,
          primeiro_acesso: false,
        },
      });
    }),
  );

  return new Map(
    entries.map((user) => {
      const input = userInputs.find((item) => item.login === user.login);
      if (!input) {
        throw new Error(`Usuario sem entrada de seed: ${user.login}`);
      }
      return [input.nivel, user];
    }),
  );
}

async function seedPermissions(
  levels: Awaited<ReturnType<typeof seedAccessLevels>>,
): Promise<void> {
  const permissions: PermissionRecord[] = [];

  for (const [modulo, actions] of Object.entries(permissionsByModule)) {
    for (const acao of actions) {
      permissions.push(
        await prisma.permissoes.upsert({
          where: {
            modulo_acao: {
              modulo: modulo as modulosistema,
              acao,
            },
          },
          update: {
            descricao: `${acao} em ${modulo}.`,
            ativo: true,
            atualizado_em: now(),
          },
          create: {
            modulo: modulo as modulosistema,
            acao,
            descricao: `${acao} em ${modulo}.`,
            nivel_criticidade: resolvePermissionCriticality(acao),
            ativo: true,
          },
        }),
      );
    }
  }

  for (const level of levels.values()) {
    const allowed = permissions.filter((permission) =>
      isPermissionAllowed(level.nome, permission.modulo, permission.acao),
    );

    for (const permission of allowed) {
      await prisma.niveispermissoes.upsert({
        where: {
          id_nivel_acesso_id_permissao: {
            id_nivel_acesso: level.id_nivel_acesso,
            id_permissao: permission.id_permissao,
          },
        },
        update: {
          permitido: true,
          atualizado_em: now(),
        },
        create: {
          id_nivel_acesso: level.id_nivel_acesso,
          id_permissao: permission.id_permissao,
          permitido: true,
        },
      });
    }
  }
}

function resolvePermissionCriticality(acao: string): criticidadepermissao {
  if (['EXCLUIR', 'RESTAURAR', 'CONFIGURAR'].includes(acao)) {
    return criticidadepermissao.CRITICA;
  }

  if (['CRIAR', 'EDITAR', 'EXECUTAR', 'BACKUP'].includes(acao)) {
    return criticidadepermissao.MEDIA;
  }

  return criticidadepermissao.BAIXA;
}

function isPermissionAllowed(
  level: nivelacesso,
  modulo: modulosistema,
  acao: string,
): boolean {
  if (level === nivelacesso.ADMINISTRADOR) {
    return true;
  }

  if (level === nivelacesso.TECNICO) {
    return !(
      modulo === modulosistema.USUARIOS ||
      (modulo === modulosistema.BACKUPS && acao === 'RESTAURAR') ||
      acao === 'EXCLUIR'
    );
  }

  return (
    acao === 'VISUALIZAR' ||
    (modulo === modulosistema.ALARMES && acao === 'RESOLVER') ||
    (modulo === modulosistema.PROCESSOS && acao === 'PARADA_EMERGENCIA')
  );
}

async function seedSystemConfig(id_usuario_alteracao: number) {
  const existing = await prisma.configuracoessistema.findFirst({
    where: { versao_sistema: '1.0.0' },
    orderBy: { id_configuracao_sistema: 'desc' },
  });

  const data = {
    id_usuario_alteracao,
    tempo_maximo_padrao: 1800,
    encerramento_automatico: true,
    limite_seguranca_vacuo: decimal('-95.000'),
    vacuo_padrao: decimal('-80.000'),
    quantidade_maxima_tanques: 3,
    status_geral_sistema: statusgeralsistema.OPERACIONAL,
    versao_sistema: '1.0.0',
    tolerancia_vacuo_percentual: decimal('10.00'),
    limite_nivel_maximo_percentual: decimal('95.00'),
    tolerancia_volume_percentual: decimal('5.00'),
    vazao_minima_l_min: decimal('0.100'),
    vazao_maxima_l_min: decimal('5.000'),
    atualizado_em: now(),
  };

  if (existing) {
    return prisma.configuracoessistema.update({
      where: { id_configuracao_sistema: existing.id_configuracao_sistema },
      data,
    });
  }

  return prisma.configuracoessistema.create({ data });
}

async function seedMqttConfig(id_usuario_alteracao: number) {
  return prisma.mqttconfiguracoes.upsert({
    where: { chave_configuracao: 'MQTT_PRINCIPAL' },
    update: {
      id_usuario_alteracao,
      broker_url: 'mqtt://localhost',
      porta: 1883,
      usuario_mqtt: 'tsea_backend',
      senha_mqtt_hash: null,
      topico_leituras: 'tsea/leituras',
      topico_comandos: 'tsea/comandos',
      topico_status: 'tsea/status',
      topico_alarmes: 'tsea/alarmes',
      topico_heartbeat: 'tsea/heartbeat',
      topico_acoplamentos: 'tsea/acoplamentos',
      topico_configuracoes: 'tsea/config',
      topico_acks: 'tsea/acks',
      reconexao_automatica: true,
      timeout_comunicacao: 10000,
      status_conexao: statusconexaomqtt.DESCONECTADO,
      ativo: true,
      atualizado_em: now(),
    },
    create: {
      chave_configuracao: 'MQTT_PRINCIPAL',
      id_usuario_alteracao,
      broker_url: 'mqtt://localhost',
      porta: 1883,
      usuario_mqtt: 'tsea_backend',
      senha_mqtt_hash: null,
      topico_leituras: 'tsea/leituras',
      topico_comandos: 'tsea/comandos',
      topico_status: 'tsea/status',
      topico_alarmes: 'tsea/alarmes',
      topico_heartbeat: 'tsea/heartbeat',
      topico_acoplamentos: 'tsea/acoplamentos',
      topico_configuracoes: 'tsea/config',
      topico_acks: 'tsea/acks',
      reconexao_automatica: true,
      timeout_comunicacao: 10000,
      status_conexao: statusconexaomqtt.DESCONECTADO,
      ativo: true,
    },
  });
}

async function seedTanks() {
  const entries = await Promise.all(
    tankInputs.map((tank) =>
      prisma.tanques.upsert({
        where: { nome: tank.nome },
        update: {
          codigo_hardware: tank.codigo_hardware,
          volume: decimal(tank.volume),
          unidade_volume: 'L',
          vacuo_padrao: decimal('-80.000'),
          status_tanque: statustanque.ATIVO,
          atualizado_em: now(),
          excluido_em: null,
        },
        create: {
          nome: tank.nome,
          codigo_hardware: tank.codigo_hardware,
          volume: decimal(tank.volume),
          unidade_volume: 'L',
          vacuo_padrao: decimal('-80.000'),
          status_tanque: statustanque.ATIVO,
        },
      }),
    ),
  );

  return new Map(entries.map((tank) => [tank.nome, tank]));
}

async function seedSensors(inputs: SeedSensorInput[]) {
  const entries = await Promise.all(
    inputs.map((sensor) =>
      prisma.sensores.upsert({
        where: { nome: sensor.nome },
        update: {
          codigo_hardware: sensor.codigo_hardware,
          modelo: sensor.modelo,
          protocolo: sensor.protocolo,
          unidade_medida: sensor.unidade_medida,
          precisao: sensor.precisao ? decimal(sensor.precisao) : null,
          status_sensor: statussensor.ATIVO,
          tipo_sensor: sensor.tipo_sensor,
          ultimo_valor_lido: sensor.ultimo_valor_lido
            ? decimal(sensor.ultimo_valor_lido)
            : null,
          ultima_leitura: now(),
          excluido_em: null,
        },
        create: {
          nome: sensor.nome,
          codigo_hardware: sensor.codigo_hardware,
          modelo: sensor.modelo,
          protocolo: sensor.protocolo,
          unidade_medida: sensor.unidade_medida,
          precisao: sensor.precisao ? decimal(sensor.precisao) : null,
          status_sensor: statussensor.ATIVO,
          tipo_sensor: sensor.tipo_sensor,
          ultimo_valor_lido: sensor.ultimo_valor_lido
            ? decimal(sensor.ultimo_valor_lido)
            : null,
          ultima_leitura: now(),
        },
      }),
    ),
  );

  return new Map(entries.map((sensor) => [sensor.nome, sensor]));
}

async function seedCouplings(
  tanks: Awaited<ReturnType<typeof seedTanks>>,
  couplingSensors: Awaited<ReturnType<typeof seedSensors>>,
): Promise<void> {
  for (let index = 0; index < couplingSensorInputs.length; index += 1) {
    const sensor = couplingSensors.get(couplingSensorInputs[index].nome);
    const tank = tanks.get(tankInputs[index].nome);

    if (!sensor || !tank) {
      throw new Error('Sensor de acoplamento ou tanque ausente no seed.');
    }

    await prisma.sensoresacoplamentomangueiras.upsert({
      where: { id_sensor: sensor.id_sensor },
      update: {
        id_tanque: tank.id_tanque,
        status_acoplamento: StatusAcoplamentoMangueira.ACOPLADA,
        sinal_detectado: true,
        ultima_verificacao: now(),
        ultimo_evento_em: now(),
        ativo: true,
        atualizado_em: now(),
      },
      create: {
        id_sensor: sensor.id_sensor,
        id_tanque: tank.id_tanque,
        status_acoplamento: StatusAcoplamentoMangueira.ACOPLADA,
        sinal_detectado: true,
        ultima_verificacao: now(),
        ultimo_evento_em: now(),
        ativo: true,
      },
    });
  }
}

async function seedPumps(
  id_configuracao_sistema: number,
  id_usuario_alteracao: number,
) {
  await prisma.bombas.upsert({
    where: { nome: 'Bomba Auxiliar de Estabilizacao' },
    update: {
      id_configuracao_sistema,
      id_usuario_alteracao,
      tipo_bomba: tipobomba.AUXILIAR,
      codigo_hardware: 'BOMBA_VACUO_AUXILIAR',
      status_padrao: statusbomba.ATIVA,
      entrada_por_pressao: true,
      entrada_por_tempo: true,
      encerramento_automatico: true,
      atualizado_em: now(),
    },
    create: {
      id_configuracao_sistema,
      id_usuario_alteracao,
      nome: 'Bomba Auxiliar de Estabilizacao',
      codigo_hardware: 'BOMBA_VACUO_AUXILIAR',
      tipo_bomba: tipobomba.AUXILIAR,
      status_padrao: statusbomba.ATIVA,
      entrada_por_pressao: true,
      entrada_por_tempo: true,
      encerramento_automatico: true,
    },
  });

  return prisma.bombas.upsert({
    where: { nome: 'Bomba de Vacuo Principal' },
    update: {
      id_configuracao_sistema,
      id_usuario_alteracao,
      tipo_bomba: tipobomba.PRINCIPAL,
      codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
      status_padrao: statusbomba.ATIVA,
      entrada_por_pressao: false,
      entrada_por_tempo: false,
      encerramento_automatico: true,
      atualizado_em: now(),
    },
    create: {
      id_configuracao_sistema,
      id_usuario_alteracao,
      nome: 'Bomba de Vacuo Principal',
      codigo_hardware: 'BOMBA_VACUO_PRINCIPAL',
      tipo_bomba: tipobomba.PRINCIPAL,
      status_padrao: statusbomba.ATIVA,
      entrada_por_pressao: false,
      entrada_por_tempo: false,
      encerramento_automatico: true,
    },
  });
}

async function seedValves(
  id_bomba: number,
  tanks: Awaited<ReturnType<typeof seedTanks>>,
): Promise<void> {
  for (const valve of valveInputs) {
    const tank = tanks.get(valve.tanqueNome);
    if (!tank) {
      throw new Error(`Tanque ausente para valvula: ${valve.nome_valvula}`);
    }

    await prisma.valvulas.upsert({
      where: {
        id_bomba_numero_saida_manifold: {
          id_bomba,
          numero_saida_manifold: valve.numero_saida_manifold,
        },
      },
      update: {
        nome_valvula: valve.nome_valvula,
        codigo_hardware: valve.codigo_hardware,
        tipo_valvula: TipoValvula.SOLENOIDE,
        status_valvula: StatusValvula.FECHADA,
        funcao_valvula: funcaovalvula.VACUO,
        ativo: true,
        id_tanque: tank.id_tanque,
        atualizado_em: now(),
      },
      create: {
        id_bomba,
        numero_saida_manifold: valve.numero_saida_manifold,
        nome_valvula: valve.nome_valvula,
        codigo_hardware: valve.codigo_hardware,
        tipo_valvula: TipoValvula.SOLENOIDE,
        status_valvula: StatusValvula.FECHADA,
        funcao_valvula: funcaovalvula.VACUO,
        ativo: true,
        id_tanque: tank.id_tanque,
      },
    });
  }
}

async function seedInitialProcess(id_usuario: number) {
  const existing = await prisma.processos.findFirst({
    where: { nome_processo: 'Processo de Vacuo - Reguladores TR-01 a TR-03' },
  });

  const data = {
    id_usuario,
    nome_processo: 'Processo de Vacuo - Reguladores TR-01 a TR-03',
    status_processo: statusprocesso.CONFIGURADO,
    fase_processo: faseprocesso.CONFIGURACAO,
    vacuo_alvo: decimal('-80.000'),
    tempo_maximo: 1800,
    parada_emergencia: false,
  };

  if (existing) {
    return prisma.processos.update({
      where: { id_processo: existing.id_processo },
      data,
    });
  }

  return prisma.processos.create({ data });
}

async function seedProcessTanks(
  id_processo: number,
  tanks: Awaited<ReturnType<typeof seedTanks>>,
) {
  const entries: ProcessTankRecord[] = [];

  for (const tank of tanks.values()) {
    entries.push(
      await prisma.processostanques.upsert({
        where: {
          id_processo_id_tanque: {
            id_processo,
            id_tanque: tank.id_tanque,
          },
        },
        update: {
          vacuo_alvo: decimal('-80.000'),
          status_tanque_processo: statustanqueprocesso.CONFIGURADO,
          volume_alvo_ml: null,
          volume_enviado_ml: decimal('0.000'),
          vazao_atual_l_min: null,
          nivel_atual_percentual: null,
          vacuo_atingido: false,
          vacuo_estabilizado: false,
        },
        create: {
          id_processo,
          id_tanque: tank.id_tanque,
          vacuo_alvo: decimal('-80.000'),
          status_tanque_processo: statustanqueprocesso.CONFIGURADO,
          volume_alvo_ml: null,
          volume_enviado_ml: decimal('0.000'),
          vazao_atual_l_min: null,
          nivel_atual_percentual: null,
          vacuo_atingido: false,
          vacuo_estabilizado: false,
        },
      }),
    );
  }

  return new Map(
    entries.map((processTank) => [processTank.id_tanque, processTank]),
  );
}

async function seedProcessTankSensors(
  processTanks: Awaited<ReturnType<typeof seedProcessTanks>>,
  vacuumSensors: Awaited<ReturnType<typeof seedSensors>>,
) {
  const entries: ProcessTankSensorRecord[] = [];

  for (let index = 0; index < tankInputs.length; index += 1) {
    const tankName = tankInputs[index].nome;
    const processTank = Array.from(processTanks.values()).find(
      (item) => item.id_tanque === Array.from(processTanks.keys())[index],
    );
    const sensor = vacuumSensors.get(vacuumSensorInputs[index].nome);

    if (!processTank || !sensor) {
      throw new Error(`Associacao processo-tanque-sensor ausente: ${tankName}`);
    }

    entries.push(
      await prisma.processostanquessensores.upsert({
        where: {
          id_processo_tanque_id_sensor: {
            id_processo_tanque: processTank.id_processo_tanque,
            id_sensor: sensor.id_sensor,
          },
        },
        update: {
          ativo: true,
          removido_em: null,
          observacoes:
            'Sensor principal de vacuo do tanque no processo inicial.',
          tipo_sensor_processo: tiposensorprocesso.VACUO,
        },
        create: {
          id_processo_tanque: processTank.id_processo_tanque,
          id_sensor: sensor.id_sensor,
          ativo: true,
          observacoes:
            'Sensor principal de vacuo do tanque no processo inicial.',
          tipo_sensor_processo: tiposensorprocesso.VACUO,
        },
      }),
    );
  }

  return entries;
}

async function seedInitialReadings(
  processTankSensors: Awaited<ReturnType<typeof seedProcessTankSensors>>,
): Promise<void> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  for (const processTankSensor of processTankSensors) {
    const recentReading = await prisma.leiturasensores.findFirst({
      where: {
        id_processo_tanque_sensor: processTankSensor.id_processo_tanque_sensor,
        tipo_leitura: tipoleiturasensor.VACUO,
        leitura_em: {
          gte: fiveMinutesAgo,
        },
      },
      orderBy: {
        leitura_em: 'desc',
      },
    });

    if (recentReading) {
      continue;
    }

    await prisma.leiturasensores.create({
      data: {
        id_processo_tanque_sensor: processTankSensor.id_processo_tanque_sensor,
        tipo_leitura: tipoleiturasensor.VACUO,
        valor: decimal('-80.000'),
        valor_vacuo: decimal('-80.000'),
        unidade_medida: 'kPa',
        leitura_em: now(),
        recebido_em: now(),
      },
    });
  }
}

async function seedOperationalLog(
  id_usuario: number,
  id_processo: number,
): Promise<void> {
  const existing = await prisma.logsoperacionais.findFirst({
    where: {
      id_usuario,
      id_processo,
      acao: 'SEED_OFICIAL_TSEA',
    },
  });

  if (existing) {
    return;
  }

  await prisma.logsoperacionais.create({
    data: {
      id_usuario,
      id_processo,
      tipo_log: tipologoperacional.SISTEMA,
      acao: 'SEED_OFICIAL_TSEA',
      descricao: 'Carga inicial oficial do ambiente local/demo TSEA.',
      origem: origemlogoperacional.SISTEMA,
      resultado: resultadooperacao.SUCESSO,
    },
  });
}

main()
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Erro desconhecido';
    console.error(`Falha ao executar seed oficial TSEA: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
