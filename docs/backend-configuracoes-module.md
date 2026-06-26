# Modulo de Configuracoes - TSEA API

## 1. Objetivo
Centralizar Configuracoes do Sistema, Tanques e Bombas no backend NestJS, mantendo todas as rotas sob `/api/configuracoes`.

## 2. Rotas
### Sistema
- `GET /api/configuracoes/sistema`
- `PATCH /api/configuracoes/sistema`

### Tanques
- `GET /api/configuracoes/tanques`
- `GET /api/configuracoes/tanques/:id_tanque`
- `POST /api/configuracoes/tanques`
- `PATCH /api/configuracoes/tanques/:id_tanque`
- `PATCH /api/configuracoes/tanques/:id_tanque/ativar`
- `PATCH /api/configuracoes/tanques/:id_tanque/desativar`

### Bombas
- `GET /api/configuracoes/bombas`
- `GET /api/configuracoes/bombas/:id_bomba`
- `POST /api/configuracoes/bombas`
- `PATCH /api/configuracoes/bombas/:id_bomba`
- `PATCH /api/configuracoes/bombas/:id_bomba/ativar`
- `PATCH /api/configuracoes/bombas/:id_bomba/desativar`

### Sensores
- `GET /api/configuracoes/sensores`
- `GET /api/configuracoes/sensores/:id_sensor`
- `POST /api/configuracoes/sensores`
- `PATCH /api/configuracoes/sensores/:id_sensor`
- `PATCH /api/configuracoes/sensores/:id_sensor/ativar`
- `PATCH /api/configuracoes/sensores/:id_sensor/desativar`
- `GET /api/configuracoes/tanques/:id_tanque/sensores`

## 3. Permissoes
Todos os controllers usam `JwtAuthGuard`, `RolesGuard` e `@Roles('TECNICO', 'ADMINISTRADOR')`.

`OPERADOR` fica bloqueado em todos os endpoints de configuracoes.

## 4. DTOs e validacoes
Sistema aceita apenas campos configuraveis do model `configuracoessistema`, com validacao de numeros, booleanos, enums e limites de tolerancia entre 0 e 100.

Tanques aceita apenas `nome`, `volume`, `unidade_volume`, `vacuo_padrao` e `status_tanque`.

Bombas aceita apenas `nome`, `tipo_bomba`, `status_padrao`, `entrada_por_pressao`, `entrada_por_tempo` e `encerramento_automatico`.

Sensores aceita apenas `nome`, `modelo`, `protocolo`, `unidade_medida`, `precisao`, `status_sensor`, `tipo_sensor` e `fator_calibracao`.

## 5. Campos readonly bloqueados
Campos como IDs, datas, relacoes, usuario de alteracao e campos operacionais nao sao aceitos no body. O `ValidationPipe` global usa `whitelist` e `forbidNonWhitelisted`.

## 6. Ativar/desativar
Tanques nao possuem campo `ativo`; ativar/desativar usa `status_tanque` com `ATIVO` e `INATIVO`.

Bombas nao possuem campo `ativo`; ativar/desativar usa `status_padrao` com `ATIVA` e `INATIVA`.

Sensores nao possuem campo `ativo`; ativar/desativar usa `status_sensor` com `ATIVO` e `INATIVO`.

## Sensores

### Objetivo
Fornecer sensores configuraveis e opcoes reais para a criacao/configuracao de processos.

### Contrato para Processos
O DTO de Processos usa `id_sensor` em `tanques[].sensores[]`. O vinculo `id_processo_tanque_sensor` e criado posteriormente pelo backend de Processos.

Por isso, `GET /api/configuracoes/tanques/:id_tanque/sensores` retorna opcoes com `id_sensor`. Como o schema nao possui relacao previa obrigatoria tanque-sensor para sensores de vacuo, a rota valida a existencia do tanque e retorna sensores globais disponiveis por padrao com `status_sensor=ATIVO` e `tipo_sensor=VACUO`, salvo filtros enviados.

### Permissoes
`TECNICO` e `ADMINISTRADOR`.

### O que nao faz
- Nao le sensor fisico.
- Nao conecta MQTT.
- Nao conecta ESP32.
- Nao altera processo.
- Nao cria leituras.

## 7. O que nao foi implementado
- DELETE
- comando direto de bomba
- comando direto de valvula
- MQTT direto
- ESP32 direto
- oleo/vazao/nivel/volume como fluxo funcional
- frontend
- migrations
- seed

## 8. Testes
Foram criados testes unitarios de service e controller para Sistema, Tanques e Bombas em `src/configuracoes/tests`.
