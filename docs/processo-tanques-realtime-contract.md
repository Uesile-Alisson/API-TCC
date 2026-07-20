# Contrato HTTP e Socket.IO dos tanques em processo

Este contrato fornece o estado inicial dos cards de tanques por HTTP e as atualizacoes incrementais em tempo real por Socket.IO. O front-end nao precisa consultar o banco nem interpretar mensagens MQTT.

## Autenticacao

O endpoint HTTP e o namespace Socket.IO usam o mesmo access token JWT retornado pelo login da API.

- HTTP: `Authorization: Bearer <access_token>`
- Socket.IO: `auth.token` ou `auth.access_token`
- Namespace: `/processos`

Exemplo de conexao:

```ts
const socket = io(`${API_URL}/processos`, {
  auth: { token: accessToken },
});
```

Conexoes sem token, com token expirado ou pertencentes a usuarios removidos sao recusadas e recebem `process:error` com `code: "UNAUTHORIZED"` antes da desconexao.

## Snapshot HTTP

```http
GET /processos/:id/dashboard
Authorization: Bearer <access_token>
```

O endpoint devolve o estado consistente para montar todos os cards, inclusive depois de atualizar a pagina ou restabelecer uma conexao:

```json
{
  "id_processo": 10,
  "snapshot_at": "2026-07-16T12:00:01.000Z",
  "nome_processo": "Processo 10",
  "status_processo": "EM_EXECUCAO",
  "vacuo_alvo": -80,
  "vacuo_atual": -76,
  "tempo_maximo": 600,
  "tempo_execucao": null,
  "iniciado_em": "2026-07-16T11:59:00.000Z",
  "finalizado_em": null,
  "progresso_percentual": 33.33,
  "subsistema_auxiliar": {
    "id_processo": 10,
    "modo_operacao_auxiliar": "AUTOMATICO",
    "status_subsistema": "DISPONIVEL",
    "versao": 1,
    "tanque_em_atendimento": null,
    "bomba_auxiliar": null,
    "tanques": [],
    "motivo_bloqueio": null,
    "ultimo_erro": null,
    "atualizado_em": "2026-07-16T12:00:01.000Z",
    "snapshot_at": "2026-07-16T12:00:01.000Z"
  },
  "tanques": [
    {
      "id_processo_tanque": 20,
      "id_tanque": 1,
      "nome_tanque": "Tanque 1",
      "status_tanque_processo": "VACUO_ATINGIDO",
      "vacuo_atingido": true,
      "vacuo_estabilizado": false,
      "vacuo_alvo": -80,
      "vacuo_atual": -76,
      "vacuo_inicial": -5,
      "vacuo_final": -76,
      "vacuo_medio": -40,
      "eficiencia": 95,
      "iniciado_em": "2026-07-16T11:59:00.000Z",
      "finalizado_em": null,
      "ultima_leitura_em": "2026-07-16T12:00:00.000Z",
      "ultima_leitura_recebida_em": "2026-07-16T12:00:01.000Z",
      "total_sensores": 1,
      "total_leituras": 2,
      "estagnacao": {
        "status": "NORMAL",
        "suspeita": false,
        "detectada": false,
        "iniciada_em": null,
        "detectada_em": null,
        "ultima_avaliacao_em": "2026-07-16T12:00:00.000Z",
        "duracao_segundos": 0,
        "variacao_vacuo": 9.5,
        "janela_segundos": 60,
        "variacao_minima_esperada": 2,
        "leituras_janela": 7,
        "leituras_minimas": 5,
        "janelas_sem_progresso": 0,
        "janelas_consecutivas_necessarias": 2,
        "id_alarme_ativo": null,
        "mensagem": "Progresso de vacuo dentro do esperado."
      },
      "leituras": [
        {
          "id_leitura_sensor": 50,
          "id_processo_tanque_sensor": 30,
          "id_tanque": 1,
          "id_sensor": 3,
          "valor_vacuo": -76,
          "leitura_em": "2026-07-16T12:00:00.000Z",
          "recebido_em": "2026-07-16T12:00:01.000Z"
        }
      ]
    }
  ],
  "alarmes": {
    "total": 0,
    "criticos": 0,
    "medios": 0,
    "infos": 0,
    "ultima_severidade": null
  }
}
```

Cada sensor fornece ate 50 leituras recentes no snapshot. `total_leituras` representa a contagem completa persistida, nao apenas a quantidade devolvida em `leituras`.

## Contrato de encerramento

O snapshot possui `encerramento` no nivel do processo e de cada tanque. Os parametros sao copiados da configuracao do sistema quando o processo e criado e permanecem congelados durante a execucao.

```json
{
  "encerramento": {
    "habilitado": true,
    "fase_processo": "GERANDO_VACUO",
    "pode_desacoplar": false,
    "total_tanques": 3,
    "tanques_concluidos": 0,
    "tanques_prontos": 1,
    "tanques_aguardando_acao_manual": 0,
    "tanques_pendentes": 3,
    "versao": 0,
    "parametros": {
      "tolerancia_vacuo_percentual": 10,
      "limite_seguranca_vacuo": -95,
      "tempo_estabilizacao_segundos": 30,
      "cobertura_minima_percentual": 80,
      "intervalo_leitura_esperado_ms": 1000,
      "timeout_leitura_sensor_ms": 2500,
      "tempo_retencao_segundos": 30,
      "perda_vacuo_maxima_retencao": 2
    }
  }
}
```

Em cada item de `tanques`, `encerramento.status` pode ser `INATIVO`, `MONITORANDO`, `AGUARDANDO_ESTABILIZACAO`, `PRONTO_PARA_ENCERRAR`, `AGUARDANDO_ACAO_MANUAL`, `ISOLANDO`, `VERIFICANDO_RETENCAO`, `RETENCAO_APROVADA`, `CONCLUIDO`, `BLOQUEADO` ou `FALHA`. O mesmo objeto traz evidencias de estabilizacao, configuracao de retencao, limite de seguranca, acoplamento e a versao do tanque.

`encerramento.etapa` detalha a etapa recuperavel da maquina de estados: `NENHUMA`, `AGUARDANDO_AUXILIAR_SEGURO`, `FECHANDO_VALVULA_PRINCIPAL`, `AGUARDANDO_LEITURA_ISOLAMENTO`, `RETENDO`, `REABRINDO_VALVULA_PRINCIPAL`, `CONCLUIDA` ou `FALHA`. `tentativa`, `comando_tentativas` e `proxima_tentativa_em` permitem ao front exibir repeticoes controladas de comandos e recuperar o estado depois de uma reconexao.

`pode_desacoplar` e derivado pela API e nao e gravado como uma escolha do cliente. Ele permanece `false` ate o processo estar `CONCLUIDO`, na fase `FINALIZADO`, com todos os tanques em `encerramento.status = CONCLUIDO`.

Quando `encerramento_automatico=true`, `PRONTO_PARA_ENCERRAR` inicia automaticamente o isolamento. Quando a opcao esta desativada, o tanque permanece em `AGUARDANDO_ACAO_MANUAL` ate um tecnico ou administrador chamar:

```http
POST /processos/:id/tanques/:id_processo_tanque/encerramento/iniciar
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "expected_version": 4,
  "motivo": "Tanque estabilizado; iniciar encerramento individual."
}
```

O endpoint apenas aceita a solicitacao depois de validar processo em execucao, versao, estabilizacao, leitura recente, tolerancia de vacuo, limite de seguranca, acoplamento, alarmes criticos e as duas valvulas do tanque. A execucao continua de forma persistente e exige ACK final do ESP32.

A sequencia individual e: confirmar bomba auxiliar segura, confirmar valvula auxiliar fechada, fechar a valvula principal, obter a primeira leitura posterior ao isolamento e medir a retencao. Uma retencao aprovada conclui somente aquele tanque. Perda de vacuo acima do limite reabre apenas a valvula principal e reinicia a estabilizacao; desacoplamento, sensor obsoleto, excesso de vacuo ou incerteza persistente de ACK terminam em `FALHA`.

## Inscricao na sala do processo

Depois da autenticacao, o cliente deve entrar na sala do processo:

```ts
socket.emit('process:join', { id_processo: 10 });
socket.on('process:joined', ({ id_processo, room }) => {
  // room === "process:10"
});
```

As atualizacoes de tanque sao emitidas somente para essa sala.

## Atualizacao em tempo real

Evento: `process:tank-updated`

Ele e emitido depois que a leitura foi persistida e o monitor individual terminou de atualizar o lifecycle e as metricas do tanque:

```json
{
  "id_processo": 10,
  "id_processo_tanque": 20,
  "id_tanque": 1,
  "lifecycle_changed": true,
  "previous_status": "GERANDO_VACUO",
  "closure_changed": true,
  "previous_closure_status": "MONITORANDO",
  "stagnation_changed": false,
  "previous_stagnation_status": "NORMAL",
  "tank": {
    "id_processo_tanque": 20,
    "id_tanque": 1,
    "nome_tanque": "Tanque 1",
    "status_tanque_processo": "VACUO_ATINGIDO",
    "vacuo_atingido": true,
    "vacuo_estabilizado": false,
    "vacuo_alvo": -80,
    "vacuo_atual": -76,
    "vacuo_inicial": -5,
    "vacuo_final": -76,
    "vacuo_medio": -40,
    "eficiencia": 95,
    "iniciado_em": "2026-07-16T11:59:00.000Z",
    "finalizado_em": null,
    "ultima_leitura_em": "2026-07-16T12:00:00.000Z",
    "ultima_leitura_recebida_em": "2026-07-16T12:00:01.000Z",
    "total_sensores": 1,
    "total_leituras": 2,
    "estagnacao": {
      "status": "NORMAL",
      "suspeita": false,
      "detectada": false,
      "iniciada_em": null,
      "detectada_em": null,
      "ultima_avaliacao_em": null,
      "duracao_segundos": 0,
      "variacao_vacuo": null,
      "janela_segundos": 60,
      "variacao_minima_esperada": 2,
      "leituras_janela": 0,
      "leituras_minimas": 5,
      "janelas_sem_progresso": 0,
      "janelas_consecutivas_necessarias": 2,
      "id_alarme_ativo": null,
      "mensagem": "Detector aguardando uma janela completa de leituras."
    }
  },
  "reading": {
    "id_leitura_sensor": 50,
    "id_processo_tanque_sensor": 30,
    "id_tanque": 1,
    "id_sensor": 3,
    "valor_vacuo": -76,
    "leitura_em": "2026-07-16T12:00:00.000Z",
    "recebido_em": "2026-07-16T12:00:01.000Z"
  },
  "emitted_at": "2026-07-16T12:00:01.100Z"
}
```

`lifecycle_changed` indica se a leitura causou uma transicao do tanque. `closure_changed` e `previous_closure_status` identificam a transicao do contrato de encerramento. `stagnation_changed` indica a mudanca entre `NORMAL`, `SUSPEITA` e `DETECTADA`; `previous_stagnation_status` permite ao front-end decidir se deve abrir, atualizar ou remover uma sinalizacao. O evento tambem e emitido quando os estados permanecem iguais, pois leituras, media, eficiencia, contadores e diagnostico ainda podem ter mudado.

Mudancas causadas pelo orquestrador de encerramento, mesmo sem uma nova leitura, usam o evento `process:tank-closure-updated`. O payload possui `id_processo`, `id_processo_tanque`, `id_tanque`, `previous_status`, o objeto `closure` completo, `message` e `emitted_at`. O front deve substituir somente `tank.encerramento` do card correspondente.

## Detector de estagnacao no front-end

O estado completo fica em `tank.estagnacao`, tanto no snapshot HTTP quanto no evento Socket.IO. Assim, o card pode exibir:

- `NORMAL`: operacao sem indicio de estagnacao;
- `SUSPEITA`: primeira janela valida com progresso abaixo do minimo, ainda em observacao;
- `DETECTADA`: quantidade configurada de janelas consecutivas sem progresso, com alarme operacional ativo;
- `mensagem`, duracao, variacao medida, amostras e limites configurados para explicar o diagnostico sem reproduzir o algoritmo no navegador.

O detector apenas alerta; ele nao interrompe automaticamente o processo. Quando o vacuo volta a progredir, o tanque atinge o alvo ou sai da execucao, o estado volta a `NORMAL` e o alarme ativo e normalizado pela API.

## Ordem recomendada e recuperacao

1. Conectar em `/processos` com o JWT.
2. Emitir `process:join` e aguardar `process:joined`.
3. Iniciar a escuta de `process:tank-updated`.
4. Iniciar a escuta de `process:tank-closure-updated`.
5. Iniciar a escuta de `process:auxiliary-state-updated`.
6. Consultar `GET /processos/:id/dashboard`.
7. Montar os cards pelo snapshot e aplicar eventos com `emitted_at` posterior a `snapshot_at`.
8. Em toda reconexao, repetir a entrada na sala e a consulta HTTP.

Essa sequencia evita perda de atualizacoes durante a janela entre a reconexao e a recuperacao do snapshot.
