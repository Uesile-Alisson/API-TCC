# Firmware ESP32 TSEA — seis válvulas

O sketch [`esp32_tsea.ino`](./esp32_tsea.ino) implementa a Fase 2 para um **ESP32 Dev Module / ESP32-WROOM** e o contrato MQTT v2 atual da API. O arquivo pode ser aberto diretamente no Arduino IDE porque a pasta e o `.ino` possuem o mesmo nome.

## O que está implementado

- seis saídas independentes: `VP_T1`, `VA_T1`, `VP_T2`, `VA_T2`, `VP_T3` e `VA_T3`;
- bomba principal digital e bomba auxiliar por PWM local;
- três sensores individuais de vácuo `VACUO_T1..T3` via I²C;
- três entradas digitais de acoplamento `ACOP_T1..T3`;
- `SYNC_CONFIG` com resolução dos IDs reais por `codigo_hardware`;
- comandos v2 e compatibilidade de leitura dos IDs em `parametros` ou na raiz;
- ACKs `RECEBIDO`, `EXECUTADO` e `RECUSADO` com cache de `correlation_id`;
- heartbeat, status das seis válvulas e duas bombas, leituras diagnósticas/de processo, acoplamentos e alarmes;
- parada local por desacoplamento, sensor inválido, limite de vácuo, emergência e timeout MQTT;
- intertravamentos da bomba principal, bomba auxiliar, válvulas e troca de processo;
- TLS opcional com validação de CA — não existe fallback inseguro;
- nenhum payload MQTT contém potenciômetro, percentual ou duty de PWM.

## Antes de compilar

1. No Arduino IDE 2, instale a plataforma **esp32 by Espressif Systems**, série 3.x, pelo Boards Manager. A URL estável oficial do pacote é:

   ```text
   https://espressif.github.io/arduino-esp32/package_esp32_index.json
   ```

2. Pelo Library Manager, instale:

   - **ArduinoJson**, série 7.x;
   - **PubSubClient**, série 2.8.x.

3. Selecione `Tools > Board > esp32 > ESP32 Dev Module`.

4. No início do `.ino`, altere obrigatoriamente:

   - `WIFI_SSID` e `WIFI_PASSWORD`;
   - `MQTT_HOST`, `MQTT_PORT`, `MQTT_USERNAME` e `MQTT_PASSWORD`;
   - níveis ativos dos drivers/reles;
   - faixa, revisão e arquitetura I²C dos sensores;
   - `VACUUM_SENSOR_CONFIGURATION_CONFIRMED`, somente depois da validação física.

5. Use primeiro `Sketch > Verify/Compile`. Grave no ESP32 apenas depois de conferir toda a pinagem com o equipamento desenergizado.

## Pinagem padrão

| Função | GPIO | Observação |
|---|---:|---|
| `VP_T1` | 13 | saída para driver da válvula |
| `VA_T1` | 14 | saída para driver da válvula |
| `VP_T2` | 16 | saída; reservada à PSRAM em alguns WROVER |
| `VA_T2` | 17 | saída; reservada à PSRAM em alguns WROVER |
| `VP_T3` | 18 | saída para driver da válvula |
| `VA_T3` | 19 | saída para driver da válvula |
| Bomba principal | 23 | saída para relé/contator/driver |
| Bomba auxiliar PWM | 25 | LEDC a 20 kHz, 8 bits |
| `ACOP_T1` | 26 | `INPUT_PULLUP`, ativo em nível baixo |
| `ACOP_T2` | 27 | `INPUT_PULLUP`, ativo em nível baixo |
| `ACOP_T3` | 32 | `INPUT_PULLUP`, ativo em nível baixo |
| Potenciômetro auxiliar | 33 | ADC1; faixa local 0–3,1 V |
| I²C SDA | 21 | barramento dos sensores/TCA9548A |
| I²C SCL | 22 | barramento dos sensores/TCA9548A |
| Emergência opcional | 34 | exige resistor externo; desabilitada por padrão |

Essa pinagem é para ESP32-WROOM. Se a placa for WROVER, S2, S3, C3 ou outra variante, os pinos precisam ser redesenhados conforme o datasheet da placa.

## Sensores XGZP6847D: validação obrigatória

O seed da API cadastra três sensores `XGZP6847D001MP` como I²C. Existem dois riscos que o firmware trata de forma explícita:

1. Três sensores da mesma revisão usam o mesmo endereço. O padrão do sketch pressupõe um **TCA9548A no endereço `0x70`**, com os sensores nos canais 0, 1 e 2.
2. Se `XGZP6847D001MP` representar literalmente a variante positiva de 0–1000 kPa, ela não mede o vácuo de `-80 kPa`. Para a faixa `-100..0 kPa`, confirme uma variante negativa apropriada, como a família com sufixo `100KPGN`, e corrija cadastro/constantes para refletirem o componente real.

O driver detecta:

- revisão V3 atual no endereço `0x58`, usando os registradores `0x04..0x06` e a fórmula de 21 bits da documentação atual;
- revisão legada no endereço `0x6D`, desde que o `K` exato da peça seja informado e `XGZP_LEGACY_K_CONFIRMED` seja ativado.

Enquanto `VACUUM_SENSOR_CONFIGURATION_CONFIRMED` estiver `false`, o ESP32 pode diagnosticar a comunicação, mas recusa `INICIAR_PROCESSO_VACUO` com `CALIBRACAO_PENDENTE`. Esse bloqueio é intencional.

Alimente sensores e pull-ups I²C em **3,3 V**. Não deixe SDA/SCL receberem pull-up de 5 V diretamente no ESP32.

## Ligações de potência

- GPIO não alimenta válvula, bomba, bobina de relé ou contator.
- Use driver dimensionado, isolamento quando necessário, fusível, aterramento e diodo flyback nas cargas indutivas DC.
- O IRF520 normalmente não é a melhor escolha com gate de 3,3 V. Prefira MOSFET logic-level dimensionado para a corrente/tensão da bomba e valide dissipação e partida.
- Instale resistores externos que mantenham todas as saídas no estado seguro durante boot/reset, principalmente se os módulos de relé forem ativos em nível baixo.
- A parada por software não substitui botão de emergência, contator de segurança ou proteções elétricas certificadas.

## Compatibilidade com a API

O sketch assina os tópicos entregues no `SYNC_CONFIG`, inicialmente:

- `tsea/config`;
- `tsea/comandos`.

Ele publica em:

- `tsea/acks`;
- `tsea/heartbeat`;
- `tsea/status`;
- `tsea/leituras`;
- `tsea/acoplamentos`;
- `tsea/alarmes`.

`INICIAR_PROCESSO_VACUO` somente valida e carrega o contexto operacional. Depois do ACK `EXECUTADO`, a API abre cada `VP_Tn` selecionada e liga a bomba principal por comandos individuais, aguardando o ACK final de cada etapa. Por isso `START_COMMAND_ACTUATES_MAIN_LINE` permanece `false`.

O campo `ack: true` no status e o ACK `EXECUTADO` significam que a saída elétrica foi comandada pelo ESP32. Confirmação física real exige sensor de posição nas válvulas e sensor de corrente/rotação nas bombas.

### Limite atual de QoS

O PubSubClient recebe os comandos com assinatura QoS 1 e o Last Will usa QoS 1, mas a API de publicação dessa biblioteca envia mensagens normais em QoS 0. A API aguarda o ACK de aplicação e falha com segurança quando ele não chega; ainda assim, o transporte do ACK não possui a garantia de entrega de QoS 1. Para aumentar essa garantia, migre o transporte do firmware para um cliente que publique QoS 1 (por exemplo, o cliente MQTT nativo do ESP-IDF). A idempotência local por `correlation_id` evita executar novamente um comando já processado.

## Sequência de bancada recomendada

1. Teste com LEDs no lugar dos drivers de potência.
2. Confirme que boot, reset, perda de Wi-Fi e perda do broker deixam as oito saídas desligadas.
3. Confirme individualmente os seis códigos de válvula usando `SYNC_CONFIG` e comandos MQTT.
4. Valide os três acoplamentos e as três leituras sem processo.
5. Calibre cada sensor com referência conhecida em vários pontos da faixa.
6. Teste cada intertravamento com cargas desconectadas.
7. Só então conecte drivers, válvulas e bombas, começando com limites elétricos reduzidos e parada física disponível.

## Fontes técnicas usadas

- [Instalação do Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html)
- [Wi-Fi API do Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/wifi.html)
- [GPIO API do Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html)
- [LEDC/PWM API do Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html)
- [ADC API do Arduino-ESP32](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html)
- [ArduinoJson 7](https://arduinojson.org/v7/)
- [PubSubClient](https://github.com/knolleary/pubsubclient)
- [XGZP6847D V3.0 — CFSensor](https://cfsensor.com/wp-content/uploads/2026/04/XGZP6847D-Pressure-Sensor-V3.0.pdf)
