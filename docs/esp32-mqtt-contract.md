# Contrato MQTT API x ESP32 - TSEA

## Visao geral

A API NestJS e o firmware ESP32 se comunicam por MQTT. A API centraliza regras de processo, seguranca, usuarios, historico, alarmes e configuracoes operacionais. O ESP32 executa comandos fisicos, publica leituras, status, heartbeat, acoplamentos e alarmes de hardware.

## Responsabilidades da API

- Publicar configuracao operacional no topico `tsea/config`.
- Publicar comandos no topico `tsea/comandos`.
- Receber ACKs no topico `tsea/acks`.
- Receber leituras, status, heartbeat, acoplamentos e alarmes.
- Validar pre-checagens antes de iniciar processo de vacuo.
- Registrar eventos, leituras, alarmes e historico.

## Responsabilidades do ESP32

- Conectar ao broker MQTT com usuario/senha configurados no ambiente.
- Enviar heartbeat periodico.
- Aplicar `SYNC_CONFIG` recebido da API.
- Executar comandos fisicos apenas quando validos.
- Responder ACK por `correlation_id`.
- Publicar leituras, status, acoplamentos e alarmes.

## Potencia/PWM da bomba

Potencia/PWM nao faz parte do contrato da API nem do front-end.

No prototipo, o controle de potencia e local no ESP32:

```txt
potenciometro fisico -> leitura analogica ESP32 -> PWM local -> MOSFET IRF520 -> bomba
```

A API trata bomba apenas como recurso operacional: principal ou auxiliar, ligada ou desligada, disponivel ou indisponivel, vinculada ao processo, comandos de ligar/desligar e parada de emergencia.

## Codigos oficiais de valvulas

Cada tanque possui duas valvulas de vacuo:

| Tanque | Linha principal | Linha auxiliar |
|---|---|---|
| `TANQUE_1` | `VP_T1` | `VA_T1` |
| `TANQUE_2` | `VP_T2` | `VA_T2` |
| `TANQUE_3` | `VP_T3` | `VA_T3` |

As valvulas `VP_*` pertencem a linha da `BOMBA_VACUO_PRINCIPAL`.
As valvulas `VA_*` pertencem a linha da `BOMBA_VACUO_AUXILIAR`.

## Topicos MQTT

| Topico | Direcao | Uso |
|---|---|---|
| `tsea/config` | API -> ESP32 | Sincronizacao de configuracao |
| `tsea/comandos` | API -> ESP32 | Comandos operacionais |
| `tsea/acks` | ESP32 -> API | ACK de comandos por `correlation_id` |
| `tsea/leituras` | ESP32 -> API | Leituras de sensores |
| `tsea/status` | ESP32 -> API | Status operacional do hardware |
| `tsea/heartbeat` | ESP32 -> API | Sinal de vida |
| `tsea/acoplamentos` | ESP32 -> API | Estado dos sensores de acoplamento |
| `tsea/alarmes` | ESP32 -> API | Alarmes gerados pelo hardware |

## Payloads

### SYNC_CONFIG

```json
{
  "tipo": "SYNC_CONFIG",
  "schema_version": 1,
  "correlation_id": "cmd_sincronizar-hardware_...",
  "enviado_em": "2026-07-07T12:00:00.000Z",
  "sistema": {
    "vacuo_padrao": -80,
    "limite_seguranca_vacuo": -95,
    "tolerancia_vacuo_percentual": 10,
    "unidade": "kPa"
  },
  "mqtt": {
    "topico_comandos": "tsea/comandos",
    "topico_leituras": "tsea/leituras",
    "topico_status": "tsea/status",
    "topico_heartbeat": "tsea/heartbeat",
    "topico_alarmes": "tsea/alarmes",
    "topico_acoplamentos": "tsea/acoplamentos",
    "topico_configuracoes": "tsea/config",
    "topico_acks": "tsea/acks"
  },
  "hardware": {
    "bombas": [],
    "tanques": [],
    "valvulas": [
      {
        "id_valvula": 1,
        "codigo_hardware": "VP_T1",
        "id_tanque": 3,
        "tanque_codigo_hardware": "TANQUE_1",
        "id_bomba": 2,
        "bomba_codigo_hardware": "BOMBA_VACUO_PRINCIPAL",
        "tipo": "PRINCIPAL",
        "nome": "Valvula principal do tanque 1",
        "numero_saida_manifold": 1,
        "funcao_valvula": "VACUO",
        "status_valvula": "FECHADA",
        "disponivel": true
      },
      {
        "id_valvula": 4,
        "codigo_hardware": "VA_T1",
        "id_tanque": 3,
        "tanque_codigo_hardware": "TANQUE_1",
        "id_bomba": 1,
        "bomba_codigo_hardware": "BOMBA_VACUO_AUXILIAR",
        "tipo": "AUXILIAR",
        "nome": "Valvula auxiliar do tanque 1",
        "numero_saida_manifold": 1,
        "funcao_valvula": "VACUO",
        "status_valvula": "FECHADA",
        "disponivel": true
      }
    ],
    "sensores_vacuo": [],
    "sensores_acoplamento": []
  },
  "seguranca": {
    "parar_se_desacoplar": true,
    "parada_emergencia_habilitada": true,
    "timeout_heartbeat_ms": 10000
  }
}
```

### INICIAR_PROCESSO_VACUO

```json
{
  "tipo": "INICIAR_PROCESSO_VACUO",
  "schema_version": 1,
  "correlation_id": "cmd_iniciar-processo-vacuo_...",
  "enviado_em": "2026-07-07T12:00:00.000Z",
  "id_processo": 10,
  "tanques": [
    {
      "id_tanque": 1,
      "codigo_hardware": "TANQUE_1",
      "id_processo_tanque": 20,
      "id_processo_tanque_sensor": 40,
      "sensor_vacuo": {
        "id_sensor": 1,
        "codigo_hardware": "VACUO_T1",
        "nome": "Sensor de Vacuo TR-01",
        "unidade_medida": "kPa"
      },
      "sensor_acoplamento": {
        "id_sensor": 4,
        "codigo_hardware": "ACOP_T1",
        "nome": "Sensor de Acoplamento TR-01",
        "unidade_medida": "estado"
      },
      "valvulas": [
        {
          "id_valvula": 1,
          "codigo_hardware": "VP_T1",
          "nome": "Valvula principal do tanque 1",
          "funcao_valvula": "VACUO",
          "tipo": "PRINCIPAL",
          "id_bomba": 2,
          "bomba_codigo_hardware": "BOMBA_VACUO_PRINCIPAL"
        },
        {
          "id_valvula": 4,
          "codigo_hardware": "VA_T1",
          "nome": "Valvula auxiliar do tanque 1",
          "funcao_valvula": "VACUO",
          "tipo": "AUXILIAR",
          "id_bomba": 1,
          "bomba_codigo_hardware": "BOMBA_VACUO_AUXILIAR"
        }
      ],
      "vacuo_alvo": -80,
      "unidade": "kPa"
    }
  ],
  "bomba": {
    "id_bomba": 1,
    "codigo_hardware": "BOMBA_VACUO_PRINCIPAL",
    "nome": "Bomba de Vacuo Principal",
    "tipo_bomba": "PRINCIPAL"
  },
  "vacuo_alvo": -80,
  "limite_seguranca_vacuo": -95,
  "tolerancia_vacuo_percentual": 10,
  "unidade": "kPa",
  "seguranca": {
    "parar_se_desacoplar": true,
    "parada_emergencia_habilitada": true
  }
}
```

### Comandos simples

```json
{
  "comando": "PARADA_EMERGENCIA",
  "correlation_id": "cmd_parada-emergencia_...",
  "enviado_em": "2026-07-07T12:00:00.000Z",
  "solicitado_por": null,
  "motivo": "Processo 10: parada de emergencia",
  "parametros": {}
}
```

Comandos suportados:

- `PARAR_PROCESSO`, quando mapeado pelo backend para desligamento seguro.
- `PARADA_EMERGENCIA`.
- `LIGAR_BOMBA`.
- `DESLIGAR_BOMBA`.
- `ABRIR_VALVULA`.
- `FECHAR_VALVULA`.
- `DESLIGAR_TODAS_BOMBAS`.
- `FECHAR_TODAS_VALVULAS`.

Exemplo de comando para abrir uma valvula auxiliar:

```json
{
  "comando": "ABRIR_VALVULA",
  "correlation_id": "cmd_abrir-valvula_...",
  "enviado_em": "2026-07-07T12:00:00.000Z",
  "solicitado_por": null,
  "motivo": "Acionar linha auxiliar do tanque 1",
  "parametros": {
    "id_valvula": 4
  }
}
```

O ESP32 deve resolver o `id_valvula` usando o `SYNC_CONFIG`. Para esse exemplo, o ID aponta para `VA_T1`.

### ACK

```json
{
  "tipo": "ACK",
  "schema_version": 1,
  "correlation_id": "cmd_iniciar-processo-vacuo_...",
  "comando": "INICIAR_PROCESSO_VACUO",
  "status": "EXECUTADO",
  "codigo_hardware": "BOMBA_VACUO_PRINCIPAL",
  "id_processo": 10,
  "mensagem": "Comando executado",
  "erro": null,
  "recebido_em": "2026-07-07T12:00:01.000Z"
}
```

Status aceitos: `RECEBIDO`, `EXECUTADO`, `RECUSADO`, `ERRO`.

### SENSOR_READING modo PROCESSO

```json
{
  "tipo": "SENSOR_READING",
  "schema_version": 1,
  "modo": "PROCESSO",
  "id_processo_tanque_sensor": 40,
  "codigo_hardware": "VACUO_T1",
  "valor_vacuo": -80.5,
  "unidade_medida": "kPa",
  "leitura_em": "2026-07-07T12:00:02.000Z"
}
```

`codigo_hardware` e opcional para retrocompatibilidade. Em modo `PROCESSO`, o vinculo `id_processo_tanque_sensor` continua obrigatorio.

## Leituras diagnosticas antes do processo

Antes de iniciar um processo, a API precisa confirmar que os sensores fisicos estao vivos e possuem leitura recente. Nesse momento o ESP32 ainda nao recebeu `id_processo_tanque_sensor`, porque esse vinculo so aparece no comando `INICIAR_PROCESSO_VACUO`.

Para resolver isso, o ESP32 publica leituras diagnosticas periodicas em `tsea/leituras`, mesmo sem processo ativo. Essas leituras usam o `codigo_hardware` estavel do sensor, e podem incluir `id_sensor` quando o ESP32 ja recebeu a configuracao por `SYNC_CONFIG`.

Leituras diagnosticas:

- nao exigem `id_processo_tanque_sensor`;
- nao sao historico de processo;
- atualizam o estado operacional do sensor fisico;
- servem para a pre-checagem de inicio;
- nao substituem as leituras de processo apos o inicio.

Exemplo:

```json
{
  "tipo": "SENSOR_READING",
  "schema_version": 1,
  "modo": "DIAGNOSTICO",
  "codigo_hardware": "VACUO_T1",
  "id_sensor": 3,
  "valor": -2.5,
  "unidade": "kPa",
  "timestamp": "2026-07-07T12:00:00.000Z"
}
```

Depois de `INICIAR_PROCESSO_VACUO`, o ESP32 deve publicar leituras de processo com `id_processo_tanque_sensor`:

```json
{
  "tipo": "SENSOR_READING",
  "schema_version": 1,
  "modo": "PROCESSO",
  "id_processo_tanque_sensor": 40,
  "codigo_hardware": "VACUO_T1",
  "valor_vacuo": -80.5,
  "unidade_medida": "kPa",
  "leitura_em": "2026-07-07T12:00:02.000Z"
}
```

### HARDWARE_STATUS

```json
{
  "esp32_on": true,
  "tipo": "HARDWARE_STATUS",
  "schema_version": 1,
  "device_id": "ESP32_TSEA_01",
  "firmware_version": "1.0.0",
  "status_geral": "OPERACIONAL",
  "emergencia_ativa": false,
  "erro_atual": null,
  "bombas": [
    {
      "codigo_hardware": "BOMBA_VACUO_PRINCIPAL",
      "ligada": false,
      "disponivel": true
    }
  ],
  "valvulas": [
    {
      "codigo_hardware": "VP_T1",
      "aberta": false,
      "disponivel": true
    }
  ],
  "enviado_em": "2026-07-07T12:00:02.000Z"
}
```

### HEARTBEAT

```json
{
  "device_id": "ESP32_TSEA_01",
  "status": "ONLINE",
  "enviado_em": "2026-07-07T12:00:00.000Z"
}
```

### ACOPLAMENTO_STATUS

```json
{
  "id_sensor": 4,
  "id_tanque": 1,
  "codigo_hardware": "ACOP_T1",
  "sinal_detectado": true,
  "verificado_em": "2026-07-07T12:00:00.000Z"
}
```

### ALARME_HARDWARE

```json
{
  "id_processo": 10,
  "tipo_alarme": "HARDWARE",
  "origem_alarme": "MQTT",
  "severidade": "CRITICO",
  "titulo": "Falha de acoplamento",
  "descricao": "Mangueira desacoplada durante processo",
  "ocorrido_em": "2026-07-07T12:00:00.000Z"
}
```

## Regras de seguranca

- A API nao inicia processo se a pre-checagem falhar.
- O ESP32 deve responder ACK para cada comando recebido.
- Comando publicado nao deve ser tratado como executado sem ACK do ESP32.
- Desacoplamento durante processo deve provocar falha/parada de emergencia conforme regra operacional.
- `codigo_hardware` deve ser estavel e nao deve depender dos IDs internos do banco.
- Nenhum payload deve conter potencia, PWM ou valor de potenciometro.

## Fluxo recomendado

1. API sobe e conecta ao broker.
2. ESP32 conecta ao broker.
3. ESP32 publica heartbeat.
4. API publica `SYNC_CONFIG`.
5. Usuario inicia processo de vacuo.
6. API executa pre-checagem.
7. API publica `INICIAR_PROCESSO_VACUO`.
8. ESP32 responde ACK.
9. ESP32 publica leituras, status e acoplamentos.
10. API encerra, interrompe ou aciona parada de emergencia quando necessario.

## Teste com simulador MQTT ESP32

O projeto inclui um simulador local do ESP32 para validar o contrato MQTT sem firmware real:

```bash
npm run simulate:esp32
```

### Variaveis de ambiente

O simulador usa as variaveis abaixo quando existirem:

```txt
TSEA_MQTT_URL
TSEA_MQTT_USERNAME
TSEA_MQTT_PASSWORD
TSEA_SIM_DEVICE_ID
```

Fallback local:

```txt
TSEA_MQTT_URL=mqtt://localhost:1883
TSEA_SIM_DEVICE_ID=ESP32_SIMULADOR
```

Tambem sao aceitas `MQTT_URL`, `MQTT_USERNAME` e `MQTT_PASSWORD` como fallback de compatibilidade.

### Topicos assinados

```txt
tsea/config
tsea/comandos
```

### Topicos publicados

```txt
tsea/acks
tsea/heartbeat
tsea/status
tsea/acoplamentos
tsea/leituras
```

### Ordem recomendada

1. Subir Mosquitto.
2. Subir a API.
3. Rodar `npm run simulate:esp32`.
4. Chamar sincronizacao de hardware na API.
5. Iniciar processo de vacuo.
6. Observar ACKs, heartbeat, status, acoplamentos e leituras.

### Observacoes

- O simulador responde `SYNC_CONFIG` com ACK no topico `tsea/acks`.
- Para compatibilidade com o DTO atual da API, o ACK de `SYNC_CONFIG` usa `comando: "SINCRONIZAR_HARDWARE"` e `recebido_em`.
- O simulador so publica acoplamentos depois de receber IDs reais via `SYNC_CONFIG` ou payload de inicio do processo.
- O simulador nao publica potencia, PWM ou valor de potenciometro.
