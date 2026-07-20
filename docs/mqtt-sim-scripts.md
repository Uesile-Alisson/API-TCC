# Scripts MQTT de simulacao do ESP32

Estes scripts publicam cenarios de preparo, sucesso e falha usando o contrato MQTT da API TSEA. A API agora exige ACK final `EXECUTADO` para cada comando. Para simular tambem o firmware e responder configuracoes/comandos, mantenha `npm run simulate:esp32` em outro terminal durante os cenarios abaixo.

## Comandos

```powershell
npm run simulate:esp32
npm run sim:mqtt:preparo
npm run sim:mqtt:sucesso
npm run sim:mqtt:falha
```

`sim:mqtt:online` tambem existe como alias para `sim:mqtt:preparo`.

## Arquivo `.env.mqtt-sim`

Crie o arquivo localmente sem sobrescrever o `.env` principal:

```env
TSEA_MQTT_URL=mqtt://localhost:1883
TSEA_MQTT_USERNAME=TSEA_API
TSEA_MQTT_PASSWORD=SUA_SENHA_MQTT

TSEA_API_BASE_URL=http://localhost:3000/api
TSEA_API_LOGIN=
TSEA_API_PASSWORD=
TSEA_API_TOKEN=

TSEA_SIM_PROCESS_ID=
TSEA_SIM_PROCESS_NAME=Processo de Vacuo - Reguladores TR-01 a TR-03

TSEA_SIM_DEVICE_ID=esp32-tsea-simulado
TSEA_SIM_PUBLISH_STATUS=false
TSEA_SIM_INTERVAL_MS=2500
TSEA_SIM_READING_INTERVAL_MS=2000

TSEA_SIM_VACUO_UNIDADE=kPa
TSEA_SIM_PRECHECK_VACUO=-80

TSEA_SIM_PTS_IDS=
TSEA_SIM_ACOPLAMENTOS=
TSEA_SIM_VALVULA_IDS=
```

Os scripts carregam primeiro `.env` e depois `.env.mqtt-sim` com prioridade para `.env.mqtt-sim`. Se a mesma variavel existir nos dois arquivos, o valor de `.env.mqtt-sim` vence.

Para aprovar valvulas na pre-checagem, `TSEA_SIM_PUBLISH_STATUS=true` e obrigatorio. Sem essa variavel, o script publica heartbeat, leituras e acoplamentos, mas nao publica o ACK fisico em `tsea/status`; nesse caso o backend deve continuar exibindo valvulas como `NAO_CONFIRMADO`.

`TSEA_SIM_PTS_IDS` aceita lista como `1,2,3`.

`TSEA_SIM_ACOPLAMENTOS` aceita lista `id_sensor:id_tanque`, por exemplo `10:1,11:2,12:3`.

`TSEA_SIM_VALVULA_IDS` aceita lista como `1,2,3`. Se ficar vazio, os scripts tentam descobrir as valvulas ativas dos tanques do processo.

## Resolucao de IDs

Ordem usada pelos scripts:

1. `.env.mqtt-sim`, quando `TSEA_SIM_ACOPLAMENTOS` esta preenchido, com validacao via Prisma.
2. Prisma, usando `DATABASE_URL`, `TSEA_SIM_PROCESS_ID` ou `TSEA_SIM_PROCESS_NAME`.
3. API HTTP autenticada, quando `TSEA_API_TOKEN` ou `TSEA_API_LOGIN/TSEA_API_PASSWORD` estiverem configurados.

Quando `TSEA_SIM_ACOPLAMENTOS` vier do `.env.mqtt-sim`, cada par precisa:

- existir em `sensoresacoplamentomangueiras`;
- estar ativo;
- ter `id_tanque` igual ao cadastro do sensor;
- pertencer a um tanque do processo atual;
- cobrir todos os tanques do processo.

Se `TSEA_SIM_ACOPLAMENTOS` estiver vazio, os scripts buscam automaticamente um sensor de acoplamento ativo por tanque do processo. O sensor de vacuo usado em `TSEA_SIM_PTS_IDS` nunca e usado como sensor de acoplamento.

Se nao conseguir resolver IDs, o script para com:

```txt
Nao foi possivel resolver PTS/acoplamentos. Configure TSEA_SIM_PTS_IDS e TSEA_SIM_ACOPLAMENTOS no .env.mqtt-sim.
```

## Limitacoes conhecidas

- `tsea/status` fica desativado por padrao para evitar publicacao automatica de status durante preparo. Ative `TSEA_SIM_PUBLISH_STATUS=true` para publicar ACK fisico das valvulas.
- Sem ACK recente de valvula em `tsea/status`, a pre-checagem deve manter a valvula como `NAO_CONFIRMADO`.
- Com `TSEA_SIM_PUBLISH_STATUS=true`, o script falha se nao conseguir resolver valvulas reais do processo. Ele nao publica `valvulas: {}` silenciosamente.
- Os scripts de cenario apenas assinam e registram os comandos. O processo `simulate:esp32` responde ACKs de aplicacao em `tsea/acks`.
- O status eletrico de valvulas continua em `tsea/status`; ele nao substitui o ACK de aplicacao correlacionado em `tsea/acks`.
- Os scripts de sucesso/falha usam endpoints HTTP reais: `/processos/:id/iniciar`, `/processos/:id/finalizar` e `/processos/:id/interromper`.

## ACK fisico das valvulas

Quando `TSEA_SIM_PUBLISH_STATUS=true`, os scripts publicam em `tsea/status`:

```json
{
  "esp32_on": true,
  "status_geral": "OPERACIONAL",
  "mensagem": "ESP32 operacional",
  "device_id": "esp32-tsea-simulado",
  "sensores_ativos": 3,
  "valvulas": {
    "1": {
      "id_valvula": 1,
      "status_valvula": "FECHADA",
      "ack": true,
      "falha": false
    }
  },
  "tanques": {},
  "enviado_em": "2026-07-01T12:00:00.000Z"
}
```

Para a pre-checagem aprovar valvula, o backend exige valvula ativa, ACK recente, `status_valvula=FECHADA` e `falha=false`.
