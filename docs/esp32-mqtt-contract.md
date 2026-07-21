# Contrato MQTT API x ESP32 - TSEA

## Visao geral

A API NestJS e o firmware ESP32 se comunicam por MQTT. A API centraliza regras de processo, seguranca, usuarios, historico, alarmes e configuracoes operacionais. O ESP32 executa comandos fisicos, publica leituras, status, heartbeat, acoplamentos e alarmes de hardware.

## Versao do contrato

- A versao oficial publicada pela API e pelo simulador e `schema_version: 2`.
- Durante a migracao, a API aceita payloads de entrada com `schema_version: 1` ou `2`.
- Payloads com outras versoes sao rejeitados.
- Payloads legados sem versao continuam aceitos somente nos canais em que ja existiam antes da formalizacao do envelope.

Datas do contrato usam strings ISO 8601 em UTC:

| Mensagem                                  | Campo oficial   |
| ----------------------------------------- | --------------- |
| Comando, configuracao, status e heartbeat | `enviado_em`    |
| ACK                                       | `recebido_em`   |
| Leitura                                   | `leitura_em`    |
| Acoplamento                               | `verificado_em` |
| Alarme                                    | `ocorrido_em`   |

`timestamp` permanece aceito apenas como alias legado de leitura. O simulador v2 publica somente os nomes oficiais.

A API registra a espera antes de publicar cada comando e so considera a operacao concluida quando recebe o ACK final `EXECUTADO`. `RECEBIDO` e apenas uma confirmacao intermediaria; `RECUSADO`, `ERRO`, desconexao e timeout interrompem a operacao. O timeout usa `timeout_comunicacao` da configuracao MQTT ativa.

## Responsabilidades da API

- Publicar configuracao operacional no topico `tsea/config`.
- Publicar comandos no topico `tsea/comandos`.
- Receber ACKs no topico `tsea/acks`.
- Correlacionar comando e ACK por `correlation_id` antes de alterar o estado do processo.
- Receber leituras, status, heartbeat, acoplamentos e alarmes.
- Validar pre-checagens antes de iniciar processo de vacuo.
- Registrar eventos, leituras, alarmes e historico.

## Responsabilidades do ESP32

- Conectar ao broker MQTT com usuario/senha configurados no ambiente.
- Enviar heartbeat periodico.
- Aplicar `SYNC_CONFIG` recebido da API.
- Executar comandos fisicos apenas quando validos.
- Responder `RECEBIDO` e um ACK final por `correlation_id`.
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

| Tanque     | Linha principal | Linha auxiliar |
| ---------- | --------------- | -------------- |
| `TANQUE_1` | `VP_T1`         | `VA_T1`        |
| `TANQUE_2` | `VP_T2`         | `VA_T2`        |
| `TANQUE_3` | `VP_T3`         | `VA_T3`        |

As valvulas `VP_*` pertencem a linha da `BOMBA_VACUO_PRINCIPAL`.
As valvulas `VA_*` pertencem a linha da `BOMBA_VACUO_AUXILIAR`.

## Topicos MQTT

| Topico              | Direcao      | Uso                                  |
| ------------------- | ------------ | ------------------------------------ |
| `tsea/config`       | API -> ESP32 | Sincronizacao de configuracao        |
| `tsea/comandos`     | API -> ESP32 | Comandos operacionais                |
| `tsea/acks`         | ESP32 -> API | ACK de comandos por `correlation_id` |
| `tsea/leituras`     | ESP32 -> API | Leituras de sensores                 |
| `tsea/status`       | ESP32 -> API | Status operacional do hardware       |
| `tsea/heartbeat`    | ESP32 -> API | Sinal de vida                        |
| `tsea/acoplamentos` | ESP32 -> API | Estado dos sensores de acoplamento   |
| `tsea/alarmes`      | ESP32 -> API | Alarmes gerados pelo hardware        |

## Payloads

### SYNC_CONFIG

```json
{
  "tipo": "SYNC_CONFIG",
  "schema_version": 2,
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

Esse comando carrega e valida o contexto do processo no ESP32, mas nao aciona valvulas nem bombas. Depois do ACK `EXECUTADO`, a API envia os comandos individuais de abertura das valvulas principais selecionadas e, por ultimo, o comando da bomba principal.

```json
{
  "tipo": "INICIAR_PROCESSO_VACUO",
  "schema_version": 2,
  "correlation_id": "cmd_iniciar-processo-vacuo_...",
  "enviado_em": "2026-07-07T12:00:00.000Z",
  "id_processo": 10,
  "modo_operacao_auxiliar": "AUTOMATICO",
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
          "bomba_codigo_hardware": "BOMBA_VACUO_PRINCIPAL",
          "numero_saida_manifold": 1
        },
        {
          "id_valvula": 4,
          "codigo_hardware": "VA_T1",
          "nome": "Valvula auxiliar do tanque 1",
          "funcao_valvula": "VACUO",
          "tipo": "AUXILIAR",
          "id_bomba": 1,
          "bomba_codigo_hardware": "BOMBA_VACUO_AUXILIAR",
          "numero_saida_manifold": 1
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

`modo_operacao_auxiliar` informa ao firmware o modo configurado na API (`AUTOMATICO`, `ASSISTIDO` ou `MANUAL`). Nesta fase, a decisao e a autoridade de controle continuam na API; o ESP32 usa o campo como contexto e mantem todos os intertravamentos locais independentemente do modo.

### Comandos simples

```json
{
  "tipo": "COMANDO",
  "schema_version": 2,
  "comando": "PARADA_EMERGENCIA",
  "correlation_id": "cmd_parada-emergencia_...",
  "enviado_em": "2026-07-07T12:00:00.000Z",
  "id_processo": 10,
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
- `ABRIR_TODAS_VALVULAS`.
- `FECHAR_TODAS_VALVULAS`.
- `REINICIAR_COMUNICACAO`.

Exemplo de comando para abrir uma valvula auxiliar:

```json
{
  "tipo": "COMANDO",
  "schema_version": 2,
  "comando": "ABRIR_VALVULA",
  "correlation_id": "cmd_abrir-valvula_...",
  "enviado_em": "2026-07-07T12:00:00.000Z",
  "id_processo": 10,
  "solicitado_por": null,
  "motivo": "Acionar linha auxiliar do tanque 1",
  "parametros": {
    "id_valvula": 4,
    "codigo_hardware": "VA_T1"
  }
}
```

O ESP32 deve resolver o `id_valvula` usando o `SYNC_CONFIG`. Para esse exemplo, o ID aponta para `VA_T1`.

### ACK

```json
{
  "tipo": "ACK",
  "schema_version": 2,
  "device_id": "ESP32_TSEA_01",
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

- `RECEBIDO`: o payload chegou ao ESP32, mas a execucao ainda nao terminou.
- `EXECUTADO`: a saida eletrica ou a carga de contexto foi concluida pelo firmware.
- `RECUSADO`: o ESP32 rejeitou a operacao por validacao ou intertravamento.
- `ERRO`: houve falha ao processar ou executar o comando.

O callback de publicacao MQTT e o QoS confirmam etapas do transporte com o broker; eles nao comprovam a execucao fisica no ESP32. Por isso a API aguarda o ACK de aplicacao. Mesmo `EXECUTADO` confirma somente a acao eletrica comandada quando nao existe sensor de posicao, corrente ou rotacao.

Dentro da mesma execucao da API, repeticoes com o mesmo `correlation_id` reutilizam a espera pendente ou o ACK final armazenado e nao republicam o comando. Essa idempotencia e mantida em memoria e nao sobrevive ao reinicio da API.

### SENSOR_READING modo PROCESSO

```json
{
  "tipo": "SENSOR_READING",
  "schema_version": 2,
  "device_id": "ESP32_TSEA_01",
  "modo": "PROCESSO",
  "id_processo": 10,
  "id_processo_tanque": 20,
  "id_tanque": 1,
  "id_sensor": 1,
  "id_processo_tanque_sensor": 40,
  "codigo_hardware": "VACUO_T1",
  "valor_vacuo": -80.5,
  "unidade_medida": "kPa",
  "leitura_em": "2026-07-07T12:00:02.000Z"
}
```

`codigo_hardware` e opcional para retrocompatibilidade. Em modo `PROCESSO`, o vinculo `id_processo_tanque_sensor` continua obrigatorio.

## Lifecycle individual dos tanques

Depois de persistir cada leitura de processo, a API resolve o tanque pelo `id_processo_tanque_sensor` e executa o monitor operacional somente para aquele `id_processo_tanque`.

O fluxo desta fase e:

1. O inicio do processo coloca cada tanque em `GERANDO_VACUO`.
2. Cada leitura atualiza individualmente `vacuo_inicial`, `vacuo_final` e `vacuo_medio`.
3. Ao entrar na faixa definida por `vacuo_alvo` e `tolerancia_vacuo_percentual`, o tanque passa para `VACUO_ATINGIDO` e a API registra o evento `VACUO_ALVO_ATINGIDO`.
4. Permanecendo na faixa por pelo menos 30 segundos e com pelo menos tres leituras desde o evento de alvo, o tanque passa para `VACUO_ESTABILIZADO` e a API registra `TANQUE_ESTABILIZADO`.
5. Se sair da faixa antes da conclusao, o tanque retorna a `GERANDO_VACUO` e os indicadores de alvo/estabilizacao sao removidos.
6. Leituras recebidas com processo pausado ou com tanque em estado terminal nao alteram o lifecycle.

O inicio da janela de estabilizacao e recuperado do evento persistido, portanto nao depende apenas de memoria da API. O processamento e serializado por tanque e a atualizacao usa o estado anterior como condicao para evitar duas transicoes concorrentes sobre o mesmo registro.

Limite atual: `VACUO_ESTABILIZADO` ainda nao fecha valvulas, nao liga a bomba auxiliar e nao conclui automaticamente o tanque/processo. Linha auxiliar e encerramento automatico permanecem em fases posteriores.

## Detector de estagnacao

O detector e executado pela API depois da persistencia de cada `SENSOR_READING` em modo `PROCESSO`; o firmware nao precisa publicar um novo topico nem alterar o payload.

Ele opera somente enquanto o tanque esta em `GERANDO_VACUO`. Por padrao, uma avaliacao exige ao menos cinco leituras cobrindo 80% de uma janela de 60 segundos. A API compara a media da magnitude do vacuo no primeiro e no ultimo terco da janela para reduzir o efeito de ruido. Progresso inferior a 2 unidades marca `SUSPEITA`; duas janelas validas consecutivas sem progresso confirmam `DETECTADA`.

Os limites sao configuraveis em `configuracoessistema`. Uma deteccao confirmada gera evento de processo e alarme operacional medio, sem desligamento automatico. O progresso normal, o alcance do alvo e os estados terminais normalizam o detector e o alarme. O snapshot HTTP e o evento Socket.IO do tanque entregam ao front-end o estado, tempos, variacao observada, contadores, limites e alarme ativo.

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
  "schema_version": 2,
  "device_id": "ESP32_TSEA_01",
  "modo": "DIAGNOSTICO",
  "codigo_hardware": "VACUO_T1",
  "id_sensor": 3,
  "valor": -2.5,
  "unidade": "kPa",
  "timestamp": "2026-07-07T12:00:00.000Z"
}
```

Depois de `INICIAR_PROCESSO_VACUO`, da abertura confirmada das valvulas principais selecionadas e do acionamento confirmado da bomba principal, o ESP32 deve publicar leituras de processo com `id_processo_tanque_sensor`:

```json
{
  "tipo": "SENSOR_READING",
  "schema_version": 2,
  "device_id": "ESP32_TSEA_01",
  "modo": "PROCESSO",
  "id_processo": 10,
  "id_processo_tanque": 20,
  "id_tanque": 1,
  "id_sensor": 1,
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
  "schema_version": 2,
  "device_id": "ESP32_TSEA_01",
  "firmware_version": "1.0.0",
  "status_geral": "OPERACIONAL",
  "emergencia_ativa": false,
  "erro_atual": null,
  "bombas": [
    {
      "codigo_hardware": "BOMBA_VACUO_PRINCIPAL",
      "ligada": false,
      "disponivel": true,
      "falha": false
    },
    {
      "codigo_hardware": "BOMBA_VACUO_AUXILIAR",
      "ligada": false,
      "disponivel": true,
      "falha": false
    }
  ],
  "valvulas": [
    {
      "codigo_hardware": "VP_T1",
      "id_tanque": 1,
      "numero_saida_manifold": 1,
      "tipo": "PRINCIPAL",
      "status_valvula": "FECHADA",
      "aberta": false,
      "ack": true,
      "falha": false,
      "disponivel": true
    },
    {
      "codigo_hardware": "VA_T1",
      "id_tanque": 1,
      "numero_saida_manifold": 1,
      "tipo": "AUXILIAR",
      "status_valvula": "FECHADA",
      "ack": true,
      "falha": false
    },
    {
      "codigo_hardware": "VP_T2",
      "id_tanque": 2,
      "numero_saida_manifold": 2,
      "tipo": "PRINCIPAL",
      "status_valvula": "FECHADA",
      "ack": true,
      "falha": false
    },
    {
      "codigo_hardware": "VA_T2",
      "id_tanque": 2,
      "numero_saida_manifold": 2,
      "tipo": "AUXILIAR",
      "status_valvula": "FECHADA",
      "ack": true,
      "falha": false
    },
    {
      "codigo_hardware": "VP_T3",
      "id_tanque": 3,
      "numero_saida_manifold": 3,
      "tipo": "PRINCIPAL",
      "status_valvula": "FECHADA",
      "ack": true,
      "falha": false
    },
    {
      "codigo_hardware": "VA_T3",
      "id_tanque": 3,
      "numero_saida_manifold": 3,
      "tipo": "AUXILIAR",
      "status_valvula": "FECHADA",
      "ack": true,
      "falha": false
    }
  ],
  "enviado_em": "2026-07-07T12:00:02.000Z"
}
```

No schema v2, `bombas` e `valvulas` sao listas obrigatorias e cada item e
validado antes de qualquer persistencia. Para cada bomba conhecida, a API
atualiza somente `ligada_hardware`, `disponivel_hardware` e
`ultimo_status_hardware_em`; `status_padrao` permanece sendo configuracao
administrativa. `falha` e opcional para compatibilidade com simuladores
anteriores e assume `false` quando ausente. Quando `falha` for `true`, a API
persiste a bomba como fisicamente indisponivel.

O evento Socket.IO `hardware:status`, no namespace `/mqtt-hardware`, inclui
`status_bombas` com `id_bomba`, `codigo_hardware`, `tipo_bomba`, `ligada`,
`disponivel`, `falha` e `status_em`. Os campos legados
`status_bomba_principal` e `status_bomba_auxiliar` continuam presentes para
compatibilidade, mas nao substituem a telemetria detalhada.

### HEARTBEAT

```json
{
  "tipo": "HEARTBEAT",
  "schema_version": 2,
  "device_id": "ESP32_TSEA_01",
  "firmware_version": "1.0.0",
  "uptime_ms": 120000,
  "status": "ONLINE",
  "enviado_em": "2026-07-07T12:00:00.000Z"
}
```

### ACOPLAMENTO_STATUS

```json
{
  "tipo": "ACOPLAMENTO_STATUS",
  "schema_version": 2,
  "device_id": "ESP32_TSEA_01",
  "id_processo": 10,
  "id_processo_tanque": 20,
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
  "tipo": "ALARME_HARDWARE",
  "schema_version": 2,
  "device_id": "ESP32_TSEA_01",
  "id_processo": 10,
  "tipo_alarme": "SEGURANCA",
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
- `RECEBIDO` nao autoriza a API a avancar; comando publicado so e tratado como executado apos `EXECUTADO`.
- `RECUSADO`, `ERRO`, desconexao ou timeout impedem a transicao do processo para `EM_EXECUCAO`.
- Na falha de qualquer etapa da partida, a API tenta desligar todas as bombas e fechar todas as valvulas.
- O teste corretivo de valvulas da pre-checagem exige um `HARDWARE_STATUS` v2 nao retido, recebido depois dos ACKs de preparo, com todas as bombas do processo desligadas e todas as valvulas fechadas, disponiveis e sem falha.
- `ACK EXECUTADO` e `HARDWARE_STATUS` confirmam processamento e estado logico do controlador. Sem sensores dedicados, nao comprovam posicao mecanica de valvula nem rotacao/corrente de bomba.
- Desacoplamento durante processo deve provocar falha/parada de emergencia conforme regra operacional.
- `codigo_hardware` deve ser estavel e nao deve depender dos IDs internos do banco.
- Nenhum payload deve conter potencia, PWM ou valor de potenciometro.

## Fluxo recomendado

1. API sobe e conecta ao broker.
2. ESP32 conecta ao broker.
3. ESP32 publica heartbeat.
4. API publica `SYNC_CONFIG`.
5. Usuario consulta ou executa a pre-checagem.
6. Se houver sensor sem calibracao/liberacao, o front executa a `acao_corretiva` indicada e repete a pre-checagem.
7. Se houver valvula sem estado seguro recente, um tecnico executa `POST /processos/:id/valvulas/:id_valvula/validar`; a API desliga bombas, fecha valvulas, sincroniza e exige telemetria v2 posterior aos ACKs.
8. Usuario solicita o inicio somente depois de a pre-checagem ser aprovada.
9. A API repete o preparo seguro de partida, aguardando `EXECUTADO` em cada etapa.
10. API publica `INICIAR_PROCESSO_VACUO`; o ESP32 carrega o contexto sem acionar atuadores e responde `EXECUTADO`.
11. API abre, uma por vez, as `VP_Tn` dos tanques selecionados e aguarda `EXECUTADO` de cada comando.
12. API liga a bomba principal e aguarda `EXECUTADO`.
13. Somente depois dessas confirmacoes a API altera o processo para `EM_EXECUCAO`.
14. ESP32 publica leituras, status e acoplamentos.
15. API encerra, interrompe ou aciona parada de emergencia quando necessario.

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
- O simulador publica `RECEBIDO` antes do ACK final de configuracoes e comandos.
- Para compatibilidade com o DTO atual da API, o ACK de `SYNC_CONFIG` usa `comando: "SINCRONIZAR_HARDWARE"` e `recebido_em`.
- `INICIAR_PROCESSO_VACUO` apenas carrega o processo no simulador; as leituras de processo comecam depois dos comandos individuais das valvulas principais e da bomba.
- O simulador so publica acoplamentos depois de receber IDs reais via `SYNC_CONFIG` ou payload de inicio do processo.
- O simulador nao publica potencia, PWM ou valor de potenciometro.
