# Contrato de estado do subsistema auxiliar

Este contrato separa o lifecycle principal do processo do estado mutavel da bomba auxiliar e das valvulas auxiliares por tanque. Ele prepara a API para os modos automatico, assistido e manual sem permitir que a automacao e um usuario disputem o mesmo recurso.

## Configuracao do processo

Na criacao, `modo_operacao_auxiliar` e obrigatorio:

```json
{
  "nome_processo": "Lote 001",
  "tempo_maximo": 900,
  "vacuo_alvo": -80,
  "modo_operacao_auxiliar": "AUTOMATICO",
  "tanques": []
}
```

Valores aceitos:

- `AUTOMATICO`: a API podera decidir e comandar o subsistema auxiliar.
- `ASSISTIDO`: a automacao podera operar enquanto nenhum usuario possuir o controle do recurso.
- `MANUAL`: a API continuara monitorando e validando seguranca, mas nao tomara decisoes automaticas de acionamento auxiliar.

O modo pode ser alterado por `PATCH /processos/:id/config` somente enquanto o processo estiver `CONFIGURADO`.

## Snapshot HTTP

```http
GET /processos/:id/auxiliar
Authorization: Bearer <access_token>
```

Operador, tecnico e administrador podem consultar. O endpoint nao executa comandos.

```json
{
  "id_processo": 10,
  "modo_operacao_auxiliar": "ASSISTIDO",
  "status_subsistema": "AGUARDANDO",
  "versao": 4,
  "tanque_em_atendimento": null,
  "bomba_auxiliar": {
    "id_bomba": 2,
    "nome": "Bomba auxiliar",
    "codigo_hardware": "BOMBA_VACUO_AUXILIAR",
    "status_configuracao": "ATIVA",
    "ligada_hardware": false,
    "disponivel_hardware": true,
    "ultimo_status_hardware_em": "2026-07-16T12:00:00.000Z",
    "controle": null
  },
  "tanques": [
    {
      "id_processo_tanque_auxiliar": 50,
      "id_processo_tanque": 20,
      "id_tanque": 1,
      "nome_tanque": "Tanque 1",
      "status_auxilio": "AGUARDANDO",
      "prioridade": 0,
      "posicao_fila": 1,
      "solicitado_em": "2026-07-16T12:00:01.000Z",
      "iniciado_em": null,
      "finalizado_em": null,
      "versao": 2,
      "motivo_bloqueio": null,
      "ultimo_erro": null,
      "status_acoplamento": "ACOPLADA",
      "quantidade_valvulas_auxiliares": 1,
      "valvula_auxiliar": {
        "id_valvula": 4,
        "nome": "Valvula auxiliar T1",
        "codigo_hardware": "VA_T1",
        "status_valvula": "FECHADA",
        "ativa": true,
        "ultimo_acionamento": null,
        "controle": null
      }
    }
  ],
  "motivo_bloqueio": null,
  "ultimo_erro": null,
  "atualizado_em": "2026-07-16T12:00:01.000Z",
  "snapshot_at": "2026-07-16T12:00:01.000Z"
}
```

`status_configuracao` nao representa confirmacao fisica da bomba. Os campos `ligada_hardware`, `disponivel_hardware` e `ultimo_status_hardware_em` sao a telemetria destinada ao status publicado pelo ESP32 e permanecem `null` enquanto ainda nao houve status valido.

## Estados persistidos

O subsistema possui os estados `INATIVO`, `DISPONIVEL`, `AGUARDANDO`, `PREPARANDO`, `OPERANDO`, `TROCANDO_TANQUE`, `CONTROLE_MANUAL`, `BLOQUEADO` e `FALHA`.

Cada tanque possui `INATIVO`, `MONITORANDO`, `ELEGIVEL`, `AGUARDANDO`, `EM_ATENDIMENTO`, `ATENDIDO`, `BLOQUEADO` e `FALHA`.

Ao iniciar ou retomar um processo, o subsistema passa para `DISPONIVEL` e os tanques para `MONITORANDO`. Pausa e encerramentos neutralizam o contrato e liberam titulares. Uma falha do processo marca o contrato auxiliar como `FALHA`.

## Concorrencia e titularidade

`versao` e o token de concorrencia otimista. Toda futura operacao de assumir controle, liberar controle, enfileirar tanque ou trocar atendimento devera comparar a versao recebida com a persistida antes de atualizar.

O controle da bomba e global porque a bomba auxiliar e compartilhada. O controle de valvula e individual por processo/tanque. Os dois controles possuem usuario, instante de aquisicao e expiracao, permitindo liberar automaticamente uma sessao abandonada.

## Socket.IO

Namespace: `/processos`

Depois de entrar em `process:<id_processo>`, o cliente recebe:

```text
process:auxiliary-state-updated
```

Payload:

```json
{
  "id_processo": 10,
  "auxiliary_state": {},
  "emitted_at": "2026-07-16T12:00:01.000Z"
}
```

O front-end deve usar HTTP para o snapshot inicial e recuperacao apos reconexao. O Socket.IO entrega apenas mudancas posteriores.

## Telemetria fisica

O status MQTT v2 do ESP32 e a fonte de `ligada_hardware`,
`disponivel_hardware` e `ultimo_status_hardware_em`. A configuracao
`status_configuracao` nunca e sobrescrita pela telemetria. O snapshot HTTP
reflete esses valores persistidos e o evento `hardware:status`, no namespace
`/mqtt-hardware`, publica a lista detalhada `status_bombas` em tempo real.

## Permissivos e intertravamentos compartilhados

`ProcessoAuxiliarSafetyValidator` e a unica base de decisao para as rotas
humanas e para o futuro escalonador automatico. Ele apenas avalia ou bloqueia;
nao aciona hardware. A avaliacao considera:

- modo `AUTOMATICO`, `ASSISTIDO` ou `MANUAL` e origem do comando;
- processo em execucao, parada de emergencia e alarmes criticos para qualquer
  acao que energize o subsistema;
- estado e versao otimista do subsistema e do tanque;
- lease de controle da bomba compartilhada ou da valvula do tanque;
- lifecycle, elegibilidade auxiliar e acoplamento fisico do tanque;
- bomba principal ligada antes de ligar a auxiliar;
- telemetria recente e disponibilidade fisica das bombas;
- exatamente uma valvula auxiliar aberta durante o atendimento;
- bomba auxiliar confirmadamente desligada antes de abrir ou fechar valvula.

Comandos que levam o equipamento ao estado seguro (`DESLIGAR_BOMBA_AUXILIAR`
e `FECHAR_VALVULA_AUXILIAR`) continuam permitidos no modo `AUTOMATICO`, mesmo
sob emergencia ou alarme. Em `ASSISTIDO` e `MANUAL`, eles tambem respeitam a
titularidade. O fechamento de valvula exige confirmacao recente de que a bomba
auxiliar esta desligada.

## Controle humano

Todas as rotas abaixo exigem perfil `TECNICO` ou `ADMINISTRADOR`. Operadores
continuam com acesso somente de leitura ao snapshot.

### Leases

```text
POST /processos/:id/auxiliar/controle-bomba/assumir
POST /processos/:id/auxiliar/controle-bomba/liberar
POST /processos/:id/tanques/:id_processo_tanque/auxiliar/controle-valvula/assumir
POST /processos/:id/tanques/:id_processo_tanque/auxiliar/controle-valvula/liberar
```

Corpo para assumir:

```json
{
  "expected_version": 4,
  "duration_seconds": 120,
  "motivo": "Ajuste tecnico supervisionado."
}
```

`duration_seconds` e opcional, assume `120` e aceita de `30` a `300`
segundos. O modo `AUTOMATICO` nao aceita lease humano. Em `ASSISTIDO` e
`MANUAL`, o lease so e adquirido se o processo estiver em execucao, a versao
for atual e o recurso estiver livre, pertencente ao mesmo usuario ou com lease
expirado.

Corpo para liberar:

```json
{
  "expected_version": 5,
  "motivo": "Intervencao concluida."
}
```

A bomba so pode ser liberada depois de sua telemetria confirmar `desligada` e
de todas as valvulas auxiliares estarem fechadas. A valvula so pode ser
liberada quando estiver confirmadamente fechada.

### Comandos

```text
POST /processos/:id/tanques/:id_processo_tanque/auxiliar/valvula/abrir
POST /processos/:id/tanques/:id_processo_tanque/auxiliar/bomba/ligar
POST /processos/:id/auxiliar/bomba/desligar
POST /processos/:id/tanques/:id_processo_tanque/auxiliar/valvula/fechar
```

Corpo dos comandos associados a um tanque:

```json
{
  "expected_subsystem_version": 6,
  "expected_tank_version": 3,
  "correlation_id": "front-aux-command-018f51f1",
  "motivo": "Auxilio manual para recuperar o progresso do tanque."
}
```

Para desligar somente a bomba, `expected_tank_version` nao e necessario.
`correlation_id` e opcional e pode ser reutilizado ao repetir a mesma
requisicao; ele tambem correlaciona comando e ACK MQTT. O cliente sempre deve
enviar as versoes do ultimo snapshot recebido e tratar `409 Conflict`
recarregando `GET /processos/:id/auxiliar`.

Em `ASSISTIDO` e `MANUAL`, ligar a bomba exige que o mesmo usuario possua os
leases ativos da bomba e da valvula do tanque. Abrir/fechar valvula exige o
lease da valvula; desligar a bomba exige o lease da bomba. As rotas genericas
de precheck nao aceitam valvulas auxiliares, evitando contornar essas regras.

### Ordem segura e confirmacao

A sequencia normal e:

1. assumir os leases necessarios;
2. abrir a valvula auxiliar com a bomba auxiliar desligada;
3. ligar a bomba auxiliar;
4. desligar a bomba auxiliar;
5. fechar a valvula;
6. liberar os leases.

Cada comando faz uma avaliacao de seguranca, reserva as versoes por OCC em uma
transacao curta, reavalia os permissivos, publica MQTT e aguarda o ACK. O MQTT
nao fica dentro de uma transacao de banco. Antes do ACK, falhas restauram a
reserva; depois de um ACK confirmado, qualquer conflito ao consolidar o estado
marca o contrato como `FALHA`, pois o hardware pode ter mudado sem que a API
possa afirmar um estado persistido consistente.

A resposta HTTP inclui o resultado do comando, as novas versoes e
`auxiliary_state`. A mesma mutacao publica `process:auxiliary-state-updated`
para atualizar os clientes conectados. Acoes e falhas sao registradas nos logs
operacionais; comandos confirmados tambem geram eventos do processo.

## Escalonador automatico

O escalonador reavalia o processo ativo a cada segundo. O job usa
`waitForCompletion`, portanto uma nova execucao local nao inicia enquanto o
ciclo anterior ainda estiver aguardando validacao, MQTT ou ACK. As versoes OCC
continuam protegendo contra outra instancia da API ou contra um comando humano
concorrente.

O job pode ser desabilitado operacionalmente com:

```text
AUXILIARY_SCHEDULER_DISABLED=true
```

### Formacao e ordenacao da fila

Um tanque entra na decisao quando:

- o processo esta `EM_EXECUCAO`;
- o lifecycle individual esta `GERANDO_VACUO`;
- o detector esta em `DETECTADA`;
- o contrato auxiliar nao esta atendido, bloqueado ou em falha.

Em `AUTOMATICO` e `ASSISTIDO`, ele passa para `AGUARDANDO`. A fila ordena por
maior `prioridade`, depois pelo `solicitado_em` mais antigo e finalmente pelo
menor `id_processo_tanque`. Apenas um tanque pode ocupar
`id_processo_tanque_atual`.

Quando a estagnacao normaliza antes do atendimento, o tanque volta para
`MONITORANDO` e sai da fila. Um tanque bloqueado por timeout tambem so volta a
ser elegivel depois que o detector normalizar.

### Comportamento por modo

- `AUTOMATICO`: seleciona e executa toda a sequencia sem usuario.
- `ASSISTIDO`: faz o mesmo enquanto nao existir lease humano ativo. Ao detectar
  um lease, inicia a parada segura no proximo ciclo, sem interromper uma
  transacao ou um ACK em andamento.
- `MANUAL`: transforma a estagnacao em `ELEGIVEL`, preenche
  `motivo_bloqueio` com a recomendacao e nunca executa comandos que energizam.
  Comandos de desligamento/fechamento continuam permitidos como fail-safe se
  um lease expirar deixando hardware ativo.

Leases vencidos sao limpos automaticamente. No modo assistido, a aquisicao de
controle durante `OPERANDO` muda o contrato para `CONTROLE_MANUAL`; o
escalonador desliga a bomba e fecha a valvula antes de liberar o subsistema
fisico para novas decisoes humanas.

### Maquina de estados fisica

A sequencia automatica executa uma etapa por ciclo:

1. selecionar o primeiro tanque e reservar as versoes;
2. abrir somente sua valvula auxiliar e aguardar ACK;
3. aguardar a telemetria confirmar a valvula aberta;
4. ligar a bomba auxiliar e aguardar ACK;
5. manter o atendimento enquanto a estagnacao permanecer detectada;
6. desligar a bomba e aguardar a telemetria confirmar a parada;
7. fechar a valvula e liberar o tanque atual.

O atendimento termina quando ocorrer o primeiro destes casos:

- vacuo final atingido ou estabilizado;
- detector de estagnacao normalizado;
- lease humano adquirido no modo assistido;
- processo pausado ou fora de execucao;
- timeout de atendimento;
- divergencia ou falha de hardware.

O timeout e derivado de
`estagnacao_janela_segundos * estagnacao_janelas_consecutivas`, limitado pelo
`tempo_maximo` do processo e com piso de 30 segundos. Com os valores padrao,
ele e de 120 segundos. Se esse limite terminar sem progresso, o tanque passa
para `BLOQUEADO` e nao e selecionado repetidamente.

Falhas de concorrencia recebem uma retentativa com pequeno backoff. Falhas de
MQTT, telemetria ausente ou estado fisico invalido levam o contrato a `FALHA`,
evitando que a API presuma um estado seguro. Bomba ligada ou valvula aberta sem
tanque selecionado acionam a sequencia de neutralizacao.

Toda alteracao de fila ou etapa confirmada publica
`process:auxiliary-state-updated`. Assim, o front-end usa os campos ja
existentes `status_subsistema`, `tanque_em_atendimento`, `status_auxilio`,
`posicao_fila`, `motivo_bloqueio`, `ultimo_erro` e as versoes para mostrar
recomendacao, espera, atendimento, cessao humana, bloqueio e falha em tempo
real.
