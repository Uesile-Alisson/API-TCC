# Seeds de Validacao TSEA

## Fase 1 - Base Configuravel

Cria dados sinteticos para:

- configuracao do sistema;
- MQTT;
- tanques;
- bombas;
- sensores de vacuo;
- sensores de acoplamento;
- valvulas.

## Seguranca

- nao roda sem `ALLOW_VALIDATION_SEED=true`;
- nao roda em producao;
- nao apaga dados;
- nao cria usuario;
- nao cria relatorio/GridFS;
- nao conecta MQTT;
- nao publica no broker;
- nao altera Prisma schema ou migrations.

## Como Executar

PowerShell:

```powershell
$env:ALLOW_VALIDATION_SEED="true"
npm run seed:validation:phase1
Remove-Item Env:\ALLOW_VALIDATION_SEED
```

Outros shells:

```bash
ALLOW_VALIDATION_SEED=true npm run seed:validation:phase1
```

## Idempotencia

Os registros usam identificadores estaveis com prefixo `TSEA_VAL_`.

- `mqttconfiguracoes`: `chave_configuracao = MQTT_PRINCIPAL`, pois o banco possui a constraint `chk_mqtt_config_chave_valida`.
- `tanques`, `bombas` e `sensores`: chave unica `nome`.
- `sensoresacoplamentomangueiras`: chave primaria `id_sensor`.
- `valvulas`: combinacao real `id_bomba + numero_saida_manifold`.
- `configuracoessistema`: singleton por primeiro registro encontrado.

## Adaptacoes ao Schema Real

O schema atual usa nomes diferentes dos exemplos conceituais do prompt:

- tanques usam `nome`, `volume`, `unidade_volume`, `vacuo_padrao`, `status_tanque`.
- bombas usam `nome`, `tipo_bomba`, `status_padrao`, `entrada_por_pressao`, `entrada_por_tempo`.
- sensores usam `nome`, `modelo`, `protocolo`, `unidade_medida`, `status_sensor`, `tipo_sensor`.
- MQTT usa `chave_configuracao`, `broker_url`, `porta`, topicos reais, `status_conexao`.
- MQTT nao usa prefixo `TSEA_VAL_` na chave porque a constraint real aceita a chave principal do sistema.
- valvulas existem como `valvulas`.
- sensores de acoplamento existem como `sensoresacoplamentomangueiras`.
- sensores de acoplamento possuem constraints temporais sobre `atualizado_em`, `ultima_verificacao` e `ultimo_evento_em`; a seed cria esses campos opcionais como nulos e nao atualiza a linha de acoplamento quando ela ja existe.

Campos conceituais nao existentes no schema, portanto nao usados:

- `nome_tanque`, `identificacao`, `numero_tanque`, `volume_litros`, `capacidade_litros`, `ativo` em tanques;
- `nome_bomba`, `identificacao`, `numero_bomba`, `tipo_acionamento`, `tempo_acionamento_segundos`, `pressao_acionamento`, `ativo` em bombas;
- `protocolo_sensor` como nome de campo, pois o schema usa `protocolo`.

## Fase 2 - Massa Operacional

Cria processos sinteticos com multiplos status, leituras e logs para testar:

- aba Processos;
- detalhes;
- graficos;
- Historico;
- relatorios de processo;
- validacao frontend.

### Pre-checagens

A Fase 2 aborta se faltar:

- configuracao do sistema;
- pelo menos 2 tanques ativos de validacao;
- pelo menos 1 bomba ativa de validacao;
- pelo menos 2 sensores de vacuo ativos de validacao;
- usuario ADMINISTRADOR ou TECNICO existente.

A seed nao cria usuarios. Se nao houver usuario valido, rode o seed de usuario existente do projeto.

### Massa Criada

- 14 processos `TSEA_VAL_PROCESSO_XX`.
- Vinculo de cada processo com 1 tanque.
- Vinculo de cada processo/tanque com 1 sensor de vacuo.
- 16 leituras de vacuo por processo iniciado.
- Eventos operacionais em `eventos`.
- Logs operacionais em `logsoperacionais`.

### Adaptacoes ao Schema Real

- O schema nao possui `observacao` em `processos`; a marcacao de validacao fica em `nome_processo`, eventos e logs.
- O enum real de `statusprocesso` nao possui `AGUARDANDO`, `CANCELADO`, `EM_ANDAMENTO` ou `EM_PREPARACAO`; a seed usa `CONFIGURADO`, `EM_EXECUCAO`, `PAUSADO`, `CONCLUIDO`, `INTERROMPIDO` e `FALHA`.
- As leituras usam `id_processo_tanque_sensor`, nao `id_processo` direto.
- O Historico do projeto e derivado de `processos`, sem tabela propria de historico.

PowerShell:

```powershell
$env:ALLOW_VALIDATION_SEED="true"
npm run seed:validation:phase2
Remove-Item Env:\ALLOW_VALIDATION_SEED
```

## Fase 3 - Alarmes, Eventos e Pre-requisitos de Relatorios

Cria alarmes e eventos sinteticos para testar:

- aba Alarmes;
- graficos e dashboard de alarmes;
- Historico com alarmes por processo;
- relatorio de Alarme PDF por endpoint real;
- validacao GridFS real posterior.

A seed nao cria PDF, XLSX, CSV, relatorio nem arquivo GridFS.

### Pre-checagens

A Fase 3 aborta se faltar:

- processos de validacao da Fase 2;
- pelo menos 1 processo concluido ou falho;
- tanques de validacao;
- sensores de vacuo de validacao;
- usuario ADMINISTRADOR ou TECNICO existente.

A seed nao cria usuarios. Se nao houver usuario valido, rode o seed de usuario existente do projeto.

### Massa Criada

- 12 alarmes `TSEA_VAL_ALARME_XX_*`.
- 4 alarmes `CRITICO`, 4 `MEDIO` e 4 `INFO`.
- Status reais `ATIVO` e `RESOLVIDO`.
- Alarmes vinculados a `id_processo`, `id_processo_tanque` e, quando aplicavel, `id_processo_tanque_sensor`.
- Eventos relacionados em `eventos`.
- Logs de criacao e resolucao em `logsoperacionais`.
- Pelo menos 1 alarme resolvido, com processo/tanque/sensor e sem relatorio previo, apto a gerar relatorio PDF pelo endpoint real.

### Adaptacoes ao Schema Real

- O enum real de `statusalarme` possui apenas `ATIVO` e `RESOLVIDO`; nao existem `IGNORADO`, `ARQUIVADO` ou `ABERTO`.
- O enum real de `tipoalarme` usa categorias como `PROCESSO`, `SENSOR`, `BOMBA`, `MQTT`, `ESP32`, `SEGURANCA`, `SISTEMA`, `TANQUE` e `MANGUEIRA`; nomes conceituais como `VACUO_NAO_ATINGIDO` ficam em titulo/descricao.
- O schema de `alarmes` nao possui `id_sensor` ou `id_tanque` direto; vinculos usam `id_processo_tanque` e `id_processo_tanque_sensor`.
- Alarmes de acoplamento nao criam `processostanquessensores` de acoplamento para nao alterar o select de processo; ficam vinculados ao processo/tanque e documentam o sensor na descricao.
- Nao ha tabela/modelo de auditoria no schema atual; auditoria formal nao e criada.
- `eventos` nao possui enum `ALARME_CRIADO` ou `ALARME_RESOLVIDO`; essas acoes ficam em `logsoperacionais.acao`.

PowerShell:

```powershell
$env:ALLOW_VALIDATION_SEED="true"
npm run seed:validation:phase3
Remove-Item Env:\ALLOW_VALIDATION_SEED
```
