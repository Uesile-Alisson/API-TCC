require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  throw new Error('Validacao de usuarios de desenvolvimento bloqueada em production.');
}

const BASE_URL = process.env.DEV_USERS_API_BASE_URL ?? 'http://localhost:3000/api';

const credentials = [
  {
    login: 'admin',
    password: process.env.DEV_ADMIN_PASSWORD ?? 'Admin@123',
    expectedRole: 'ADMINISTRADOR',
  },
  {
    login: 'tecnico',
    password: process.env.DEV_TECNICO_PASSWORD ?? 'Tecnico@123',
    expectedRole: 'TECNICO',
  },
  {
    login: 'operador',
    password: process.env.DEV_OPERADOR_PASSWORD ?? 'Operador@123',
    expectedRole: 'OPERADOR',
  },
];

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

async function signIn(login, password) {
  const response = await request('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ login, senha: password }),
  });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Login falhou para ${login}. Status: ${response.status}`);
  }

  const token = response.body?.access_token;

  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(`Token ausente no login de ${login}.`);
  }

  return token;
}

async function authenticatedGet(path, token) {
  return request(path, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

async function authenticatedPatch(path, token, body) {
  return request(path, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  const result = {
    baseUrl: BASE_URL,
    logins: [],
    permissions: {},
  };
  const tokens = {};

  for (const credential of credentials) {
    const token = await signIn(credential.login, credential.password);
    tokens[credential.login] = token;

    const me = await authenticatedGet('/auth/me', token);
    const role = me.body?.nivel_acesso;

    if (me.status !== 200 || role !== credential.expectedRole) {
      throw new Error(
        `/auth/me invalido para ${credential.login}. Status: ${me.status}. Perfil: ${String(role)}`,
      );
    }

    result.logins.push({
      login: credential.login,
      status: 'ok',
      role,
      primeiro_acesso: me.body?.primeiro_acesso,
    });
  }

  const noTokenMe = await request('/auth/me', { method: 'GET' });
  result.permissions.authMeSemToken = noTokenMe.status;

  const operadorConfig = await authenticatedGet(
    '/configuracoes/sistema',
    tokens.operador,
  );
  result.permissions.configuracoesOperador = operadorConfig.status;

  const tecnicoConfig = await authenticatedGet(
    '/configuracoes/sistema',
    tokens.tecnico,
  );
  result.permissions.configuracoesTecnico = tecnicoConfig.status;

  const operadorResolve = await authenticatedPatch(
    '/alarmes/1/resolver',
    tokens.operador,
    { observacao: 'Validacao de permissao OPERADOR.' },
  );
  result.permissions.resolverAlarmeOperador = operadorResolve.status;

  if (noTokenMe.status !== 401) {
    throw new Error(
      `Esperado 401 sem token em /auth/me. Recebido: ${noTokenMe.status}`,
    );
  }

  if (operadorConfig.status !== 403) {
    throw new Error(
      `Esperado 403 para OPERADOR em configuracoes. Recebido: ${operadorConfig.status}`,
    );
  }

  if (tecnicoConfig.status === 401 || tecnicoConfig.status === 403) {
    throw new Error(
      `TECNICO nao foi permitido em configuracoes. Status: ${tecnicoConfig.status}`,
    );
  }

  if (operadorResolve.status !== 403) {
    throw new Error(
      `Esperado 403 para OPERADOR resolver alarme. Recebido: ${operadorResolve.status}`,
    );
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Falha desconhecida'}\n`,
  );
  process.exit(1);
});
