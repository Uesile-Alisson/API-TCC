require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Validacao de politica de alarmes bloqueada em production.');
}

const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const {
  faseprocesso,
  modooperacaoauxiliar,
  motivoresolucaoalarme,
  origemalarme,
  severidadealarme,
  statusalarme,
  statusprocesso,
  tipoalarme,
} = require('@prisma/client');

const BASE_URL =
  process.env.ALARM_POLICY_API_BASE_URL ?? 'http://127.0.0.1:3000/api';
const TECNICO_LOGIN = process.env.ALARM_POLICY_TECNICO_LOGIN ?? 'julio';
const TECNICO_PASSWORD =
  process.env.ALARM_POLICY_TECNICO_PASSWORD ??
  process.env.DEV_TECNICO_PASSWORD ??
  'Tecnico@123';
const OPERADOR_LOGIN = process.env.ALARM_POLICY_OPERADOR_LOGIN ?? 'pedro';
const OPERADOR_PASSWORD =
  process.env.ALARM_POLICY_OPERADOR_PASSWORD ??
  process.env.DEV_OPERADOR_PASSWORD ??
  'Operador@123';
const VALIDATION_PREFIX = '[VALIDAÇÃO DEV - ALARM_POLICY]';
const MANIFEST_PATH = path.join(
  __dirname,
  '.tmp',
  'alarm-resolution-policy-validation-last-run.json',
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function signIn(login, senha) {
  const response = await request('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ login, senha }),
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Login falhou para ${login}. Status: ${response.status}`);
  }

  if (typeof response.body?.access_token !== 'string') {
    throw new Error(`Login de ${login} nao retornou access_token.`);
  }

  return response.body;
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
  };
}

async function createValidationProcess(idUsuario, status, label) {
  const now = new Date();

  return prisma.processos.create({
    data: {
      id_usuario: idUsuario,
      nome_processo: `${VALIDATION_PREFIX} Processo ${label} ${uniqueSuffix()}`,
      status_processo: status,
      fase_processo:
        status === statusprocesso.CONFIGURADO
          ? faseprocesso.CONFIGURACAO
          : faseprocesso.GERANDO_VACUO,
      vacuo_alvo: -80,
      tempo_maximo: 900,
      modo_operacao_auxiliar: modooperacaoauxiliar.AUTOMATICO,
      processosauxiliares: {
        create: {},
      },
      iniciado_em: status === statusprocesso.CONFIGURADO ? null : new Date(now),
      pausado_em: status === statusprocesso.PAUSADO ? new Date(now) : null,
      finalizado_em: [
        statusprocesso.CONCLUIDO,
        statusprocesso.INTERROMPIDO,
        statusprocesso.FALHA,
      ].includes(status)
        ? new Date(now)
        : null,
    },
    select: {
      id_processo: true,
      status_processo: true,
    },
  });
}

async function createAlarm(input) {
  return prisma.alarmes.create({
    data: {
      titulo: input.titulo,
      descricao: input.descricao,
      tipo_alarme: tipoalarme.PROCESSO,
      severidade: input.severidade,
      status_alarme: input.status,
      origem_alarme: origemalarme.BACKEND,
      ocorrido_em: new Date(),
      id_processo: input.idProcesso ?? null,
      normalizado_em:
        input.status === statusalarme.NORMALIZADO ? new Date() : null,
      resolvido_em: input.status === statusalarme.RESOLVIDO ? new Date() : null,
      id_usuario_responsavel:
        input.status === statusalarme.RESOLVIDO ? input.idUsuario : null,
      motivo_resolucao:
        input.status === statusalarme.RESOLVIDO
          ? motivoresolucaoalarme.FECHAMENTO_POS_PROCESSO
          : null,
      bloqueante: Boolean(input.bloqueante),
      requer_intervencao: Boolean(input.requerIntervencao),
      recuperacao_automatica: Boolean(input.recuperacaoAutomatica),
    },
    select: {
      id_alarme: true,
      status_alarme: true,
      severidade: true,
      id_processo: true,
    },
  });
}

async function resolveAlarm(method, idAlarme, token) {
  return request(`/alarmes/${idAlarme}/resolver`, {
    method,
    headers: authHeaders(token),
    body: JSON.stringify({
      observacao: `${VALIDATION_PREFIX} Validacao automatizada ${method} ${new Date().toISOString()}`,
    }),
  });
}

async function acknowledgeAlarm(idAlarme, token) {
  return request(`/alarmes/${idAlarme}/reconhecer`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      observacao: `${VALIDATION_PREFIX} Validacao automatizada de reconhecimento.`,
    }),
  });
}

function validationTitle(value) {
  return `${VALIDATION_PREFIX} ${value}`;
}

function validationDescription(value) {
  return `${VALIDATION_PREFIX} ${value}`;
}

function writeManifest(manifest) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function getAlarm(idAlarme, token) {
  return request(`/alarmes/${idAlarme}`, {
    method: 'GET',
    headers: authHeaders(token),
  });
}

function assertStatus(label, response, expectedStatus) {
  if (response.status !== expectedStatus) {
    throw new Error(
      `${label}: esperado HTTP ${expectedStatus}, recebido ${response.status}.`,
    );
  }
}

async function main() {
  const tecnico = await signIn(TECNICO_LOGIN, TECNICO_PASSWORD);
  const operador = await signIn(OPERADOR_LOGIN, OPERADOR_PASSWORD);
  const tecnicoToken = tecnico.access_token;
  const operadorToken = operador.access_token;
  const tecnicoId = tecnico.usuario?.id_usuario;

  if (!Number.isInteger(tecnicoId)) {
    throw new Error('Login tecnico nao retornou id_usuario valido.');
  }

  const processes = {
    emExecucao: await createValidationProcess(
      tecnicoId,
      statusprocesso.EM_EXECUCAO,
      'EM_EXECUCAO',
    ),
    pausado: await createValidationProcess(
      tecnicoId,
      statusprocesso.PAUSADO,
      'PAUSADO',
    ),
    configurado: await createValidationProcess(
      tecnicoId,
      statusprocesso.CONFIGURADO,
      'CONFIGURADO',
    ),
    concluido: await createValidationProcess(
      tecnicoId,
      statusprocesso.CONCLUIDO,
      'CONCLUIDO',
    ),
    interrompido: await createValidationProcess(
      tecnicoId,
      statusprocesso.INTERROMPIDO,
      'INTERROMPIDO',
    ),
    falha: await createValidationProcess(
      tecnicoId,
      statusprocesso.FALHA,
      'FALHA',
    ),
  };

  const processIds = Object.values(processes).map(
    (processo) => processo.id_processo,
  );

  const alarms = {
    ativoEmExecucao: await createAlarm({
      titulo: validationTitle('ATIVO EM EXECUCAO'),
      descricao: validationDescription(
        'Massa artificial criada para validar bloqueio 409 em processo EM_EXECUCAO.',
      ),
      severidade: severidadealarme.MEDIO,
      status: statusalarme.ATIVO,
      idProcesso: processes.emExecucao.id_processo,
    }),
    ativoPausado: await createAlarm({
      titulo: validationTitle('ATIVO PAUSADO'),
      descricao: validationDescription(
        'Massa artificial criada para validar bloqueio 409 em processo PAUSADO.',
      ),
      severidade: severidadealarme.CRITICO,
      status: statusalarme.ATIVO,
      idProcesso: processes.pausado.id_processo,
    }),
    ativoConfigurado: await createAlarm({
      titulo: validationTitle('ATIVO CONFIGURADO'),
      descricao: validationDescription(
        'Massa artificial criada para validar politica em processo CONFIGURADO.',
      ),
      severidade: severidadealarme.MEDIO,
      status: statusalarme.ATIVO,
      idProcesso: processes.configurado.id_processo,
    }),
    normalizadoConfigurado: await createAlarm({
      titulo: validationTitle('NORMALIZADO CONFIGURADO'),
      descricao: validationDescription(
        'Massa artificial criada para validar resolucao de alarme NORMALIZADO em CONFIGURADO.',
      ),
      severidade: severidadealarme.MEDIO,
      status: statusalarme.NORMALIZADO,
      idProcesso: processes.configurado.id_processo,
    }),
    ativoConcluido: await createAlarm({
      titulo: validationTitle('ATIVO CONCLUIDO'),
      descricao: validationDescription(
        'Massa artificial criada para validar fechamento pos-processo CONCLUIDO.',
      ),
      severidade: severidadealarme.INFO,
      status: statusalarme.ATIVO,
      idProcesso: processes.concluido.id_processo,
    }),
    ativoInterrompido: await createAlarm({
      titulo: validationTitle('ATIVO INTERROMPIDO'),
      descricao: validationDescription(
        'Massa artificial criada para validar fechamento pos-processo INTERROMPIDO.',
      ),
      severidade: severidadealarme.MEDIO,
      status: statusalarme.ATIVO,
      idProcesso: processes.interrompido.id_processo,
    }),
    ativoFalha: await createAlarm({
      titulo: validationTitle('ATIVO FALHA'),
      descricao: validationDescription(
        'Massa artificial criada para validar fechamento pos-processo FALHA.',
      ),
      severidade: severidadealarme.CRITICO,
      status: statusalarme.ATIVO,
      idProcesso: processes.falha.id_processo,
    }),
    ativoSemProcessoBloqueante: await createAlarm({
      titulo: validationTitle('ATIVO SEM PROCESSO BLOQUEANTE'),
      descricao: validationDescription(
        'Massa artificial criada para validar bloqueio de alarme bloqueante sem processo.',
      ),
      severidade: severidadealarme.CRITICO,
      status: statusalarme.ATIVO,
      bloqueante: true,
    }),
    normalizadoSemProcesso: await createAlarm({
      titulo: validationTitle('NORMALIZADO SEM PROCESSO'),
      descricao: validationDescription(
        'Massa artificial criada para validar resolucao de alarme normalizado sem processo.',
      ),
      severidade: severidadealarme.MEDIO,
      status: statusalarme.NORMALIZADO,
      bloqueante: true,
    }),
  };

  const alarmIds = Object.values(alarms).map((alarme) => alarme.id_alarme);

  const checks = {};

  checks.patchAtivoEmExecucao = await resolveAlarm(
    'PATCH',
    alarms.ativoEmExecucao.id_alarme,
    tecnicoToken,
  );
  assertStatus('PATCH ativo em execucao', checks.patchAtivoEmExecucao, 409);

  checks.postAtivoEmExecucao = await resolveAlarm(
    'POST',
    alarms.ativoEmExecucao.id_alarme,
    tecnicoToken,
  );
  assertStatus('POST ativo em execucao', checks.postAtivoEmExecucao, 409);

  checks.patchAtivoPausado = await resolveAlarm(
    'PATCH',
    alarms.ativoPausado.id_alarme,
    tecnicoToken,
  );
  assertStatus('PATCH ativo pausado', checks.patchAtivoPausado, 409);

  checks.postAtivoPausado = await resolveAlarm(
    'POST',
    alarms.ativoPausado.id_alarme,
    tecnicoToken,
  );
  assertStatus('POST ativo pausado', checks.postAtivoPausado, 409);

  checks.patchAtivoConfigurado = await resolveAlarm(
    'PATCH',
    alarms.ativoConfigurado.id_alarme,
    tecnicoToken,
  );
  assertStatus('PATCH ativo configurado', checks.patchAtivoConfigurado, 409);

  checks.patchNormalizadoConfigurado = await resolveAlarm(
    'PATCH',
    alarms.normalizadoConfigurado.id_alarme,
    tecnicoToken,
  );
  assertStatus(
    'PATCH normalizado configurado',
    checks.patchNormalizadoConfigurado,
    200,
  );

  checks.patchAtivoConcluido = await resolveAlarm(
    'PATCH',
    alarms.ativoConcluido.id_alarme,
    tecnicoToken,
  );
  assertStatus('PATCH ativo concluido', checks.patchAtivoConcluido, 200);

  checks.patchAtivoInterrompido = await resolveAlarm(
    'PATCH',
    alarms.ativoInterrompido.id_alarme,
    tecnicoToken,
  );
  assertStatus('PATCH ativo interrompido', checks.patchAtivoInterrompido, 200);

  checks.patchAtivoFalha = await resolveAlarm(
    'PATCH',
    alarms.ativoFalha.id_alarme,
    tecnicoToken,
  );
  assertStatus('PATCH ativo falha', checks.patchAtivoFalha, 200);

  checks.patchAtivoSemProcessoBloqueante = await resolveAlarm(
    'PATCH',
    alarms.ativoSemProcessoBloqueante.id_alarme,
    tecnicoToken,
  );
  assertStatus(
    'PATCH ativo sem processo bloqueante',
    checks.patchAtivoSemProcessoBloqueante,
    409,
  );

  checks.patchNormalizadoSemProcesso = await resolveAlarm(
    'PATCH',
    alarms.normalizadoSemProcesso.id_alarme,
    tecnicoToken,
  );
  assertStatus(
    'PATCH normalizado sem processo',
    checks.patchNormalizadoSemProcesso,
    200,
  );

  checks.reconhecerOperador = await acknowledgeAlarm(
    alarms.ativoEmExecucao.id_alarme,
    operadorToken,
  );
  assertStatus('POST reconhecer operador', checks.reconhecerOperador, 201);

  const acknowledgementId =
    checks.reconhecerOperador.body?.id_alarme_reconhecimento ??
    checks.reconhecerOperador.body?.id_reconhecimento ??
    null;

  checks.detalheAposReconhecer = await getAlarm(
    alarms.ativoEmExecucao.id_alarme,
    tecnicoToken,
  );
  assertStatus(
    'GET detalhe apos reconhecer',
    checks.detalheAposReconhecer,
    200,
  );

  if (checks.detalheAposReconhecer.body?.status_alarme !== statusalarme.ATIVO) {
    throw new Error(
      `Reconhecer alterou status_alarme para ${checks.detalheAposReconhecer.body?.status_alarme}.`,
    );
  }

  const response = {
    prefix: VALIDATION_PREFIX,
    baseUrl: BASE_URL,
    tecnico: {
      login: tecnico.usuario?.login,
      perfil: tecnico.usuario?.nivel_acesso?.nome,
    },
    operador: {
      login: operador.usuario?.login,
      perfil: operador.usuario?.nivel_acesso?.nome,
    },
    processos: processes,
    alarmes: alarms,
    checks: Object.fromEntries(
      Object.entries(checks).map(([key, value]) => [
        key,
        {
          status: value.status,
          status_alarme: value.body?.status_alarme,
          motivo_resolucao: value.body?.motivo_resolucao,
          message: value.body?.message,
        },
      ]),
    ),
  };

  writeManifest({
    prefix: VALIDATION_PREFIX,
    createdAt: new Date().toISOString(),
    processIds,
    alarmIds,
    acknowledgementIds: Number.isInteger(acknowledgementId)
      ? [acknowledgementId]
      : [],
    recoveryAttemptIds: [],
  });

  process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
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
