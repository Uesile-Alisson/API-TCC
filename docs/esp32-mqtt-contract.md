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
    "valvulas": [],
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
          "nome": "Valvula Solenoide de Vacuo TR-01",
          "funcao_valvula": "VACUO"
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

### SENSOR_READING

```json
{
  "id_processo_tanque_sensor": 40,
  "codigo_hardware": "VACUO_T1",
  "valor_vacuo": -80.5,
  "unidade_medida": "kPa",
  "leitura_em": "2026-07-07T12:00:02.000Z"
}
```

`codigo_hardware` e opcional para retrocompatibilidade. O vinculo `id_processo_tanque_sensor` continua obrigatorio.

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
