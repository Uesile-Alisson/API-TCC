# Contrato de partida segura e recuperavel

## Objetivo

A API so altera um processo de `CONFIGURADO` para `EM_EXECUCAO` depois de confirmar:

1. MQTT conectado, ESP32 online, sensores e acoplamentos aprovados pelo pre-check;
2. parada inicial com todas as valvulas fechadas e as duas bombas desligadas;
3. `SYNC_CONFIG` executado;
4. processo carregado no ESP32;
5. uma valvula principal aberta por tanque selecionado;
6. bomba principal ligada;
7. nova telemetria, posterior ao inicio da tentativa, confirmando o estado fisico final.

Qualquer falha inicia a sequencia segura bombas desligadas -> valvulas fechadas. O processo permanece `CONFIGURADO`. A partida e marcada como `FALHA` somente depois de o rollback receber ACK. Se o rollback nao puder ser confirmado, a partida permanece `EM_ANDAMENTO`, bloqueia outra operacao e o recuperador tenta novamente.

## Estado persistido

O modelo `processos` registra `status_partida`, `etapa_partida`, tentativa, versao otimista, marcador da telemetria, lease de execucao e ultimo erro. A versao impede duas instancias de avancarem a mesma etapa. O indice parcial `uq_processos_operacao_unica` impede que mais de um processo esteja em partida, execucao ou pausa.

Uma partida cuja lease expira e tratada como interrompida por queda/reinicializacao. O scheduler `processo-startup-recovery` assume a ocorrencia com compare-and-swap e executa a parada segura. Ele nao tenta continuar uma sequencia cujo contexto em memoria foi perdido.

## Diario MQTT

`comandosmqtt` e o diario duravel de comando e ACK. O registro e criado antes da publicacao e usa `correlation_id` como chave unica. Os estados persistidos sao:

- `PENDENTE`, `PUBLICADO` e `RECEBIDO`: comando ainda nao final;
- `EXECUTADO`: unico ACK que autoriza avancar;
- `RECUSADO` e `ERRO`: falha final reportada pelo ESP32;
- `TIMEOUT`: tentativa sem ACK final, que pode ser retransmitida com a mesma chave idempotente.

Depois de uma reinicializacao, um ACK `EXECUTADO` persistido e reutilizado sem republicar. Um comando ainda ativo aguarda a sessao MQTT entregar o ACK pendente; apos timeout, a automacao entra em rollback.

## MQTT e multiplas instancias

O cliente usa `clean: false` para manter a sessao QoS no broker. `MQTT_CLIENT_ID` deve ser estavel entre reinicializacoes e exclusivo por instancia simultanea. Reutilizar o mesmo identificador em duas replicas faz o broker desconectar uma delas.

Variaveis operacionais:

- `MQTT_CLIENT_ID`: identificador estavel e exclusivo da instancia;
- `PROCESS_STARTUP_RECOVERY_DISABLED=true`: desabilita apenas o scheduler de recuperacao, util em manutencao controlada e testes.

## Limites desta fase

Esta fase altera apenas a API, o schema Prisma, a migracao e os testes. Nao altera frontend ou firmware. A comprovacao com broker, ESP32 e hardware fisico continua obrigatoria antes de producao.
