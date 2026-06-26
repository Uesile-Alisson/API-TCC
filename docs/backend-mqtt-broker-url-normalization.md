# Normalizacao de Broker MQTT

## Objetivo

Evitar falha `Invalid URL` no bootstrap da API quando a configuracao MQTT salva no banco usa formatos curtos como `localhost` ou `localhost:1883`.

## Regra aplicada

A API normaliza o valor de `broker_url` antes de conectar no MQTT:

- `localhost` vira `mqtt://localhost:1883/`;
- `localhost:1883` vira `mqtt://localhost:1883/`;
- `mqtt://localhost:1883` permanece como URL MQTT valida;
- `mqtts://broker.exemplo:8883` permanece como URL MQTTS valida;
- string vazia gera erro claro;
- protocolos diferentes de `mqtt://` e `mqtts://` sao rejeitados.

Quando `broker_url` nao informa porta, a API usa o campo `porta` da configuracao. O seed de validacao Fase 1 grava `mqtt://localhost:1883` para evitar reintroduzir a falha.

## Segurança

Logs de conexao MQTT usam a URL sanitizada e nao devem expor usuario ou senha embutidos na URI.

## Arquivos relacionados

- `src/mqtt-hardware/config/mqtt-broker-url.util.ts`
- `src/mqtt-hardware/connection/mqtt-client.service.ts`
- `src/mqtt-hardware/config/mqtt-config.service.ts`
- `prisma/seeds/validation/phase-1-base.seed.ts`
