# Contrato de encerramento geral do processo

## Objetivo

O encerramento geral somente conclui um processo depois que todos os tanques
selecionados concluirem o encerramento individual e o ESP32 confirmar, por ACK
e telemetria, que bombas e valvulas estao em estado seguro.

## Sequencia operacional

1. Validar que todos os tanques estao com encerramento `CONCLUIDO`, etapa
   `CONCLUIDA` e mangueira fisicamente acoplada.
2. Bloquear o subsistema auxiliar, revogar leases humanos e impedir novos
   comandos que energizem bomba ou valvula.
3. Enviar `FECHAR_TODAS_VALVULAS` para confirmar o isolamento antes da parada
   das bombas.
4. Enviar `DESLIGAR_TODAS_BOMBAS`.
5. Enviar novamente `FECHAR_TODAS_VALVULAS` como confirmacao final.
6. Aguardar telemetria posterior ao inicio da sequencia confirmando todas as
   bombas desligadas e todas as valvulas fechadas.
7. Somente entao gravar `status_processo=CONCLUIDO`,
   `fase_processo=FINALIZADO` e liberar o desacoplamento no snapshot HTTP.

Falhas repetem apenas comandos de estado seguro. O processo nao e concluido
quando ACK ou telemetria estiver ausente, recusado, vencido ou inconsistente.

## HTTP

- `GET /processos/:id/encerramento`: estado inicial e recuperacao apos
  reconexao.
- `GET /processos/:id/dashboard`: inclui `encerramento.geral` e a liberacao de
  desacoplamento.
- `POST /processos/:id/encerramento/finalizar`: inicia ou repete o fluxo manual
  com `expected_version` e `motivo`.
- `POST /processos/:id/finalizar`: rota de compatibilidade; tambem encaminha
  obrigatoriamente para a mesma maquina segura.

Quando `encerramento_automatico=true`, a API inicia o fluxo depois da conclusao
do ultimo tanque. Quando for `false`, o estado fica
`AGUARDANDO_ACAO_MANUAL` ate a chamada HTTP autorizada de tecnico ou
administrador.

## Socket.IO

Namespace: `/processos`. Depois de entrar na sala `process:<id_processo>`, o
front-end recebe `process:general-closure-updated` com:

- `previous_status`;
- `closure`, contendo status, etapa, versao, tentativas, datas e erro atual;
- `message` e `emitted_at`.

Na conclusao tambem sao emitidos `process:finished`,
`process:metrics-updated` e `process:status-changed`.

## Persistencia e recuperacao

Status, etapa, versao otimista, numero da execucao, tentativas de comando,
proxima tentativa e erro ficam em `processos`. Correlation IDs sao
deterministicos por processo, execucao e etapa, permitindo reaproveitar um ACK
final sem executar duas vezes o mesmo efeito apos reinicio da API.

## Parada de emergencia e confirmacao do controlador

A parada de emergencia reutiliza a persistencia, a versao otimista e o
reconciliador deste contrato, mas nao depende de encerramento automatico,
retencao dos tanques ou acoplamento das mangueiras. A origem e distinguida por
`parada_emergencia=true`.

O fluxo possui duas verdades independentes:

1. `status_processo=INTERROMPIDO` significa que a API bloqueou imediatamente a
   automacao e os leases humanos. Esse latch e persistido antes de qualquer
   acesso a rede.
2. `parada_emergencia.nivel_confirmacao=CONTROLADOR_CONFIRMADO` (e o alias de
   compatibilidade `hardware_confirmado=true`) significa que um unico snapshot
   completo, recebido pela API estritamente depois da sequencia, mostrou o
   latch de emergencia do ESP32 ativo, todas as bombas cadastradas comandadas
   como desligadas e todas as valvulas ativas comandadas como fechadas. O
   inventario precisa coincidir integralmente, sem item ausente, desconhecido
   ou duplicado. Snapshot MQTT retido nao vale como evidencia nova.

A evidencia tambem precisa usar o contrato `HARDWARE_STATUS` v2, possuir
`device_id`, ter sido recebida depois do marcador da sequencia e carregar um
`enviado_em` compativel com essa mesma janela. Assim, uma mensagem antiga que
apenas chegou depois da parada nao confirma a execucao atual. Correlacao ou
contador monotonicamente crescente emitido pelo firmware continua sendo um
endurecimento recomendado para uma futura versao do contrato.

O prototipo atual nao possui sensor dedicado de corrente/rotacao nas bombas ou
fim de curso nas valvulas. Portanto, `feedback_mecanico_disponivel=false`: a
API confirma as saidas logicas observadas pelo controlador, nao a posicao
mecanica independente. Essa diferenca deve permanecer visivel no front-end e a
validacao com hardware real continua obrigatoria.

ACK MQTT, inclusive `EXECUTADO`, comprova o processamento do comando pelo
cliente, mas nao substitui o snapshot integral do controlador. Por isso a API
sempre tenta `PARADA_EMERGENCIA`, `DESLIGAR_TODAS_BOMBAS` e
`FECHAR_TODAS_VALVULAS`; falhar em um comando nao impede os demais. Os dois
primeiros saem imediatamente e o fechamento das valvulas e tentado depois da
resposta do desligamento das bombas, pois o firmware rejeita fechar o manifold
com bomba ainda comandada como ligada.

Estados expostos ao front-end:

- `ACIONANDO`: latch logico persistido e sequencia de seguranca em envio;
- `AGUARDANDO_CONFIRMACAO`: comandos tentados, aguardando telemetria fresca;
- `CONFIRMADA`: latch e saidas seguras observados em um snapshot completo do
  ESP32;
- `FALHA`: tentativas esgotadas, hardware ainda desconhecido e intervencao
  tecnica obrigatoria.

`POST /processos/:id/parada-emergencia` responde `202 Accepted`. O front-end
deve ler `data.parada_emergencia.nivel_confirmacao`,
`saidas_controlador_confirmadas` e `feedback_mecanico_disponivel`; nunca deve
inferir seguranca apenas de `status_processo`. O mesmo estado integra
`GET /processos/:id/parada-emergencia`, `GET /processos/:id/dashboard` em
`parada_emergencia` e o evento Socket.IO
`process:emergency-stop`. Repetir o POST durante um lease pendente devolve o
estado atual sem duplicar comandos. Depois do vencimento do lease ou de uma
falha terminal, uma nova solicitacao autorizada inicia outra tentativa. Depois
de confirmada, a resposta permanece idempotente.

`POST /mqtt-hardware/commands/parada-emergencia` tambem responde `202` e usa o
mesmo coordenador. O corpo pode informar `id_processo`; sem ele, a API exige
que exista no maximo um processo em partida, execucao, pausa ou parada ainda
pendente. Se houver um alvo, o latch e persistido antes do I/O MQTT. Se nao
houver nenhum processo, a API tenta a sequencia global em modo best-effort e
devolve explicitamente `escopo=HARDWARE_GLOBAL`,
`persistencia_confirmada=false` e
`confirmacao_controlador=NAO_CONFIRMADA`. Mais de um alvo ambiguo e recusado.

Um `HARDWARE_STATUS` nao retido com `emergencia_ativa=true`, inclusive quando
a parada foi acionada localmente no ESP32, e reconciliado com o processo
operacional unico. Isso impede que o controlador permaneça travado em
emergencia enquanto a API continue mostrando o processo como ativo. O snapshot
que revelou o latch nao confirma a nova sequencia: a confirmacao ainda exige
uma telemetria integral posterior aos comandos coordenados.

Paradas pendentes sobrevivem ao reinicio da API e sao retomadas pelo
reconciliador. Paradas pendentes ou em falha bloqueiam novas partidas e
alteracoes de configuracao do equipamento; em `FALHA`, a intervencao e uma
nova solicitacao humana sao obrigatorias. Mesmo depois da confirmacao das
saidas, uma nova partida permanece bloqueada ate um snapshot posterior ao
reset fisico mostrar `HARDWARE_STATUS` v2, `device_id`, `esp32_on=true` e
`emergencia_ativa=false`, com horarios de envio e recebimento posteriores ao
marcador. Correlation IDs deterministicos evitam efeitos duplicados no ledger
MQTT.
