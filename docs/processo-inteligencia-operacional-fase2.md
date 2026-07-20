# Fase 2 — Inteligencia operacional, sensores e auxiliar

## Objetivo

Esta fase torna as decisoes de estagnacao e de uso da bomba auxiliar explicaveis, reproduziveis e seguras. Os parametros sao copiados para o processo no momento da criacao e so podem ser alterados enquanto ele permanece `CONFIGURADO`; uma alteracao global posterior nao muda uma execucao em andamento.

## Detector adaptativo de estagnacao

A variacao de vacuo continua sendo suavizada pela diferenca entre as medias do primeiro e do ultimo terco da janela. Leituras nao finitas, fora da janela, de sensor indisponivel ou sem calibracao/liberacao valida nao participam do lifecycle.

A variacao minima efetiva e calculada por:

```text
minimo_ajustado = minimo_base
                  × fator_volume
                  × fator_tanques_ativos
                  × fator_proximidade_alvo
```

- `fator_volume = clamp(volume_medio_ativo / volume_tanque, 0.5, 2)`;
- `fator_tanques_ativos = 1 / sqrt(quantidade_ativa)`;
- `fator_proximidade_alvo` diminui gradualmente ate o limite configurado quando o tanque se aproxima do alvo;
- o detector so avalia depois do tempo minimo da bomba principal;
- a confirmacao exige janelas consecutivas, respeita o numero minimo de amostras e tambem possui um tempo maximo sem progresso.

As evidencias ficam persistidas em `processostanques` e aparecem em `GET /processos/:id/dashboard`, `process:tank-updated` e `process:dashboard-updated`: minimo base/ajustado, fatores, volumes, quantidade ativa, vacuo atual, distancia do alvo, tempo da bomba e motivo da decisao.

## Efetividade da bomba auxiliar

Durante cada atendimento, a API registra vacuo e tendencia antes, durante e depois do auxilio. A melhoria observada e a diferenca de magnitude entre o vacuo atual e a linha de base anterior ao acionamento.

- progresso normalizado ou melhoria minima comprovada: sequencia segura de desligamento e fechamento;
- evidencia ainda imatura: continua observando ate completar a janela;
- melhoria insuficiente: continua somente ate o timeout dedicado;
- timeout sem efeito: desliga a bomba, fecha a valvula, bloqueia nova tentativa automatica e cria alarme critico `BOMBA`, sem recuperacao automatica;
- lease humano no modo `ASSISTIDO`: continua tendo precedencia imediata.

As evidencias sao entregues por `GET /processos/:id/auxiliar` e `process:auxiliary-state-updated` no objeto `tanques[].evidencias`.

## Calibracao e integridade dos sensores

Uma leitura de processo e transformada por:

```text
valor_calibrado = valor_bruto × fator_calibracao + offset_calibracao
```

Fluxo tecnico:

1. `POST /configuracoes/sensores/:id_sensor/calibracao/iniciar` — exige ausencia de processo em execucao, pausado ou em partida; mantem o sensor inativo e limpa a leitura bruta anterior.
2. O ESP32 envia leitura MQTT com `modo=DIAGNOSTICO`; ela so atualiza `ultimo_valor_bruto` e nunca reativa o sensor.
3. `POST /configuracoes/sensores/:id_sensor/calibracao/finalizar` — registra referencia, responsavel, data, validade, incerteza, fator e offset; o sensor permanece inativo.
4. `PATCH /configuracoes/sensores/:id_sensor/ativar` — faz a liberacao tecnica rastreada. Calibracao vencida, integridade invalida ou calibracao ainda aberta bloqueiam a liberacao.

Falhas por faixa fisica, mudanca abrupta, oscilacao, travamento e timeout mudam o sensor para `FALHA` ou `DESCONECTADO`, removem sua liberacao e criam alarme bloqueante. Leituras posteriores nao reativam o dispositivo; nova liberacao tecnica e obrigatoria.

## Parametros

Os defaults ficam em `configuracoessistema` e podem ser atualizados pela rota existente de configuracao do sistema. Os mesmos campos podem ser informados em `POST /processos` e `PATCH /processos/:id/config`:

- `estagnacao_janela_segundos`;
- `estagnacao_variacao_minima`;
- `estagnacao_leituras_minimas`;
- `estagnacao_janelas_consecutivas`;
- `estagnacao_tempo_minimo_bomba_principal_segundos`;
- `estagnacao_tempo_maximo_sem_progresso_segundos`;
- `estagnacao_fator_minimo_proximidade_alvo`;
- `auxilio_janela_avaliacao_segundos`;
- `auxilio_melhoria_minima`;
- `auxilio_timeout_segundos`.

## Bases tecnicas consultadas

- [NIST — Metrological Traceability](https://www.nist.gov/metrology/metrological-traceability): cadeia documentada de referencia, resultado, incerteza e responsavel.
- [NIST — Recommended Calibration Interval](https://www.nist.gov/calibrations/recommended-calibration-interval): o intervalo depende de estabilidade, ambiente, uso e programa de garantia; nao existe validade universal.
- [NIST — Smoothing](https://www.itl.nist.gov/div898/software/dataplot/refman1/ch3/smooth.pdf): uso de medias/medianas em series ruidosas sem substituir os dados originais.
- [Prisma — Optimistic concurrency control](https://docs.prisma.io/docs/orm/v6/reference/prisma-client-reference): atualizacoes condicionais por versao para evitar decisoes concorrentes sobre o mesmo estado.
- [NestJS — Task scheduling](https://docs.nestjs.com/techniques/task-scheduling): ciclos agendados com protecao contra sobreposicao.
- [NestJS — WebSocket gateways](https://docs.nestjs.com/websockets/gateways): transporte dos snapshots operacionais em tempo real.
