# Firmware ESP32 TSEA

O sketch [`esp32_tsea.ino`](./esp32_tsea.ino) implementa o contrato MQTT v2 da API para **ESP32 Dev Module / ESP32-WROOM**, com duas bombas, seis válvulas, três tanques, três sensores de vácuo, três sensores de acoplamento e parada de emergência física.

## O que está implementado

- consumo de `SYNC_CONFIG` e resolução dos IDs reais por `codigo_hardware`;
- comandos operacionais e `INICIAR_PROCESSO_VACUO` com validação local completa;
- ACKs `RECEBIDO`, `EXECUTADO` e `RECUSADO`, com idempotência por `correlation_id`;
- heartbeat, status, leituras diagnósticas/de processo, acoplamentos e alarmes;
- saídas digitais ativas em `HIGH` para as duas bombas e as seis válvulas;
- estado seguro no boot: bombas desligadas e válvulas fechadas antes de configurar cada GPIO como saída;
- parada local por emergência, desacoplamento, perda do PCF8574, sensor inválido, limite de vácuo ou timeout MQTT;
- limite de tamanho e profundidade para JSON recebido;
- credenciais locais separadas do código versionado;
- TLS opcional com validação de CA, sem fallback para `setInsecure()`.

## Por que há um PCF8574

Os 12 GPIOs informados não bastam para 8 saídas, 3 acoplamentos, I²C e emergência: seriam necessários 14 GPIOs. Para não usar pinos fora da lista e não simular sensores, as oito saídas permanecem diretamente no ESP32 e os três acoplamentos usam um **PCF8574 a 3,3 V**, endereço `0x20`, no mesmo barramento I²C.

O firmware escreve `HIGH` nos oito bits do PCF8574 para liberá-los como entradas quasi-bidirecionais e lê `P0`, `P1` e `P2`. Cada contato de acoplamento deve fechar para GND quando acoplado. Aberto, rompido ou sem o expansor significa **não acoplado/indisponível** e bloqueia o processo.

O PCF8574 limita este barramento ao modo padrão de **100 kHz**. O TCA9548A continua em `0x70`, com os três sensores de vácuo nos canais 0, 1 e 2.

## Pinagem aplicada

| Função | Pino | Lógica |
|---|---:|---|
| `VP_T1` | GPIO16 | saída ativa em `HIGH` |
| `VA_T1` | GPIO17 | saída ativa em `HIGH` |
| `VP_T2` | GPIO18 | saída ativa em `HIGH` |
| `VA_T2` | GPIO19 | saída ativa em `HIGH` |
| `VP_T3` | GPIO25 | saída ativa em `HIGH` |
| `VA_T3` | GPIO26 | saída ativa em `HIGH` |
| Bomba principal | GPIO23 | saída ativa em `HIGH` |
| Bomba auxiliar | GPIO27 | saída ativa em `HIGH` |
| Emergência física | GPIO32 | `INPUT_PULLUP`; contato NC para GND; pressionada/fio rompido=`HIGH` |
| I²C SDA | GPIO21 | PCF8574 e TCA9548A |
| I²C SCL | GPIO22 | PCF8574 e TCA9548A |
| Reserva | GPIO33 | não utilizado |
| `ACOP_T1` | PCF8574 P0 | contato para GND quando acoplado |
| `ACOP_T2` | PCF8574 P1 | contato para GND quando acoplado |
| `ACOP_T3` | PCF8574 P2 | contato para GND quando acoplado |

GPIO16/17 podem estar reservados à PSRAM em placas WROVER; a pinagem acima é para DevKit/WROOM sem PSRAM nesses pinos.

## Credenciais e compilação

As credenciais recebidas foram colocadas somente em `secrets.h`, que está ignorado pelo Git. O arquivo seguro para versionamento é `secrets.example.h`.

Para preparar outra máquina:

1. copie `secrets.example.h` para `secrets.h`;
2. preencha Wi-Fi, IP/host do broker, porta e usuário MQTT;
3. instale no Arduino IDE 2 a plataforma **esp32 by Espressif Systems**, série 3.x;
4. instale **ArduinoJson 7.x** e **PubSubClient 2.8.x**;
5. selecione `ESP32 Dev Module` e execute primeiro `Sketch > Verify/Compile`.

Não publique `secrets.h`, logs seriais com credenciais ou um binário destinado a distribuição pública com as credenciais embutidas.

## Sensores XGZP6847D: bloqueio intencional

O seed da API cita `XGZP6847D001MP`. Se esse código representar a variante positiva de 0–1000 kPa, ela não mede o vácuo de aproximadamente `-80 kPa`. Por isso `VACUUM_SENSOR_CONFIGURATION_CONFIRMED` permanece `false`.

Antes de alterar para `true`, confirme fisicamente:

- o código completo gravado no componente;
- a faixa e o tipo de pressão (negativa, relativa ou diferencial);
- a revisão/protocolo (`0x58` V3 ou `0x6D` legado);
- a equação, o fator `K` quando legado e a unidade;
- a calibração com referência conhecida em vários pontos da faixa.

Enquanto isso, o firmware permite diagnóstico, mas recusa `INICIAR_PROCESSO_VACUO` com `CALIBRACAO_PENDENTE`. Remover esse bloqueio sem confirmar a peça real seria inseguro.

## Compatibilidade MQTT com a API

O sketch assina inicialmente:

- `tsea/config`;
- `tsea/comandos`.

Depois do `SYNC_CONFIG`, ele usa os tópicos entregues pela própria API. Publica em ACKs, heartbeat, status, leituras, acoplamentos e alarmes.

`INICIAR_PROCESSO_VACUO` valida e carrega o contexto, sem acionar saídas. A API abre as válvulas e liga a bomba por comandos individuais após cada ACK. O ACK `EXECUTADO` confirma o nível elétrico aplicado ao GPIO; confirmação mecânica real exige feedback de posição, corrente ou rotação.

O PubSubClient publica mensagens normais em QoS 0. O cache por `correlation_id` evita reexecução, mas não transforma o transporte do ACK em QoS 1. Para essa garantia de transporte, use futuramente um cliente MQTT que publique QoS 1, como o cliente nativo do ESP-IDF.

## Segurança elétrica e sequência de bancada

- Não ligue bombas, solenoides, relés ou contatores diretamente nos GPIOs.
- Use drivers dimensionados, diodo flyback nas cargas DC, fusível, aterramento e isolamento apropriado.
- Use resistores externos que mantenham todos os drivers desligados durante boot/reset.
- O botão de emergência deve também interromper fisicamente a energia dos contatores; a leitura pelo ESP32 serve como supervisão e trava lógica, não como único circuito de segurança.
- Teste primeiro com LEDs e cargas desconectadas.
- Confirme que boot, reset, perda de Wi-Fi/broker, desacoplamento e emergência deixam as oito saídas desligadas.
- Só depois valide atuadores reais, um por vez, com limites elétricos reduzidos.

## Documentação técnica

- [Instalação do Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html)
- [GPIO do Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html)
- [ArduinoJson 7](https://arduinojson.org/v7/)
- [PubSubClient](https://github.com/knolleary/pubsubclient)
- [PCF8574 — Texas Instruments](https://www.ti.com/lit/ds/symlink/pcf8574.pdf)
- [TCA9548A — Texas Instruments](https://www.ti.com/lit/ds/symlink/tca9548a.pdf)
- [XGZP6847D V3.0 — CFSensor](https://cfsensor.com/wp-content/uploads/2026/04/XGZP6847D-Pressure-Sensor-V3.0.pdf)
