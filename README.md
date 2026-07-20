# TSEA API

Backend NestJS do TSEA, responsavel por autenticacao, processos de vacuo, alarmes, historico, relatorios, configuracoes do sistema, configuracoes MQTT/hardware, backups e integracao com banco de dados, MQTT e armazenamento de relatorios.

## Visao Geral

O projeto expoe uma API HTTP com prefixo `/api`, documentacao Swagger opcional em `/docs`, validacao global de DTOs e protecao por JWT/roles. A API usa PostgreSQL via Prisma como base transacional principal e MongoDB/GridFS como armazenamento obrigatorio dos arquivos de relatorio.

```mermaid
flowchart LR
  Front["React/Vite"] --> API["NestJS API /api"]
  API --> PG["PostgreSQL + Prisma"]
  API --> Mongo["MongoDB/GridFS obrigatorio"]
  API --> Broker["Broker MQTT"]
  Broker --> ESP32["ESP32 / Hardware"]
  ESP32 --> Hardware["Sensores, bombas e valvulas"]
  API --> Socket["Socket.IO gateways"]
  Socket --> Front
```

## Modulos Principais

| Area               | Responsabilidade                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `auth`             | Login, JWT, primeiro acesso, recuperacao/redefinicao de senha e usuario autenticado.                      |
| `user`             | Gestao de usuarios e perfis de acesso.                                                                    |
| `processos`        | Criacao, acompanhamento, pre-checagem, inicio, pausa, retomada, finalizacao e interrupcao de processos.   |
| `alarmes`          | Registro, consulta, dashboard e resolucao de alarmes.                                                     |
| `leituras-eventos` | Leituras de sensores e eventos operacionais.                                                              |
| `historico`        | Historico operacional e rastreabilidade.                                                                  |
| `relatorios`       | Geracao, listagem, preview e download de relatorios PDF/XLSX.                                             |
| `configuracoes`    | Sistema, tanques, sensores, bombas e backups.                                                             |
| `mqtt-hardware`    | Configuracao MQTT, conexao com broker, comandos, status, leituras, valvulas e estado do hardware.         |
| `mongodb`          | Conexao MongoDB e suporte a GridFS para arquivos.                                                         |
| `security`         | Cabecalhos HTTP, rate limiting, erros padronizados e validacao contra padroes suspeitos de SQL injection. |

## Banco de Dados

O Prisma mapeia a base PostgreSQL. Entre os modelos existentes estao `usuarios`, `niveisacessos`, `permissoes`, `processos`, `tanques`, `bombas`, `sensores`, `valvulas`, `alarmes`, `eventos`, `leiturasensores`, `logsoperacionais`, `relatorios`, `backups`, `mqttconfiguracoes` e tabelas auxiliares de historico/relacionamento.

Relatorios mantem metadados no PostgreSQL e arquivos no MongoDB/GridFS. O campo `gridfs_file_id` liga o registro relacional ao arquivo armazenado no MongoDB.

## MQTT e Hardware

O modulo `mqtt-hardware` le no banco somente a configuracao operacional e os indicadores de credenciais. O usuario e a senha MQTT ficam exclusivamente em um arquivo seguro externo. O broker deve usar URL MQTT valida, por exemplo `mqtt://localhost:1883`.

Fluxo resumido:

1. A API carrega a configuracao MQTT ativa.
2. O cliente MQTT conecta ao broker.
3. O ESP32 publica status, heartbeat, leituras e estados de hardware.
4. A API processa eventos, atualiza registros e emite eventos em tempo real.
5. O frontend recebe atualizacoes por Socket.IO.

### Configuracao segura das credenciais MQTT

A API nao altera o `.env`, nao armazena usuario/senha MQTT no PostgreSQL e nao inicia o servico Mosquitto. O sistema operacional deve iniciar e supervisionar o broker. A variavel `MQTT_CREDENTIALS_FILE_PATH` informa somente o caminho absoluto do arquivo externo que sera gerenciado pela API.

O diretorio deve existir antes do primeiro cadastro. A API cria ou substitui apenas o arquivo final usando uma gravacao temporaria e atomica.

Windows, executando a API com o usuario atual:

```powershell
$mqttSecretsDir = 'C:\ProgramData\TSEA\secrets'
New-Item -ItemType Directory -Path $mqttSecretsDir -Force
icacls $mqttSecretsDir /inheritance:r
icacls $mqttSecretsDir /grant:r "${env:USERNAME}:(OI)(CI)F" "SYSTEM:(OI)(CI)F"
```

Se a API executar como servico, substitua `${env:USERNAME}` pela conta real do servico. Depois configure:

```env
MQTT_CREDENTIALS_FILE_PATH="C:/ProgramData/TSEA/secrets/mqtt-credentials.json"
MQTT_CLIENT_ID="tsea-api-servidor-01"
```

Linux, considerando uma conta de servico chamada `tsea-api`:

```bash
sudo install -d -m 700 -o tsea-api -g tsea-api /etc/tsea/secrets
```

```env
MQTT_CREDENTIALS_FILE_PATH="/etc/tsea/secrets/mqtt-credentials.json"
MQTT_CLIENT_ID="tsea-api-servidor-01"
```

No primeiro acesso, um administrador envia ambos os valores para `PUT /api/mqtt-hardware/credentials`:

```json
{
  "usuario_mqtt": "tsea_backend",
  "senha_mqtt": "SENHA_CONFIGURADA_NO_BROKER"
}
```

A API nao cria nem altera usuarios no Mosquitto. O par informado deve existir previamente no broker e possuir permissao de assinatura nos topicos operacionais.

Antes de substituir o arquivo externo, a API abre uma conexao temporaria com `clientId` exclusivo, sessao limpa e reconexao automatica desabilitada. Essa prova exige que o broker aceite as credenciais e todas as assinaturas usadas pela API. O cliente temporario nao publica comandos e e encerrado ao final do teste.

Se o broker recusar autenticacao ou assinatura, a API responde `422`, mantem o arquivo anterior e nao desconecta o cliente principal. Se o broker estiver indisponivel e a candidata nao puder ser confirmada, responde `503` com a mesma preservacao. Somente uma candidata aprovada e gravada; depois disso, o cliente principal e reconectado com o novo arquivo.

A troca de credenciais responde `409` e nao inicia o teste quando existe processo em partida, execucao ou pausa. Um lease persistido no PostgreSQL tambem impede que uma partida comece durante a troca. A verificacao do broker acontece fora da transacao do banco; antes de gravar o arquivo, a API renova o lease e confirma novamente que nenhum processo operacional foi iniciado. Em queda da API, o bloqueio expira automaticamente sem armazenar usuario ou senha no banco.

A resposta nunca contem usuario nem senha. Ela informa separadamente se as credenciais foram configuradas, se foram verificadas pelo broker e se o cliente esta conectado. Se o arquivo ou o broker estiver indisponivel, a API continua inicializando e os endpoints HTTP permanecem acessiveis para diagnostico/configuracao.

O teste so comprova autenticacao quando o listener do Mosquitto realmente recusa acesso anonimo. Em ambiente sem autenticacao, qualquer par pode ser aceito pelo broker e nao existe como a API distinguir esse caso pelo protocolo MQTT.

### Atualizacao segura da configuracao MQTT

`PATCH /api/mqtt-hardware/config` aplica broker, porta, topicos e parametros de conexao usando o fluxo `testar -> persistir -> reconectar -> confirmar`:

1. adquire o mesmo lease persistente usado pelas alteracoes MQTT e bloqueia a operacao quando existe processo em partida, execucao ou pausa;
2. monta e valida a configuracao candidata sem alterar o banco;
3. usa as credenciais do arquivo externo em um cliente temporario, sem reconexao automatica e sem publicar comandos;
4. exige conexao e `SUBACK` aceito para todos os seis topicos de entrada;
5. renova o lease, revalida a ausencia de processo operacional e somente entao grava a candidata e o historico;
6. reconecta o cliente principal, ativa o roteamento interno com os mesmos topicos e confirma que a configuracao conectada corresponde ao estado persistido.

Os topicos operacionais devem ser nomes exatos; curingas MQTT `+` e `#` sao recusados porque os mesmos campos orientam assinatura, roteamento interno e, em alguns casos, publicacao para o ESP32.

Se o teste temporario falhar, banco e cliente principal permanecem inalterados. Se a aplicacao principal falhar depois da gravacao, a API restaura o snapshot operacional anterior e tenta reconectar ao broker anterior antes de responder `503`. Durante a troca, comandos e acoes HTTP de conexao respondem `409`, e uma partida concorrente tambem e bloqueada pelo lease.

`GET /api/mqtt-hardware/config` e `PATCH /api/mqtt-hardware/config` retornam `connected` e `configuracao_aplicada`. `GET /api/mqtt-hardware/status` tambem retorna `mqtt.configuracao_aplicada`; quando ela for falsa, `CONFIGURACAO_MQTT_NAO_APLICADA` aparece em `bloqueios_comunicacao_processos` e o MQTT nao e considerado operacional.

### Intertravamento dos comandos administrativos MQTT

As operacoes HTTP de reconectar ou desconectar o cliente MQTT, sincronizar ou reiniciar a comunicacao do hardware, abrir ou fechar todas as valvulas e desligar todas as bombas adquirem um lease persistente antes de alterar a conexao ou publicar. A reserva e recusada com `409` e `MQTT_OPERATION_BLOCKED_BY_PROCESS_STATE` quando existe qualquer um destes bloqueios:

- processo em execucao ou pausado;
- partida em andamento;
- encerramento geral nao terminal;
- lifecycle ou encerramento individual de tanque nao terminal;
- lease humano ativo da bomba ou de uma valvula auxiliar.

A verificacao e a reserva acontecem na mesma transacao serializavel que bloqueia a linha da configuracao MQTT. Assim, uma partida concorrente nao pode entrar entre a verificacao do processo e a publicacao do comando. O lease tambem impede duas operacoes administrativas ou uma alteracao de configuracao/credenciais de executarem ao mesmo tempo, sendo liberado em `finally` e possuindo expiracao para recuperacao apos queda da API.

`POST /api/mqtt-hardware/commands/parada-emergencia` e a excecao explicita: permanece disponivel para `OPERADOR`, `TECNICO` e `ADMINISTRADOR`, nao solicita o lease operacional e nao e recusada por uma atualizacao MQTT local em andamento. A publicacao ainda depende de conectividade MQTT; se necessario, a API tenta conectar antes de enviar a parada com QoS 2.

### Intertravamento das configuracoes de equipamento

Criacao, edicao, ativacao ou desativacao de bombas, tanques e sensores, calibracao de sensores, alteracao da configuracao geral e restauracao de backup usam o mesmo intertravamento central. A escrita administrativa responde `409` com `EQUIPMENT_CONFIG_BLOCKED_BY_OPERATIONAL_STATE` durante partida, execucao, pausa, encerramento geral ou individual, lifecycle ativo de tanque ou lease humano. Uma operacao MQTT exclusiva concorrente responde `409` com `EQUIPMENT_CONFIG_BLOCKED_BY_MQTT_EXCLUSIVE_OPERATION`.

A verificacao e a gravacao ficam na mesma transacao serializavel, sob o mesmo bloqueio de linha adquirido pela partida do processo. Isso impede que uma alteracao seja autorizada com o equipamento ocioso e gravada depois que uma partida concorrente ja comecou; quando recusada, nenhuma parte da configuracao ou da restauracao e persistida.

Na restauracao, estados fisicos historicos das valvulas nao substituem a telemetria atual. Se o backup incluir MQTT, as credenciais externas voltam ao estado nao verificado, o cliente em memoria e desconectado e o monitor de saude recarrega a configuracao restaurada antes de uma nova partida ser permitida.

#### Configurar o Mosquitto local no Windows

O instalador do Mosquitto pode registrar o servico usando um `mosquitto.conf` sem diretivas ativas. Nesse estado, o broker 2.x abre apenas o listener local e aceita conexoes anonimas, portanto uma credencial invalida aparenta estar correta.

Com as credenciais externas ja gravadas em `MQTT_CREDENTIALS_FILE_PATH`, abra o PowerShell **como administrador**, entre na raiz desta API e execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\configure-local-mosquitto.ps1
```

O script [scripts/configure-local-mosquitto.ps1](scripts/configure-local-mosquitto.ps1):

- nao recebe nem imprime a senha;
- cria um arquivo temporario dentro do diretorio protegido, converte-o imediatamente para hash com `mosquitto_passwd -U` e remove qualquer temporario ao final, sem expor a senha na linha de comando;
- cria ACL `readwrite` limitada a `tsea/#` para o usuario configurado;
- adiciona `listener 1883`, `allow_anonymous false`, persistencia e logs;
- preserva um backup timestampado do `mosquitto.conf` original;
- cria regra de firewall somente para perfil `Private` e origem `LocalSubnet`;
- restaura o arquivo anterior se o servico nao reiniciar corretamente.

Se a rede do Windows estiver classificada como `Public`, a regra nao permite acesso do ESP32. Altere para `Private` somente em uma rede local confiavel antes do teste fisico. A API local continua acessando `localhost:1883` independentemente dessa regra.

### Bloqueio seguro da operacao

Criar, consultar e configurar processos continua permitido quando o MQTT ou o ESP32 esta indisponivel. Iniciar, retomar ou acionar hardware exige simultaneamente:

1. usuario e senha presentes no arquivo externo seguro;
2. credenciais aceitas pelo broker na execucao atual da API;
3. cliente MQTT conectado;
4. ESP32 online e com comunicacao operacional.

`GET /api/mqtt-hardware/status` retorna `mqtt.operacional`, `mqtt.configuracao_aplicada`, `comunicacao_pronta_para_processos` e `bloqueios_comunicacao_processos`. A pre-checagem de `GET /api/processos/:id/prechecagem` e `POST /api/processos/:id/prechecagem/executar` detalha separadamente `MQTT_CREDENCIAIS_CONFIGURADAS`, `MQTT_CREDENCIAIS_VERIFICADAS`, `MQTT_CONECTADO`, `MQTT_CONFIGURACAO_APLICADA` e `ESP32_COMUNICACAO_PRONTA`. O endpoint de inicio devolve conflito com o checklist completo quando qualquer item bloqueante falha.

O arquivo criado usa o seguinte contrato interno e nao deve ser versionado, enviado em backup ou editado pelo frontend diretamente:

```json
{
  "versao": 1,
  "usuario_mqtt": "VALOR_SIGILOSO",
  "senha_mqtt": "VALOR_SIGILOSO",
  "atualizado_em": "2026-07-17T12:00:00.000Z"
}
```

Em instalacoes com varias replicas da API, cada instancia precisa receber o mesmo segredo por um mecanismo seguro de provisionamento ou por um gerenciador de segredos. Nao use compartilhamento de rede gravavel por varios servidores sem coordenacao de concorrencia e controle de acesso.

Scripts de simulacao MQTT disponiveis:

| Script                     | Uso                                                          |
| -------------------------- | ------------------------------------------------------------ |
| `npm run sim:mqtt:preparo` | Prepara/simula estado online para validacao de pre-checagem. |
| `npm run sim:mqtt:sucesso` | Simula fluxo de processo com sucesso.                        |
| `npm run sim:mqtt:falha`   | Simula fluxo de processo com falha/interrupcao.              |

Para aprovar valvulas na pre-checagem com simulador, configure `TSEA_SIM_PUBLISH_STATUS=true` no arquivo local `.env.mqtt-sim`. Veja tambem `docs/mqtt-sim-scripts.md`.

## Requisitos

- Node.js compativel com NestJS usado pelo projeto.
- PostgreSQL acessivel pela variavel `DATABASE_URL`.
- MongoDB obrigatorio para armazenamento dos arquivos de relatorio no GridFS.
- Broker MQTT para integracao real ou simulada com hardware.

## Variaveis de Ambiente

Exemplo sem segredos reais:

```env
NODE_ENV="development"
PORT=3000
SWAGGER_ENABLED="true"
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"

JWT_SECRET="CHANGE_ME_IN_LOCAL_ENV"
JWT_EXPIRES_IN="1d"
CORS_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
TRUST_PROXY=""
HTTP_RATE_LIMIT_TTL_MS=60000
HTTP_RATE_LIMIT_MAX=120
HTTP_RATE_LIMIT_BLOCK_DURATION_MS=60000

MQTT_CREDENTIALS_FILE_PATH="C:/ProgramData/TSEA/secrets/mqtt-credentials.json"
MQTT_CLIENT_ID="tsea-api-servidor-01"

MONGODB_URI="mongodb://HOST:PORT"
```

Observacoes:

- A URL/topicos do broker MQTT ficam na configuracao persistida pelo modulo MQTT/hardware.
- O usuario e a senha MQTT ficam somente no arquivo apontado por `MQTT_CREDENTIALS_FILE_PATH`.
- `MONGODB_URI` e obrigatoria. A API recusa a inicializacao quando a variavel
  estiver ausente ou quando a conexao MongoDB nao puder ser estabelecida.
- `CORS_ALLOWED_ORIGINS` aceita uma lista de origens HTTP/HTTPS separadas por virgula. O curinga `*` e recusado na inicializacao.
- A configuracao e validada antes do bootstrap. Banco, MongoDB, JWT, e-mail e URL de redefinicao ausentes ou invalidos impedem a inicializacao com uma mensagem que identifica as chaves, sem imprimir seus valores.
- O Swagger so e montado quando `SWAGGER_ENABLED=true` e `NODE_ENV` nao e `production`. Em producao, `/docs`, `/docs-json` e `/docs-yaml` nao sao registrados.
- Nao versionar `.env` com credenciais reais.

### Protecoes HTTP

- Helmet e registrado antes do CORS e das rotas para aplicar os cabecalhos de seguranca em toda resposta HTTP. HSTS e habilitado somente em producao.
- O limite global usa `HTTP_RATE_LIMIT_MAX`, `HTTP_RATE_LIMIT_TTL_MS` e `HTTP_RATE_LIMIT_BLOCK_DURATION_MS`, por IP e por rota. Autenticacao, processos, MQTT/hardware, usuarios, backups e geracao de relatorios possuem limites mais restritivos.
- Respostas de erro usam `statusCode`, `error`, `message`, `timestamp`, `path` e `method`. Campos operacionais publicos existentes, como `code`, `reasons` e `checklist`, sao preservados; excecoes internas retornam somente uma mensagem generica.
- Sem proxy, mantenha `TRUST_PROXY` vazio. Atras de proxy, informe somente os IPs/CIDRs confiaveis ou nomes de sub-rede aceitos pelo Express, por exemplo `loopback` para um proxy local. Valores amplos como `true` ou `*` sao recusados para impedir falsificacao de `X-Forwarded-For`.
- O armazenamento atual do rate limiter continua em memoria e e local a cada processo. Em uma implantacao com varias replicas, cada instancia aplica seu proprio contador; configure um `ThrottlerStorage` compartilhado antes de depender de um limite agregado entre servidores.

### Seed de desenvolvimento

`npm run seed:dev-users` e recusado quando `NODE_ENV=production`. Em `development` ou `test`, informe `DEV_ADMIN_PASSWORD`, `DEV_TECNICO_PASSWORD` e `DEV_OPERADOR_PASSWORD`, todas com 15 a 128 caracteres. O seed nao imprime esses valores.

Para uma demonstracao local descartavel, `ALLOW_INSECURE_SEED=true` habilita explicitamente credenciais publicas/previsiveis. Essa opcao nao remove o bloqueio absoluto de producao e nao deve ser usada em homologacao ou em dados persistentes.

## Como Executar

```powershell
npm install
npx prisma generate
npm run start:dev
```

Em Windows com Node.js 24 ou superior, se a conexao TLS com MongoDB Atlas nao reconhecer a cadeia instalada pelo sistema, habilite a CA do Windows no ambiente do processo antes de iniciar a API:

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm run start:prod
```

Configure a mesma variavel na conta/servico que executa a API em producao. Nao desabilite a validacao TLS com `NODE_TLS_REJECT_UNAUTHORIZED=0`.

API local:

- HTTP: `http://localhost:3000/api`
- Swagger, quando habilitado por ambiente: `http://localhost:3000/docs`
- CORS HTTP e handshakes Socket.IO configurados por `CORS_ALLOWED_ORIGINS`; sem configuracao, somente `http://localhost:5173` e `http://127.0.0.1:5173` sao aceitos.

## Scripts

| Script                           | Descricao                                                |
| -------------------------------- | -------------------------------------------------------- |
| `npm run build`                  | Compila a aplicacao NestJS.                              |
| `npm run start`                  | Inicia a API via Nest.                                   |
| `npm run start:dev`              | Inicia em modo desenvolvimento com watch.                |
| `npm run start:prod`             | Executa `dist/src/main.js`.                              |
| `npm run lint`                   | Executa ESLint com correcao automatica.                  |
| `npm run test`                   | Executa testes Jest.                                     |
| `npm run test:e2e`               | Executa testes e2e configurados em `test/jest-e2e.json`. |
| `npm run seed:dev-users`         | Executa seed de usuarios de desenvolvimento.             |
| `npm run validate:dev-users`     | Valida usuarios de desenvolvimento.                      |
| `npm run seed:validation:phase1` | Executa seed de validacao fase 1.                        |
| `npm run seed:validation:phase2` | Executa seed de validacao fase 2.                        |
| `npm run seed:validation:phase3` | Executa seed de validacao fase 3.                        |
| `npm run sim:mqtt:preparo`       | Simulacao MQTT de preparo/online.                        |
| `npm run sim:mqtt:sucesso`       | Simulacao MQTT de processo com sucesso.                  |
| `npm run sim:mqtt:falha`         | Simulacao MQTT de processo com falha.                    |

## Autenticacao e Permissoes

A API usa JWT com guards e decorators de roles. Perfis principais:

- `ADMINISTRADOR`
- `TECNICO`
- `OPERADOR`

Rotas sensiveis devem validar token e nivel de acesso antes de executar a regra de negocio.

O contrato de autenticacao aplica as seguintes regras:

- `POST /auth/signin` sempre responde `Credenciais invalidas.` quando o login, a senha ou o estado de bloqueio nao permitem autenticar, sem revelar se a conta existe;
- senhas novas definidas por `POST /auth/first-access` e `POST /auth/reset-password` devem ter entre 15 e 128 caracteres, sem regra obrigatoria de composicao;
- a senha temporaria criada junto com um usuario possui 24 caracteres gerados por fonte criptograficamente segura;
- o token de redefinicao possui 43 caracteres, expira em 15 minutos, e de uso unico e somente seu hash e persistido;
- primeiro acesso e redefinicao de senha revogam todos os access tokens anteriores e desconectam os sockets ativos do usuario; o cliente deve solicitar um novo login;
- alteracoes de cadastro ou nivel de acesso tambem revogam os tokens anteriores e desconectam os sockets ativos depois da gravacao no banco; auto-rebaixamento e autoexclusao de administrador sao recusados;
- login, primeiro acesso, solicitacao e consumo de redefinicao possuem limites de requisicao e podem responder `429 Too Many Requests`.

Os namespaces Socket.IO `/processos`, `/alarmes` e `/mqtt-hardware` exigem o mesmo access token JWT usado na API HTTP. O front-end deve envia-lo no handshake, preferencialmente em `auth.token` (tambem e aceito `auth.access_token`):

```ts
const socket = io(`${API_URL}/alarmes`, {
  auth: { token: `Bearer ${accessToken}` },
});
```

Token ausente, invalido, expirado, de redefinicao de senha ou pertencente a usuario removido recusa a conexao com `connect_error` e codigo `UNAUTHORIZED`. A origem do front-end tambem precisa constar em `CORS_ALLOWED_ORIGINS`.

## Relatorios

O modulo de relatorios gera e entrega arquivos PDF/XLSX. Metadados ficam no PostgreSQL e os arquivos sao armazenados no GridFS; por isso MongoDB faz parte dos requisitos de inicializacao. A API tambem expoe endpoints para preview/download usados pelo frontend.

## Backups

O modulo de configuracoes contem suporte a backups em `configuracoes/backup`, com controller, service e mapper dedicados. Os backups se integram ao dominio de configuracoes do sistema e MQTT/hardware conforme a estrutura persistida no banco.

## Seguranca Operacional

- Nao publicar senhas, JWTs, hashes ou URIs reais em logs ou documentacao.
- Validar DTOs de entrada.
- Manter `DATABASE_URL`, `JWT_SECRET`, `MONGODB_URI` e o arquivo externo de credenciais MQTT apenas em ambiente seguro.
- Nao executar scripts MQTT contra hardware real sem confirmar o broker e os topicos ativos.

## Licenca

O `package.json` marca o projeto como `UNLICENSED`. Defina uma licenca antes de distribuicao publica.
